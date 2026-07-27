// File discovery and source-line classification.
//
// "Source line" here means what Radon's `sloc` means, which is what the paper's
// LOC denominator (Eq. 4) and per-callable SLOC (Eq. 2) are both defined over: a
// line carrying code, with blank lines and comment-only lines excluded.
//
// Classification runs on the UTF-8 byte buffer rather than a decoded JS string,
// because ast-grep reports byte offsets. Decoding first would desynchronise the
// two on any file containing non-ASCII text.

import { Glob } from "bun";
import type { FileMeasurement, Language, LanguageConfig } from "./config.ts";
import type { Match } from "./scan.ts";

const SPACE = 0x20;
const TAB = 0x09;
const CR = 0x0d;
const LF = 0x0a;

function isWhitespaceByte(b: number): boolean {
	return b === SPACE || b === TAB || b === CR || b === LF;
}

/**
 * Resolve a language's include/exclude globs to a sorted, de-duplicated list of
 * repo-relative paths. Sorting makes the whole run deterministic, so two runs on
 * the same tree produce byte-identical reports.
 */
export async function resolveFiles(cfg: LanguageConfig, root: string): Promise<string[]> {
	const found = new Set<string>();

	for (const pattern of cfg.include) {
		const glob = new Glob(pattern);
		for await (const file of glob.scan({ cwd: root, onlyFiles: true, dot: false })) {
			found.add(file);
		}
	}

	const excludes = (cfg.exclude ?? []).map((p) => new Glob(p));
	const kept = [...found].filter((file) => !excludes.some((g) => g.match(file)));

	return kept.sort();
}

/**
 * Classify every line of `file` as source or not, given the comment spans
 * ast-grep found in it.
 *
 * A line counts when it has at least one non-whitespace byte that is not inside
 * a comment. That handles trailing comments (`foo() // why`) correctly — the
 * line is code — and comment-only lines correctly — the line is not.
 */
export function classifyLines(contents: Buffer, commentSpans: Array<[number, number]>): Set<number> {
	// Byte-indexed mask of comment coverage. One pass over the spans beats a
	// per-byte search through them, and files here are small enough that the
	// allocation is irrelevant.
	const inComment = new Uint8Array(contents.length);
	for (const [start, end] of commentSpans) {
		const from = Math.max(0, start);
		const to = Math.min(contents.length, end);
		for (let i = from; i < to; i++) inComment[i] = 1;
	}

	const sourceLines = new Set<number>();
	let line = 0;
	let lineHasCode = false;

	for (let i = 0; i < contents.length; i++) {
		const byte = contents[i] as number;
		if (byte === LF) {
			if (lineHasCode) sourceLines.add(line);
			line++;
			lineHasCode = false;
			continue;
		}
		if (!lineHasCode && inComment[i] === 0 && !isWhitespaceByte(byte)) {
			lineHasCode = true;
		}
	}
	// A final line with no trailing newline still counts.
	if (lineHasCode) sourceLines.add(line);

	return sourceLines;
}

/**
 * Measure every file: read it, apply the comment spans from the structural scan,
 * and record its source lines.
 */
export async function measureFiles(
	files: string[],
	language: Language,
	commentMatches: Match[],
	root: string,
): Promise<FileMeasurement[]> {
	const commentsByFile = new Map<string, Array<[number, number]>>();
	for (const m of commentMatches) {
		const spans = commentsByFile.get(m.file) ?? [];
		spans.push([m.range.byteOffset.start, m.range.byteOffset.end]);
		commentsByFile.set(m.file, spans);
	}

	const measurements: FileMeasurement[] = [];
	for (const file of files) {
		const contents = Buffer.from(await Bun.file(`${root}/${file}`).arrayBuffer());
		const sourceLines = classifyLines(contents, commentsByFile.get(file) ?? []);
		measurements.push({ file, language, loc: sourceLines.size, sourceLines });
	}

	return measurements;
}
