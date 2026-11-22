// Checks the gate command: flag parsing, and whole runs on a real git
// repository with a base commit.
//
// The end-to-end runs are what a CI job does: measure the head and the merge
// base, then fail on a new complex function, pass when a reviewed waiver
// covers it, and exit 2 (not 1) when the run itself is broken.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseOptions, runGate } from "../src/cli.ts";
import { PACKAGE_DIR } from "../src/config.ts";
import { captureConsole } from "./helpers.ts";

describe("parseOptions", () => {
	test("defaults to the current folder and its slop.config.json", () => {
		const options = parseOptions([]);
		expect(options.root).toBe(process.cwd());
		expect(options.configPath).toBe(join(process.cwd(), "slop.config.json"));
		expect(options.baseRef).toBeNull();
		expect(options.jsonOut).toBeNull();
	});

	test("resolves --config and --json-out against the current folder, not --root", () => {
		const options = parseOptions(["--root", "/repo", "--config", "c.json", "--json-out", "o.json"]);
		expect(options.root).toBe("/repo");
		expect(options.configPath).toBe(resolve("c.json"));
		expect(options.jsonOut).toBe(resolve("o.json"));
	});

	test("rejects an unknown flag and a flag with no value", () => {
		expect(() => parseOptions(["--bogus"])).toThrow();
		expect(() => parseOptions(["--base"])).toThrow();
	});
});

/** A function with 11 decision points: CC 12, over the cutoff of 10. */
const COMPLEX = `export function route(a: number): number {
	if (a === 1) return 1;
	if (a === 2) return 2;
	if (a === 3) return 3;
	if (a === 4) return 4;
	if (a === 5) return 5;
	if (a === 6) return 6;
	if (a === 7) return 7;
	if (a === 8) return 8;
	if (a === 9) return 9;
	if (a === 10) return 10;
	if (a === 11) return 11;
	return 0;
}
`;

const repo = await mkdtemp(join(tmpdir(), "slopgate-cli-"));

/** Run git in the temp repository with a fixed identity. Throws with git's message on failure. */
async function git(...args: string[]): Promise<void> {
	await Bun.$`git -c user.email=test@example.com -c user.name=test ${args}`.cwd(repo).quiet();
}

/** Commit `source` as src/route.ts on top of the base commit, replacing any earlier head. */
async function commitHead(source: string): Promise<void> {
	await git("reset", "--hard", "--quiet", "base");
	await writeFile(join(repo, "src/route.ts"), source);
	await git("commit", "--quiet", "-am", "head");
}

/** Run the gate in this process on the temp repository, and return its exit code and output. */
async function gate(...args: string[]): Promise<{ code: number; out: string; err: string }> {
	const run = await captureConsole(() => runGate(["--root", repo, ...args]));
	if (!run.ok) throw run.thrown;
	return { code: run.value, out: run.out, err: run.err };
}

beforeAll(async () => {
	await git("init", "--quiet");
	const config = JSON.stringify({
		languages: { typescript: { include: ["src/**/*.ts"] } },
		maxDelta: { erosion: null, verbosity: null },
		hotCallables: true,
		thresholds: { erosion: null, verbosity: null },
		calibratedAtRulePackVersion: 1,
	});
	await Bun.write(join(repo, "slop.config.json"), config);
	await Bun.write(
		join(repo, "src/route.ts"),
		"export function route(a: number): number {\n\treturn a;\n}\n",
	);
	// A package in a subfolder, with its own config, for --root inside a repository.
	await Bun.write(join(repo, "pkg/slop.config.json"), config);
	await Bun.write(join(repo, "pkg/src/one.ts"), "export const one = 1;\n");
	await git("add", ".");
	await git("commit", "--quiet", "-m", "base");
	await git("tag", "base");
});

afterAll(async () => {
	await rm(repo, { recursive: true, force: true });
});

describe("runGate on a git repository", () => {
	test("fails a change that adds a function over CC 10", async () => {
		await commitHead(COMPLEX);
		const { code, err } = await gate("--base", "base");
		expect(code).toBe(1);
		expect(err).toContain("::error file=src/route.ts,line=1::route grew from CC 1 to 12");
	});

	test("passes the same change when a waiver covers the function", async () => {
		await commitHead(`// slopgate-allow: a lookup table, one arm per value\n${COMPLEX}`);
		const { code, err } = await gate("--base", "base");
		expect(code).toBe(0);
		expect(err).toBe("");
	});

	test("fails without --base, because the change was never measured", async () => {
		const { code, err } = await gate();
		expect(code).toBe(1);
		expect(err).toContain("--base was not given");
	});

	test("--json-out writes the head, the base and the hot callables, and still gates", async () => {
		await commitHead(COMPLEX);
		const out = join(repo, "slop.json");
		const { code } = await gate("--base", "base", "--json-out", out);
		expect(code).toBe(1);
		const json = JSON.parse(await readFile(out, "utf8"));
		expect(Object.keys(json).toSorted()).toEqual(["base", "detail", "erosion", "hot", "verbosity"]);
		expect(json.hot).toHaveLength(1);
		expect(json.base.erosion).toBe(0);
	});

	test("measures a tree whose only file is shorter than the clone minimum", async () => {
		await git("reset", "--hard", "--quiet", "base");
		const { code, out } = await gate("--report");
		expect(code).toBe(0);
		expect(out).toContain("0 cloned");
	});

	test("two runs on one tree print identical JSON", async () => {
		const first = await gate("--json");
		const second = await gate("--json");
		expect(first.code).toBe(0);
		expect(second.out).toBe(first.out);
	});

	test("measures the base at the same subfolder as --root", async () => {
		await commitHead(COMPLEX);
		// A repeated flag keeps its last value, so this --root wins.
		const { out } = await gate("--root", join(repo, "pkg"), "--base", "base", "--json");
		const json = JSON.parse(out);
		// Only src/route.ts changed, outside pkg/, so pkg/ is the same on both sides.
		expect(json.detail.files).toBe(1);
		expect(json.base.detail.loc).toBe(json.detail.loc);
	});

	test("a --base that does not exist is an error, not a shallow-clone warning", async () => {
		const run = await captureConsole(() => runGate(["--root", repo, "--base", "no-such-ref"]));
		expect(run.ok).toBe(false);
		expect(run.ok ? "" : String(run.thrown)).toContain("git exited 128");
		expect(run.err).not.toContain("::warning::");
	});

	test("--help prints the usage even next to a bad flag", async () => {
		const { code, out } = await gate("--bogus", "--help");
		expect(code).toBe(0);
		expect(out).toContain("Exit codes: 0 pass");
	});

	test("a broken config exits 2 with one line and no stack trace", async () => {
		const config = join(repo, "bad.json");
		await writeFile(config, JSON.stringify({ languages: {}, hotcallables: true }));
		const cli = join(PACKAGE_DIR, "bin/slopgate.ts");
		const run = await Bun.$`bun ${cli} --root ${repo} --config ${config}`.nothrow().quiet();
		expect(run.exitCode).toBe(2);
		const err = run.stderr.toString();
		expect(err).toStartWith("slopgate: ");
		expect(err).toContain("unknown key `hotcallables`");
		expect(err).not.toContain("    at ");
	});
});
