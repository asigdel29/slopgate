// Formula tests for the slop metrics — SlopCodeBench Eq. 2, 3 and 4.
//
// These are deliberately tool-free: every expected value is computed by hand in
// the test body, so a regression here means the formula changed, not that
// ast-grep or jscpd behaved differently. The tooling-dependent half lives in
// rules.test.ts.
//
// Reference: arXiv:2603.24755.

import { describe, expect, test } from "bun:test";
import { buildCallables } from "../src/callables.ts";
import type { Callable, FileMeasurement } from "../src/config.ts";
import { computeErosion, computeVerbosity, mass } from "../src/metrics.ts";
import { retargetRuleText } from "../src/scan.ts";
import { classifyLines } from "../src/sources.ts";

function callable(complexity: number, sloc: number, file = "a.ts"): Callable {
	return {
		file,
		language: "typescript",
		startByte: 0,
		endByte: 1,
		startLine: 0,
		endLine: 0,
		complexity,
		sloc,
	};
}

describe("mass (Eq. 2)", () => {
	test("is CC x sqrt(SLOC)", () => {
		expect(mass(12, 100)).toBe(120);
		expect(mass(5, 25)).toBe(25);
		expect(mass(11, 4)).toBe(22);
	});

	test("the square root makes complexity dominate size", () => {
		// Quadrupling the line count only doubles the mass, but doubling the
		// branching doubles it too — that asymmetry is the point of Eq. 2.
		expect(mass(1, 400)).toBe(mass(2, 100));
	});
});

describe("computeErosion (Eq. 3)", () => {
	test("matches a hand-computed worked example", () => {
		// masses:      12*sqrt(100)=120   5*sqrt(25)=25   11*sqrt(4)=22
		// total:       120 + 25 + 22 = 167
		// above CC 10: 120 + 22       = 142   (5 is not > 10)
		const result = computeErosion([callable(12, 100), callable(5, 25), callable(11, 4)]);

		expect(result.totalMass).toBe(167);
		expect(result.highComplexityMass).toBe(142);
		expect(result.callables).toBe(3);
		expect(result.highComplexityCallables).toBe(2);
		expect(result.erosion).toBeCloseTo(142 / 167, 10);
		expect(result.erosion).toBeCloseTo(0.8503, 4);
	});

	test("the cutoff is strictly greater than 10, matching Radon's bound", () => {
		// CC exactly 10 is NOT high-complexity; 11 is.
		expect(computeErosion([callable(10, 16)]).erosion).toBe(0);
		expect(computeErosion([callable(11, 16)]).erosion).toBe(1);
	});

	test("skips callables with no source lines, like upstream's sloc <= 0 guard", () => {
		// A bodiless declaration must not contribute a zero to either sum.
		const result = computeErosion([callable(12, 100), callable(99, 0)]);
		expect(result.callables).toBe(1);
		expect(result.totalMass).toBe(120);
		expect(result.erosion).toBe(1);
	});

	test("an empty codebase has no concentration rather than NaN", () => {
		expect(computeErosion([]).erosion).toBe(0);
		expect(computeErosion([callable(5, 0)]).erosion).toBe(0);
	});

	test("stays within [0, 1]", () => {
		const result = computeErosion([callable(40, 900), callable(3, 4), callable(11, 100)]);
		expect(result.erosion).toBeGreaterThanOrEqual(0);
		expect(result.erosion).toBeLessThanOrEqual(1);
	});
});

describe("computeVerbosity (Eq. 4)", () => {
	test("counts the union, so a line flagged and cloned counts once", () => {
		const flagged = new Set(["a.ts:1", "a.ts:2"]);
		const clones = new Set(["a.ts:2", "a.ts:3"]);

		const result = computeVerbosity(flagged, clones, 10);

		// Union is {1, 2, 3} — the shared line 2 is not double counted.
		expect(result.unionLines).toBe(3);
		expect(result.verbosity).toBeCloseTo(0.3, 10);
		// The raw inputs are still reported so the two halves stay explainable.
		expect(result.flaggedLines).toBe(2);
		expect(result.cloneLines).toBe(2);
	});

	test("keys are per file, so equal line numbers in different files stay distinct", () => {
		const result = computeVerbosity(new Set(["a.ts:7"]), new Set(["b.ts:7"]), 10);
		expect(result.unionLines).toBe(2);
	});

	test("is bounded by 1 even when every line is both flagged and cloned", () => {
		const every = new Set(["a.ts:0", "a.ts:1", "a.ts:2"]);
		const result = computeVerbosity(every, new Set(every), 3);
		expect(result.verbosity).toBe(1);
	});

	test("an empty codebase is 0, not NaN", () => {
		expect(computeVerbosity(new Set(), new Set(), 0).verbosity).toBe(0);
	});
});

describe("classifyLines", () => {
	function lines(source: string, comments: Array<[number, number]> = []): number[] {
		return [...classifyLines(Buffer.from(source, "utf8"), comments)].sort((a, b) => a - b);
	}

	test("blank and whitespace-only lines are not source lines", () => {
		expect(lines("a\n\n   \n\tb\n")).toEqual([0, 3]);
	});

	test("a comment-only line is not a source line", () => {
		const src = "const a = 1;\n// just a comment\nconst b = 2;\n";
		const commentStart = src.indexOf("//");
		expect(lines(src, [[commentStart, commentStart + "// just a comment".length]])).toEqual([0, 2]);
	});

	test("a trailing comment leaves the line as code", () => {
		const src = "const a = 1; // why\n";
		const commentStart = src.indexOf("//");
		expect(lines(src, [[commentStart, src.length - 1]])).toEqual([0]);
	});

	test("a final line without a trailing newline still counts", () => {
		expect(lines("a\nb")).toEqual([0, 1]);
	});

	test("multi-line block comments are excluded across every line they span", () => {
		const src = "a\n/* one\n   two */\nb\n";
		const start = src.indexOf("/*");
		const end = src.indexOf("*/") + 2;
		expect(lines(src, [[start, end]])).toEqual([0, 3]);
	});

	test("non-ASCII content does not desynchronise byte offsets", () => {
		// The comment span is in BYTES. If classification decoded to a JS string
		// first, the emoji would shift every subsequent offset and the wrong line
		// would be blanked.
		const src = 'const label = "🌙🌞";\n// comment\ncode();\n';
		const buf = Buffer.from(src, "utf8");
		const start = buf.indexOf(Buffer.from("//", "utf8"));
		expect(lines(src, [[start, start + "// comment".length]])).toEqual([0, 2]);
	});
});

describe("buildCallables", () => {
	// Byte spans are what attribution actually uses; lines only drive SLOC.
	function match(ruleId: string, startByte: number, endByte: number, startLine = 0, endLine = 0) {
		return {
			ruleId,
			file: "a.ts",
			range: {
				byteOffset: { start: startByte, end: endByte },
				start: { line: startLine, column: 0 },
				end: { line: endLine, column: 0 },
			},
		};
	}

	const measurement: FileMeasurement = {
		file: "a.ts",
		language: "typescript",
		loc: 10,
		sourceLines: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
	};

	test("a decision point is attributed to the innermost enclosing callable", () => {
		// outer 0..100 contains inner 40..60; the dp at 50 belongs to inner only.
		const callables = buildCallables(
			[
				match("callable-function-declaration", 0, 100, 0, 9),
				match("callable-named-function-expression", 40, 60, 3, 5),
				match("dp-if", 50, 55, 4, 4),
			],
			[measurement],
			"typescript",
		);

		const outer = callables.find((c) => c.startByte === 0);
		const inner = callables.find((c) => c.startByte === 40);
		expect(inner?.complexity).toBe(2);
		// The parent does NOT also count it — that is Radon's nested-function rule.
		expect(outer?.complexity).toBe(1);
	});

	test("branches in an inline closure fold into the enclosing named callable", () => {
		// An inline closure produces no callable-* match at all (see
		// structural/typescript.yml), so its dp lands on the function around it
		// rather than creating a near-zero-CC entry that would dilute Eq. 3.
		const callables = buildCallables(
			[
				match("callable-function-declaration", 0, 100, 0, 9),
				match("dp-if", 50, 55, 4, 4),
				match("dp-logical", 56, 58, 4, 4),
			],
			[measurement],
			"typescript",
		);

		expect(callables).toHaveLength(1);
		expect(callables[0]?.complexity).toBe(3);
	});

	test("a top-level decision point outside every callable is dropped", () => {
		// Upstream's mass.py sums function/method symbols only, so module-level
		// control flow has nowhere to go and must not inflate anything.
		const callables = buildCallables(
			[match("callable-function-declaration", 0, 10, 0, 0), match("dp-if", 500, 505, 8, 8)],
			[measurement],
			"typescript",
		);

		expect(callables).toHaveLength(1);
		expect(callables[0]?.complexity).toBe(1);
	});

	test("SLOC counts only the file's source lines inside the callable's range", () => {
		const sparse: FileMeasurement = {
			file: "a.ts",
			language: "typescript",
			loc: 3,
			// lines 1 and 3 are blank or comment-only
			sourceLines: new Set([0, 2, 4]),
		};

		const callables = buildCallables(
			[match("callable-function-declaration", 0, 100, 0, 4)],
			[sparse],
			"typescript",
		);

		expect(callables[0]?.sloc).toBe(3);
	});

	test("complexity starts at 1 with no decision points", () => {
		const callables = buildCallables(
			[match("callable-function-declaration", 0, 10, 0, 0)],
			[measurement],
			"typescript",
		);
		expect(callables[0]?.complexity).toBe(1);
	});
});

describe("retargetRuleText", () => {
	const authored = ["id: dp-if", "language: typescript", "severity: hint", "rule:", "  kind: if_statement"].join("\n");

	test("rewrites the language and suffixes the id so tsx rules stay unique", () => {
		const out = retargetRuleText(authored, "tsx", "-tsx");
		expect(out).toContain("id: dp-if-tsx");
		expect(out).toContain("language: tsx");
		// The rule body itself must be untouched.
		expect(out).toContain("  kind: if_statement");
	});

	test("leaves indented keys alone, so only top-level fields are rewritten", () => {
		const nested = ["id: x", "language: typescript", "rule:", "  has:", "    language: nope"].join("\n");
		const out = retargetRuleText(nested, "tsx", "-tsx");
		expect(out).toContain("    language: nope");
		expect(out.split("\n").filter((l) => l === "language: tsx")).toHaveLength(1);
	});
});
