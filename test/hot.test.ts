// Tests for the hot-callable ratchet (src/hot.ts) and the callable names and
// waivers it relies on.
//
// The matcher tests build callables by hand, like metrics.test.ts. The name tests
// run the real ast-grep over fixtures, like rules.test.ts, because the names come
// from the structural rules' `$NAME` captures.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Callable, Language } from "../src/config.ts";
import { findHotCallables } from "../src/hot.ts";
import { measure } from "../src/measure.ts";
import { formatHotCallables } from "../src/gate.ts";
import { callable, configFor } from "./helpers.ts";

/** A head or base callable on line 10, the line every annotation test reads. */
function hotCallable(fields: Partial<Callable>): Callable {
	return callable({ startLine: 9, ...fields });
}

describe("findHotCallables", () => {
	test("ignores callables at or under the cutoff, however much they grew", () => {
		expect(
			findHotCallables(
				[hotCallable({ name: "f", complexity: 10 })],
				[hotCallable({ name: "f", complexity: 2 })],
			),
		).toEqual([]);
	});

	test("reports a new callable over the cutoff", () => {
		expect(findHotCallables([hotCallable({ name: "f", complexity: 11 })], [])).toEqual([
			{ file: "a.ts", line: 10, name: "f", complexity: 11, baseComplexity: null },
		]);
	});

	test("reports an existing callable that gained branches", () => {
		expect(
			findHotCallables(
				[hotCallable({ name: "f", complexity: 97 })],
				[hotCallable({ name: "f", complexity: 96 })],
			),
		).toEqual([{ file: "a.ts", line: 10, name: "f", complexity: 97, baseComplexity: 96 }]);
	});

	test("accepts an existing callable that stayed level or shrank", () => {
		expect(
			findHotCallables(
				[hotCallable({ name: "f", complexity: 96 })],
				[hotCallable({ name: "f", complexity: 96 })],
			),
		).toEqual([]);
		expect(
			findHotCallables(
				[hotCallable({ name: "f", complexity: 40 })],
				[hotCallable({ name: "f", complexity: 96 })],
			),
		).toEqual([]);
	});

	test("follows a callable moved to another file", () => {
		expect(
			findHotCallables(
				[hotCallable({ name: "f", complexity: 30, file: "b.ts" })],
				[hotCallable({ name: "f", complexity: 30, file: "a.ts" })],
			),
		).toEqual([]);
	});

	test("does not follow a name that exists in several base files", () => {
		const base = [
			hotCallable({ name: "f", complexity: 30, file: "a.ts" }),
			hotCallable({ name: "f", complexity: 30, file: "b.ts" }),
		];
		expect(
			findHotCallables([hotCallable({ name: "f", complexity: 20, file: "c.ts" })], base),
		).toHaveLength(1);
	});

	test("compares same-named callables in a file by rank, not position", () => {
		const base = [
			hotCallable({ name: "execute", complexity: 20, file: "a.ts", startByte: 0 }),
			hotCallable({ name: "execute", complexity: 12, file: "a.ts", startByte: 100 }),
		];
		// A simple sibling added above both shifts every position but no rank.
		const sibling = [
			hotCallable({ name: "execute", complexity: 3, file: "a.ts", startByte: 0 }),
			...base.map((c) => ({ ...c, startByte: c.startByte + 50 })),
		];
		expect(findHotCallables(sibling, base)).toEqual([]);
		const grown = [
			hotCallable({ name: "execute", complexity: 20, file: "a.ts", startByte: 0 }),
			hotCallable({ name: "execute", complexity: 13, file: "a.ts", startByte: 120 }),
		];
		expect(findHotCallables(grown, base).map((h) => h.baseComplexity)).toEqual([12]);
	});

	test("never takes a same-file callable of another name as the match", () => {
		expect(
			findHotCallables(
				[hotCallable({ name: "g", complexity: 20 })],
				[hotCallable({ name: "f", complexity: 30 })],
			),
		).toHaveLength(1);
	});

	test("skips a waived callable", () => {
		expect(
			findHotCallables([{ ...hotCallable({ name: "f", complexity: 30 }), waived: true }], []),
		).toEqual([]);
	});

	test("lists the most complex offender first", () => {
		const hot = findHotCallables(
			[
				hotCallable({ name: "small", complexity: 12, file: "a.ts", startByte: 0 }),
				hotCallable({ name: "big", complexity: 40, file: "a.ts", startByte: 50 }),
			],
			[],
		);
		expect(hot.map((h) => h.name)).toEqual(["big", "small"]);
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

describe("callable names and waivers (ast-grep)", () => {
	const FIXTURES = join(import.meta.dir, "fixtures");

	async function namesIn(language: Language, file: string) {
		const { callables } = await measure(configFor(language, [file]), FIXTURES);
		return callables
			.toSorted((a, b) => a.startByte - b.startByte)
			.map((c) => ({ line: c.startLine + 1, name: c.name, waived: c.waived }));
	}

	test("TypeScript: declarations, methods, bound arrows, and a waiver", async () => {
		expect(await namesIn("typescript", "typescript/names.ts")).toEqual([
			{ line: 4, name: "runJob", waived: false },
			{ line: 9, name: "handle", waived: false },
			{ line: 13, name: "value", waived: false },
			{ line: 19, name: "run", waived: false },
			{ line: 24, name: "parse", waived: true },
		]);
	}, 60_000);

	test("Swift: a computed property, an attributed function, and init", async () => {
		expect(await namesIn("swift", "swift/names.swift")).toEqual([
			{ line: 4, name: "body", waived: false },
			{ line: 8, name: "footer", waived: false },
			{ line: 13, name: "init", waived: false },
		]);
	}, 60_000);
});
