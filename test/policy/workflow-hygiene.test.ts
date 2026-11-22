// Executable guard for the rules every CI workflow must keep, including the
// workflow that `slopgate init` copies into other repositories.
//
// - Every job has `timeout-minutes` from 10 to 30. A hung job then stops early
//   instead of running to the 6 hour default.
// - Every action is pinned to a full commit SHA with a trailing `# vX` comment,
//   so a moved tag cannot change what a workflow runs.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

/** Every workflow file this repository runs or ships, relative to the root. */
const WORKFLOWS = [
	...readdirSync(join(ROOT, ".github/workflows")).map((f) => `.github/workflows/${f}`),
	...readdirSync(join(ROOT, "examples")).map((f) => `examples/${f}`),
].filter((f) => f.endsWith(".yml"));

/** Narrows an unknown value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("workflow hygiene", () => {
	test("there are workflows to check", () => {
		expect(WORKFLOWS.length).toBeGreaterThan(0);
	});

	test.each(WORKFLOWS)("%s: every job has a timeout of 10 to 30 minutes", (file) => {
		const parsed: unknown = Bun.YAML.parse(readFileSync(join(ROOT, file), "utf8"));
		const jobs = isRecord(parsed) && isRecord(parsed.jobs) ? parsed.jobs : {};
		const bad = Object.entries(jobs)
			.map(([id, job]) => [id, isRecord(job) ? job["timeout-minutes"] : undefined] as const)
			.filter(([, timeout]) => typeof timeout !== "number" || timeout < 10 || timeout > 30)
			.map(([id, timeout]) => `${id}: ${String(timeout)}`);
		expect(Object.keys(jobs).length).toBeGreaterThan(0);
		expect(bad).toEqual([]);
	});

	test.each(WORKFLOWS)("%s: every action is pinned to a full commit SHA", (file) => {
		const unpinned = readFileSync(join(ROOT, file), "utf8")
			.split("\n")
			.map((line, index) => ({ line, index, ref: /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line)?.[1] }))
			.filter(({ ref }) => ref !== undefined && !ref.startsWith("./"))
			.filter(({ line, ref }) => !/@[0-9a-f]{40}$/.test(ref ?? "") || !/#\s*v\d/.test(line))
			.map(({ index, ref }) => `${file}:${index + 1} ${ref}`);
		expect(unpinned).toEqual([]);
	});
});
