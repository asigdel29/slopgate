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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A tool that ran and exited with a non-zero code. The code lets a caller treat
 * one exit as an answer, for example `git merge-base` exits 1 when there is no
 * common ancestor, and every other exit as a fault.
 */
export class ToolExitError extends Error {
	/** The tool's exit code, or null when a signal stopped it. */
	readonly exitCode: number | null;

	/** A failure with `message`, which carries the tool's own output, and its exit code. */
	constructor(message: string, exitCode: number | null) {
		super(message);
		this.exitCode = exitCode;
	}
}

/** What a finished run wrote to its two streams. */
type RunResult = { stdout: string; stderr: string };

/**
 * One tool run: the binary, its arguments, a name for messages, the working
 * folder, and a hint that explains a tool that could not be started.
 */
type Run = { bin: string; args: string[]; name: string; cwd: string; missingHint?: string };

/**
 * Run `fn` with a new empty directory under the system temp folder, and remove
 * the directory afterwards, also when `fn` throws.
 */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

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
export function runTool({ bin, args, name: tool, cwd, missingHint }: Run): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			cwd,
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
			reject(
				new Error(`could not run ${tool}: ${err.message}${missingHint ? `\n${missingHint}` : ""}`),
			);
		});

		child.on("close", (code) => {
			if (code !== 0) {
				// jscpd reports failures on stdout, ast-grep on stderr. Include both
				// rather than guessing which one carries the message.
				const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
				reject(new ToolExitError(`${tool} exited ${code}${detail ? `: ${detail}` : ""}`, code));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}
