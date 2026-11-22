// Checks the quiet runner in scripts/check.ts, which `bun run check` uses. A
// passing step must print one line, the first failing step must print its whole
// output and stop the chain with its exit code, and VERBOSE=1 must stream.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNNER = join(import.meta.dir, "../../scripts/check.ts");
const scratch = await mkdtemp(join(tmpdir(), "run-silent-"));

/** Package scripts for the runner: two that pass, one that fails with code 3, and one that fails after 2 MB of output. */
const SCRIPTS = {
	ok: "echo ok-output",
	bad: "echo bad-output && echo bad-error >&2 && exit 3",
	after: "echo after-output",
	big: "head -c 2000000 /dev/zero | tr '\\0' x && echo && echo big-end && exit 4",
};

await writeFile(
	join(scratch, "package.json"),
	JSON.stringify({ name: "run-silent-fixture", scripts: SCRIPTS }),
);

afterAll(async () => {
	await rm(scratch, { recursive: true, force: true });
});

/** Runs the runner in the fixture folder and returns its exit code, stdout and stderr. */
async function run(
	names: string[],
	env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> {
	const proc = Bun.spawn(["bun", RUNNER, ...names], {
		cwd: scratch,
		env: { ...process.env, VERBOSE: "", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { code: await proc.exited, out, err };
}

describe("run-silent", () => {
	test("a passing step prints one line and hides its output", async () => {
		const { code, out } = await run(["ok"]);
		expect(code).toBe(0);
		expect(out.trim()).toBe("✓ ok");
	});

	test("the first failing step prints its output, keeps its exit code and stops the chain", async () => {
		const { code, out, err } = await run(["ok", "bad", "after"]);
		expect(code).toBe(3);
		expect(err).toBe("");
		expect(out).toContain("✓ ok");
		expect(out).toContain("✗ bad");
		expect(out).toContain("bad-output");
		expect(out).toContain("bad-error");
		expect(out).not.toContain("ok-output");
		expect(out).not.toContain("after");
	});

	test("a large failure log arrives whole through a pipe", async () => {
		const { code, out } = await run(["big"]);
		expect(code).toBe(4);
		expect(out.length).toBeGreaterThan(2_000_000);
		expect(out.lastIndexOf("big-end")).toBeGreaterThan(2_000_000);
	});

	test("VERBOSE=1 streams the output of each step and still marks each step", async () => {
		const { code, out } = await run(["ok", "after"], { VERBOSE: "1" });
		expect(code).toBe(0);
		expect(out).toContain("ok-output");
		expect(out).toContain("✓ after");
	});
});
