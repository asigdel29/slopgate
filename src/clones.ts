// Structural duplication — the clone half of Eq. 4.
//
// The paper measures "structural duplication as clone lines normalized by LOC".
// jscpd is the clone detector here because it is token-based (so it sees through
// renamed identifiers, which is what "structural" means) and covers
// TypeScript, Swift and Kotlin with one tool.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileMeasurement } from "./config.ts";
import { runTool, withTempDir } from "./process.ts";
import { relativeTo, sourceLineKeys } from "./sources.ts";
import { resolveTool } from "./tools.ts";

/**
 * Clone-detection sensitivity. Pinned explicitly rather than left to jscpd's
 * defaults so the number cannot shift under us when the dependency is upgraded —
 * a silent change here would look exactly like a code-quality regression.
 */
const MIN_LINES = 5;
const MIN_TOKENS = 50;

type JscpdFileRef = { name: string; start: number; end: number };
type JscpdReport = {
	duplicates?: Array<{ firstFile: JscpdFileRef; secondFile: JscpdFileRef }>;
};

/**
 * Return the set of duplicated lines, keyed `file:line` with zero-based lines to
 * match everything else in the engine.
 *
 * Clone lines are intersected with the file's SOURCE lines. A reported clone
 * fragment spans whole lines including blanks and comments, but Eq. 4's
 * denominator counts source lines only — without the intersection the ratio
 * could exceed 1, which the paper explicitly states it cannot.
 */
export async function findCloneLines(
	measurements: FileMeasurement[],
	root: string,
): Promise<Set<string>> {
	const cloneLines = new Set<string>();
	// jscpd skips each file shorter than --min-lines, and when it skips them all
	// it exits 0 and writes no report. Leave those files out here instead, so
	// a missing report is always a fault. The result is the same.
	const eligible = measurements.filter((m) => m.lineCount >= MIN_LINES);
	if (eligible.length === 0) return cloneLines;

	const report = await withTempDir("slop-jscpd-", async (reportDir) => {
		// The whole file list goes in one invocation, deliberately unbatched:
		// clone detection is inherently cross-file, so splitting it would drop
		// every clone spanning a batch boundary. That makes argv length a real
		// ceiling on repository size; runTool reports E2BIG as itself rather than
		// as a missing-tool error.
		await runTool({
			...resolveTool("jscpd", root),
			args: [
				...eligible.map((m) => m.file),
				"--reporters",
				"json",
				"--output",
				reportDir,
				"--min-lines",
				String(MIN_LINES),
				"--min-tokens",
				String(MIN_TOKENS),
				"--silent",
			],
			cwd: root,
		});
		const path = join(reportDir, "jscpd-report.json");
		const text = await readFile(path, "utf8");
		try {
			return JSON.parse(text) as JscpdReport;
		} catch (err) {
			throw new Error(`jscpd wrote an unreadable report at ${path}: ${(err as Error).message}`, {
				cause: err,
			});
		}
	});

	const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));
	for (const duplicate of report.duplicates ?? []) {
		for (const ref of [duplicate.firstFile, duplicate.secondFile]) {
			const file = relativeTo(root, ref.name);
			// jscpd lines are 1-based and inclusive.
			const keys = sourceLineKeys({
				file,
				sourceLines: sourceLinesByFile.get(file),
				startLine: ref.start - 1,
				endLine: ref.end - 1,
			});
			for (const key of keys) cloneLines.add(key);
		}
	}

	return cloneLines;
}
