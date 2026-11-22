// Executable guard for two source rules that lint alone does not cover.
//
// - No escape hatch in shipped code: a type or lint suppression hides the
//   finding that the gate exists to show. Fix the code instead.
// - The analyser pins in package.json and vendor/package.json are equal. A
//   vendored copy that runs a different analyser version measures different
//   numbers, and the gate reports that drift as a code change.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

/** Suppressions that silence a finding instead of fixing it. */
const ESCAPE_HATCH =
	/@ts-ignore|@ts-expect-error|@ts-nocheck|oxlint-disable|eslint-disable|\bas any\b/;

/** Reads a package manifest's runtime dependencies. */
function dependencies(path: string): Record<string, string> {
	const manifest: { dependencies?: Record<string, string> } = JSON.parse(
		readFileSync(join(ROOT, path), "utf8"),
	);
	return manifest.dependencies ?? {};
}

describe("source hygiene", () => {
	test("no escape hatch in bin, src or scripts", async () => {
		const hits: string[] = [];
		for await (const file of new Bun.Glob("{bin,src,scripts}/**/*.ts").scan(ROOT)) {
			const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
			for (const [index, line] of lines.entries()) {
				if (ESCAPE_HATCH.test(line)) hits.push(`${file}:${index + 1}`);
			}
		}
		expect(hits).toEqual([]);
	});

	test("vendor/package.json pins the same analysers as package.json", () => {
		expect(dependencies("vendor/package.json")).toEqual(dependencies("package.json"));
	});
});
