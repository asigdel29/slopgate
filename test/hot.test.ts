// Tests for the hot-callable ratchet (src/hot.ts).
//
// Tool-free like metrics.test.ts: callables are built by hand, so a failure here
// means the matching rule changed, not that ast-grep parsed something new.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyedCallable } from "../src/hot.ts";
import { callableName, findHotCallables, formatHotCallables, keyCallables } from "../src/hot.ts";

/** A keyed callable with only the fields the matcher reads set meaningfully. */
function keyed(name: string, complexity: number, file = "a.ts", waived = false): KeyedCallable {
	return {
		file,
		language: "typescript",
		startByte: 0,
		endByte: 1,
		startLine: 9,
		endLine: 20,
		complexity,
		sloc: 10,
		name,
		waived,
	};
}

describe("callableName", () => {
	test("reads the name off each declaration shape", () => {
		expect(callableName("export async function runTurn(args: Args) {")).toBe("runTurn");
		expect(callableName("const runTurn = async (args: Args) => {")).toBe("runTurn");
		expect(callableName("  private async handle(req: Request): Promise<void> {")).toBe("handle");
		expect(callableName("  get value(): number {")).toBe("value");
		expect(callableName("function pick<T>(xs: T[]): T {")).toBe("pick");
		expect(callableName("    func render(into view: View) -> Bool {")).toBe("render");
	});

	test("falls back to the trimmed line when no name can be read", () => {
		expect(callableName("   {   ")).toBe("{");
	});
});

describe("findHotCallables", () => {
	test("ignores callables at or under the cutoff, however much they grew", () => {
		expect(findHotCallables([keyed("f", 10)], [keyed("f", 2)])).toEqual([]);
	});

	test("reports a new callable over the cutoff", () => {
		expect(findHotCallables([keyed("f", 11)], [])).toEqual([
			{ file: "a.ts", line: 10, name: "f", complexity: 11, baseComplexity: null },
		]);
	});

	test("reports an existing callable that gained branches", () => {
		expect(findHotCallables([keyed("f", 97)], [keyed("f", 96)])).toEqual([
			{ file: "a.ts", line: 10, name: "f", complexity: 97, baseComplexity: 96 },
		]);
	});

	test("accepts an existing callable that stayed level or shrank", () => {
		expect(findHotCallables([keyed("f", 96)], [keyed("f", 96)])).toEqual([]);
		expect(findHotCallables([keyed("f", 40)], [keyed("f", 96)])).toEqual([]);
	});

	test("follows a callable moved to another file", () => {
		expect(findHotCallables([keyed("f", 30, "b.ts")], [keyed("f", 30, "a.ts")])).toEqual([]);
	});

	test("prefers the same file over a namesake elsewhere", () => {
		const base = [keyed("f", 12, "a.ts"), keyed("f", 50, "b.ts")];
		expect(findHotCallables([keyed("f", 13, "a.ts")], base)).toHaveLength(1);
	});

	test("skips a waived callable", () => {
		expect(findHotCallables([keyed("f", 30, "a.ts", true)], [])).toEqual([]);
	});

	test("lists the most complex offender first", () => {
		const hot = findHotCallables([keyed("small", 12), keyed("big", 40)], []);
		expect(hot.map((h) => h.name)).toEqual(["big", "small"]);
	});
});

describe("keyCallables", () => {
	test("names callables and reads the waiver from the line above", async () => {
		const root = await mkdtemp(join(tmpdir(), "slop-hot-"));
		await writeFile(
			join(root, "a.ts"),
			["// slopgate-allow: parser table", "function parse(s: string) {", "}", "", "const run = () => {", "};"].join(
				"\n",
			),
		);
		const [parse, run] = await keyCallables(
			[
				{ ...keyed("", 20), startLine: 1 },
				{ ...keyed("", 20), startLine: 4 },
			],
			root,
		);
		expect(parse).toMatchObject({ name: "parse", waived: true });
		expect(run).toMatchObject({ name: "run", waived: false });
	});
});

describe("formatHotCallables", () => {
	test("anchors each annotation on the callable's line", () => {
		const [line] = formatHotCallables([
			{ file: "a.ts", line: 10, name: "f", complexity: 12, baseComplexity: 11 },
		]);
		expect(line).toStartWith("::error file=a.ts,line=10::f grew from CC 11 to 12");
	});
});
