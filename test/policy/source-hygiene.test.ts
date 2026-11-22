// Executable guard: no lint-disable comment in shipped code.
//
// Lint already fails on `any` and on @ts-ignore-style comments. It cannot ban
// its own disable comments, because such a comment can switch off the rule
// that would report it. A disable comment hides the finding that the gate
// exists to show, so fix the code or change the lint config with a reason.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_DIR } from "../../src/measure.ts";

test("no lint-disable comment in bin, src or scripts", async () => {
	const hits: string[] = [];
	for await (const file of new Bun.Glob("{bin,src,scripts}/**/*.ts").scan(PACKAGE_DIR)) {
		const lines = readFileSync(join(PACKAGE_DIR, file), "utf8").split("\n");
		for (const [index, line] of lines.entries()) {
			if (/(?:oxlint|eslint)-disable/.test(line)) hits.push(`${file}:${index + 1}`);
		}
	}
	expect(hits).toEqual([]);
});
