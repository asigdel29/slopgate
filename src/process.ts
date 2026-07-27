// One place to spawn an external analyser.
//
// This exists because there were two near-identical spawn wrappers — one in
// scan.ts, one in clones.ts — and the small divergence between them was a real
// bug: scan.ts drained stdout, clones.ts did not, and jscpd writes its errors to
// stdout. So a jscpd misconfiguration surfaced as `jscpd exited 1:` with nothing
// after the colon, and a stdout write past the pipe buffer would have blocked
// the child forever.
//
// Both streams are always drained here, and both are included in the error.

import { spawn } from "node:child_process";
import { describeMissing, type ToolName } from "./bin.ts";

/** Tools spawned by the engine. `git` is ambient; the analysers are pinned. */
export type SpawnTool = ToolName | "git";

export type RunResult = { stdout: string; stderr: string };

/**
 * Run `bin` and resolve with its output, or reject with everything known about
 * the failure.
 *
 * Any non-zero exit is a hard failure. ast-grep and jscpd both exit 0 on success
 * regardless of how many matches they found (verified for hint- and
 * warning-severity ast-grep rules, and for jscpd with no threshold configured),
 * so a non-zero code always means a genuine fault. Continuing from a partial
 * scan would produce a wrong number that looks like a real one, which is worse
 * than a failed build.
 */
export function runTool(
	tool: SpawnTool,
	bin: string,
	args: string[],
	options: { cwd: string; root: string },
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		// Both listeners are attached unconditionally. A piped stream with no
		// listener stays paused, and the child blocks once it fills the pipe.
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		child.on("error", (err) => {
			// E2BIG means the argument list was too long, not that the tool is
			// missing — reporting it as "not installed" sends the reader off to
			// debug an install problem that does not exist.
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "E2BIG") {
				reject(
					new Error(
						`${tool} could not be started: the argument list is too long ` +
							`(${args.length} arguments). This repository has more files than ` +
							"the OS allows in a single command line.",
					),
				);
				return;
			}
			if (tool === "git") {
				reject(new Error(`could not run git: ${err.message}`));
				return;
			}
			reject(new Error(`${describeMissing(tool, options.root)}\n(${err.message})`));
		});

		child.on("close", (code) => {
			if (code !== 0) {
				// jscpd reports failures on stdout, ast-grep on stderr. Include both
				// rather than guessing which one carries the message.
				const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
				reject(new Error(`${tool} exited ${code}${detail ? `: ${detail}` : ""}`));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}
