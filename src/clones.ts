// Structural duplication — the clone half of Eq. 4.
//
// The paper measures "structural duplication as clone lines normalized by LOC".
// jscpd is the clone detector here because it is token-based (so it sees through
// renamed identifiers, which is what "structural" means) and covers both
// TypeScript and Swift with one tool.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeMissing, resolveTool } from "./bin.ts";
import type { FileMeasurement } from "./config.ts";

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

function run(bin: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (err) => {
			reject(new Error(`${describeMissing("jscpd", cwd)}\n(${err.message})`));
		});
		// jscpd exits non-zero when a threshold is configured and exceeded. We
		// configure no threshold — the gate owns that decision — so any non-zero
		// exit is a genuine failure.
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`jscpd exited ${code}: ${stderr.trim()}`));
				return;
			}
			resolve();
		});
	});
}

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
	if (measurements.length === 0) return cloneLines;

	const reportDir = await mkdtemp(join(tmpdir(), "slop-jscpd-"));
	try {
		await run(
			resolveTool("jscpd", root),
			[
				...measurements.map((m) => m.file),
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
			root,
		);

		const raw = await readFile(join(reportDir, "jscpd-report.json"), "utf8");
		const report = JSON.parse(raw) as JscpdReport;

		const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));

		for (const duplicate of report.duplicates ?? []) {
			for (const ref of [duplicate.firstFile, duplicate.secondFile]) {
				// jscpd paths may come back absolute or root-relative depending on
				// how it resolved the input; normalise before keying.
				const file = ref.name.startsWith(`${root}/`) ? ref.name.slice(root.length + 1) : ref.name;
				const sourceLines = sourceLinesByFile.get(file);
				if (!sourceLines) continue;

				// jscpd lines are 1-based and inclusive.
				for (let line = ref.start; line <= ref.end; line++) {
					const zeroBased = line - 1;
					if (sourceLines.has(zeroBased)) cloneLines.add(`${file}:${zeroBased}`);
				}
			}
		}
	} finally {
		await rm(reportDir, { recursive: true, force: true });
	}

	return cloneLines;
}
