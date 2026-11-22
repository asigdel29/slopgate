// Checks `slopgate init`, which writes into a repository that the user owns.
//
// Two properties must hold: a second run changes nothing that exists, and
// --force restores the kit. The rule links must resolve, or Claude Code loads
// no rule at all. One test runs the real CLI entry point, to prove that `init`
// reaches runInit.

import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { lstat, mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ruleLink, runInit } from "../src/init.ts";
import { PACKAGE_DIR } from "../src/measure.ts";

const target = await mkdtemp(join(tmpdir(), "slopgate-init-"));

afterAll(async () => {
	await rm(target, { recursive: true, force: true });
});

/** Runs init in this process on the temp target and returns what it printed. */
async function init(...args: string[]): Promise<string> {
	const log = spyOn(console, "log").mockImplementation(() => {});
	try {
		await runInit(["--root", target, ...args]);
		return log.mock.calls.map((call) => String(call[0])).join("\n");
	} finally {
		log.mockRestore();
	}
}

/** Every path under the package's .claude folder, to prove that nothing was removed. */
function listKit(): Promise<string[]> {
	return Array.fromAsync(new Bun.Glob("**/*").scan(join(PACKAGE_DIR, ".claude")));
}

describe("slopgate init", () => {
	test("writes the config, the workflow, the rules, the skills and the rule links", async () => {
		const out = await init();
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
		expect(await readlink(link)).toBe(ruleLink("slop-gate"));
		expect(await readFile(link, "utf8")).toContain("slop gate");
	});

	test("a second run skips every path and keeps a local edit", async () => {
		const config = join(target, "slop.config.json");
		await writeFile(config, "{}\n");
		const out = await init();
		expect(out).toContain("skipped  slop.config.json");
		expect(out).not.toContain("created");
		expect(await readFile(config, "utf8")).toBe("{}\n");
	});

	test("--help prints the usage and writes nothing", async () => {
		const empty = await mkdtemp(join(tmpdir(), "slopgate-init-help-"));
		try {
			const log = spyOn(console, "log").mockImplementation(() => {});
			await runInit(["--root", empty, "--help"]);
			expect(String(log.mock.calls[0]?.[0])).toContain("slopgate init [--root <dir>]");
			log.mockRestore();
			expect(await readdir(empty)).toEqual([]);
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	test("an unknown argument fails and writes nothing", async () => {
		const empty = await mkdtemp(join(tmpdir(), "slopgate-init-bad-"));
		try {
			await expect(runInit(["--root", empty, "--bogus"])).rejects.toThrow("--bogus");
			expect(await readdir(empty)).toEqual([]);
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	test("refuses to run on the slopgate package itself", async () => {
		const before = await listKit();
		await expect(runInit(["--root", PACKAGE_DIR, "--force"])).rejects.toThrow(
			"slopgate package itself",
		);
		expect((await listKit()).toSorted()).toEqual(before.toSorted());
	});

	test("--force overwrites a local edit and replaces each link", async () => {
		const out = await init("--force");
		expect(out).not.toContain("skipped");
		expect(await readFile(join(target, "slop.config.json"), "utf8")).toContain("maxDelta");
		expect((await lstat(join(target, ".claude/rules/comments.md"))).isSymbolicLink()).toBe(true);
	});

	test("the CLI routes the init command to runInit", async () => {
		const cli = join(PACKAGE_DIR, "bin/slopgate.ts");
		const proc = Bun.spawn(["bun", cli, "init", "--root", target], { stdout: "pipe" });
		expect(await proc.exited).toBe(0);
		expect(await new Response(proc.stdout).text()).toContain("Next steps");
	});
});
