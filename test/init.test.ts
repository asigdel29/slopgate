// Checks `slopgate init`, which writes into a repository that the user owns.
//
// Two properties must hold: a second run changes nothing that exists, and
// --force restores the kit. The rule links must resolve, or Claude Code loads
// no rule at all. One test runs the real CLI entry point, to prove that `init`
// reaches runInit.

import { afterAll, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_DIR } from "../src/config.ts";
import { ruleLink, runInit } from "../src/init.ts";
import { withTempDir } from "../src/process.ts";
import { captureConsole } from "./helpers.ts";

const target = await mkdtemp(join(tmpdir(), "slopgate-init-"));

afterAll(async () => {
	await rm(target, { recursive: true, force: true });
});

/** Runs init in this process with `argv` and returns what it printed. Throws what init throws. */
async function init(...argv: string[]): Promise<string> {
	const run = await captureConsole(() => runInit(argv));
	if (!run.ok) throw run.thrown;
	return run.out;
}

/** Every path under the package's .claude folder, to prove that nothing was removed. */
function listKit(): Promise<string[]> {
	return Array.fromAsync(new Bun.Glob("**/*").scan(join(PACKAGE_DIR, ".claude")));
}

describe("slopgate init", () => {
	test("writes the config, the workflow, the rules, the skills and the rule links", async () => {
		const out = await init("--root", target);
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
		const out = await init("--root", target);
		expect(out).toContain("skipped  slop.config.json");
		expect(out).not.toContain("created");
		expect(await readFile(config, "utf8")).toBe("{}\n");
	});

	test("--help prints the usage, even next to a bad flag, and writes nothing", async () => {
		await withTempDir("slopgate-init-help-", async (empty) => {
			expect(await init("--root", empty, "--bogus", "--help")).toContain(
				"slopgate init [--root <dir>]",
			);
			expect(await readdir(empty)).toEqual([]);
		});
	});

	test("an unknown argument fails and writes nothing", async () => {
		await withTempDir("slopgate-init-bad-", async (empty) => {
			await expect(init("--root", empty, "--bogus")).rejects.toThrow("--bogus");
			expect(await readdir(empty)).toEqual([]);
		});
	});

	test("refuses to run on the slopgate package itself", async () => {
		const before = await listKit();
		await expect(init("--root", PACKAGE_DIR, "--force")).rejects.toThrow("slopgate package itself");
		expect((await listKit()).toSorted()).toEqual(before.toSorted());
	});

	test("--force overwrites a local edit and replaces each link", async () => {
		const out = await init("--root", target, "--force");
		expect(out).not.toContain("skipped");
		expect(await readFile(join(target, "slop.config.json"), "utf8")).toContain("maxDelta");
		expect((await lstat(join(target, ".claude/rules/comments.md"))).isSymbolicLink()).toBe(true);
	});

	test("the CLI routes the init command to runInit", async () => {
		const cli = join(PACKAGE_DIR, "bin/slopgate.ts");
		const run = await Bun.$`bun ${cli} init --root ${target}`.quiet();
		expect(run.stdout.toString()).toContain("Next steps");
	});
});
