// Tests for the hot-callable ratchet (src/hot.ts) and the callable names and
// waivers it relies on.
//
// The matcher tests build callables by hand, like metrics.test.ts. The name tests
// run the real ast-grep over fixtures, like rules.test.ts, because the names come
// from the structural rules' `$NAME` captures.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Callable, SlopConfig } from "../src/config.ts";
import { findHotCallables } from "../src/hot.ts";
import { measure } from "../src/measure.ts";
import { formatHotCallables } from "../src/report.ts";

/** A callable with only the fields the matcher reads set meaningfully. */
function callable(name: string | null, complexity: number, file = "a.ts", startByte = 0): Callable {
	return {
		file,
		language: "typescript",
		startByte,
		endByte: startByte + 1,
		startLine: 9,
		endLine: 20,
		complexity,
		sloc: 10,
		name,
		waived: false,
	};
}

describe("findHotCallables", () => {
	test("ignores callables at or under the cutoff, however much they grew", () => {
		expect(findHotCallables([callable("f", 10)], [callable("f", 2)])).toEqual([]);
	});

	test("reports a new callable over the cutoff", () => {
		expect(findHotCallables([callable("f", 11)], [])).toEqual([
			{ file: "a.ts", line: 10, name: "f", complexity: 11, baseComplexity: null },
		]);
	});

	test("reports an existing callable that gained branches", () => {
		expect(findHotCallables([callable("f", 97)], [callable("f", 96)])).toEqual([
			{ file: "a.ts", line: 10, name: "f", complexity: 97, baseComplexity: 96 },
		]);
	});

	test("accepts an existing callable that stayed level or shrank", () => {
		expect(findHotCallables([callable("f", 96)], [callable("f", 96)])).toEqual([]);
		expect(findHotCallables([callable("f", 40)], [callable("f", 96)])).toEqual([]);
	});

	test("follows a callable moved to another file", () => {
		expect(findHotCallables([callable("f", 30, "b.ts")], [callable("f", 30, "a.ts")])).toEqual([]);
	});

	test("does not follow a name that exists in several base files", () => {
		const base = [callable("f", 30, "a.ts"), callable("f", 30, "b.ts")];
		expect(findHotCallables([callable("f", 20, "c.ts")], base)).toHaveLength(1);
	});

	test("compares same-named callables in a file by rank, not position", () => {
		const base = [callable("execute", 20, "a.ts", 0), callable("execute", 12, "a.ts", 100)];
		// A simple sibling added above both shifts every position but no rank.
		const sibling = [callable("execute", 3, "a.ts", 0), ...base.map((c) => ({ ...c, startByte: c.startByte + 50 }))];
		expect(findHotCallables(sibling, base)).toEqual([]);
		const grown = [callable("execute", 20, "a.ts", 0), callable("execute", 13, "a.ts", 120)];
		expect(findHotCallables(grown, base).map((h) => h.baseComplexity)).toEqual([12]);
	});

	test("never takes a same-file callable of another name as the match", () => {
		expect(findHotCallables([callable("g", 20)], [callable("f", 30)])).toHaveLength(1);
	});

	test("skips a waived callable", () => {
		expect(findHotCallables([{ ...callable("f", 30), waived: true }], [])).toEqual([]);
	});

	test("lists the most complex offender first", () => {
		const hot = findHotCallables([callable("small", 12, "a.ts", 0), callable("big", 40, "a.ts", 50)], []);
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

	function configFor(language: "typescript" | "swift", file: string): SlopConfig {
		return {
			languages: { [language]: { include: [file], exclude: [] } },
			maxDelta: { erosion: null, verbosity: null },
			thresholds: { erosion: null, verbosity: null },
			calibratedAtRulePackVersion: 0,
		};
	}

	async function namesIn(language: "typescript" | "swift", file: string) {
		const { callables } = await measure(configFor(language, file), FIXTURES);
		return callables
			.sort((a, b) => a.startByte - b.startByte)
			.map((c) => ({ line: c.startLine + 1, name: c.name, waived: c.waived }));
	}

	test(
		"TypeScript: declarations, methods, bound arrows, and a waiver",
		async () => {
			expect(await namesIn("typescript", "typescript/names.ts")).toEqual([
				{ line: 4, name: "runTurn", waived: false },
				{ line: 9, name: "handle", waived: false },
				{ line: 13, name: "value", waived: false },
				{ line: 19, name: "run", waived: false },
				{ line: 24, name: "parse", waived: true },
			]);
		},
		60_000,
	);

	test(
		"Swift: a computed property, an attributed function, and init",
		async () => {
			expect(await namesIn("swift", "swift/names.swift")).toEqual([
				{ line: 4, name: "body", waived: false },
				{ line: 8, name: "footer", waived: false },
				{ line: 13, name: "init", waived: false },
			]);
		},
		60_000,
	);
});
