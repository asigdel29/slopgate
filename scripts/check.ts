// Quiet runner: run package scripts in order and print one line for each.
//
// `bun run check` uses it, because the gate's steps print hundreds of lines on a
// pass that a reader must otherwise scan. Only a failing step's log is printed.
// `VERBOSE=1` streams every step. CI runs the steps on their own, unchanged.
//
// Usage: `bun scripts/check.ts <script>...`

/** True when the caller asks for the full output of every step. */
const VERBOSE = Bun.env.VERBOSE === "1";

/**
 * Runs one package script and returns its exit code. `exec ... 2>&1` merges
 * stderr into stdout, so a failure log keeps the order that the step wrote it in.
 */
async function runStep(name: string): Promise<number> {
	const step = Bun.spawn(["sh", "-c", 'exec bun run "$0" 2>&1', name], {
		stdout: VERBOSE ? "inherit" : "pipe",
	});
	const log = step.stdout instanceof ReadableStream ? await new Response(step.stdout).text() : "";
	const code = await step.exited;
	console.log(`${code === 0 ? "✓" : "✗"} ${name}`);
	if (code !== 0) {
		// Awaited, because a write to a pipe that is still in flight when the process ends is cut off.
		await Bun.write(Bun.stdout, log);
	}
	return code;
}

// The steps run one after another and stop at the first failure, as `&&` does.
// exitCode, not process.exit(): the process ends after all output is flushed.
for (const name of Bun.argv.slice(2)) {
	process.exitCode = await runStep(name);
	if (process.exitCode !== 0) break;
}
