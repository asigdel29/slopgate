// Checks `slopgate init`, which writes into a repository that the user owns.
//
// Two properties must hold: a second run changes nothing that exists, and
// --force restores the kit. The rule links must resolve, or Claude Code loads
// no rule at all. The last suite runs the real CLI entry point, to prove that
// `init` reaches runInit and that a bad argument writes nothing.

import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { lstat, mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/init.ts";

const CLI = join(import.meta.dir, "../bin/slopgate.ts");
const target = await mkdtemp(join(tmpdir(), "slopgate-init-"));

afterAll(async () => {
	await rm(target, { recursive: true, force: true });
});

/** Runs init in this process on the temp target and returns its exit code and printed lines. */
async function init(...args: string[]): Promise<{ code: number; out: string }> {
	const log = spyOn(console, "log").mockImplementation(() => {});
	try {
		const code = await runInit(["--root", target, ...args]);
		return { code, out: log.mock.calls.map((call) => String(call[0])).join("\n") };
	} finally {
		log.mockRestore();
	}
}

describe("slopgate init", () => {
	test("writes the config, the workflow, the rules, the skills and the rule links", async () => {
		const { code, out } = await init();
		expect(code).toBe(0);
		expect(out).not.toContain("skipped");
		for (const path of [
			"slop.config.json",
			".github/workflows/slopgate.yml",
			".github/instructions/slop-gate.instructions.md",
			".claude/skills/fixit/SKILL.md",
			".claude/skills/fixit/LICENSE",
		]) {
			expect(out).toContain(`created  ${path}`);
		}
		const link = join(target, ".claude/rules/slop-gate.md");
		expect((await lstat(link)).isSymbolicLink()).toBe(true);
		expect(await readlink(link)).toBe("../../.github/instructions/slop-gate.instructions.md");
		expect(await readFile(link, "utf8")).toContain("slop gate");
	});

	test("a second run skips every path and keeps a local edit", async () => {
		const config = join(target, "slop.config.json");
		await writeFile(config, "{}\n");
		const { code, out } = await init();
		expect(code).toBe(0);
		expect(out).toContain("skipped  slop.config.json");
		expect(out).not.toContain("created");
		expect(await readFile(config, "utf8")).toBe("{}\n");
	});

	test("--help prints the usage, exits 0 and writes nothing", async () => {
		const log = spyOn(console, "log").mockImplementation(() => {});
		try {
			expect(await runInit(["--help"])).toBe(0);
			expect(String(log.mock.calls[0]?.[0])).toContain("slopgate init [--root <dir>]");
		} finally {
			log.mockRestore();
		}
	});

	test("refuses to run on the slopgate package itself", async () => {
		const files = await Array.fromAsync(
			new Bun.Glob("**/*").scan({ cwd: join(import.meta.dir, "..", ".claude") }),
		);
		await expect(runInit(["--root", join(import.meta.dir, ".."), "--force"])).rejects.toThrow(
			"slopgate package itself",
		);
		const after = await Array.fromAsync(
			new Bun.Glob("**/*").scan({ cwd: join(import.meta.dir, "..", ".claude") }),
		);
		expect(after.toSorted()).toEqual(files.toSorted());
	});

	test("--force overwrites a local edit and replaces each link", async () => {
		const { code, out } = await init("--force");
		expect(code).toBe(0);
		expect(out).not.toContain("skipped");
		expect(await readFile(join(target, "slop.config.json"), "utf8")).toContain("maxDelta");
		expect((await lstat(join(target, ".claude/rules/comments.md"))).isSymbolicLink()).toBe(true);
	});
});

describe("slopgate init through the CLI", () => {
	test("the init command reaches init and prints the next steps", async () => {
		const proc = Bun.spawn(["bun", CLI, "init", "--root", target], { stdout: "pipe" });
		expect(await proc.exited).toBe(0);
		expect(await new Response(proc.stdout).text()).toContain("Next steps");
	});

	test("an unknown argument fails and writes nothing", async () => {
		const empty = await mkdtemp(join(tmpdir(), "slopgate-init-bad-"));
		try {
			const proc = Bun.spawn(["bun", CLI, "init", "--bogus"], {
				cwd: empty,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(await proc.exited).not.toBe(0);
			expect(await readdir(empty)).toEqual([]);
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});
});
