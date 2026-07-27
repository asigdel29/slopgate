// Integration tests for the structural rule packs.
//
// Unlike metrics.test.ts these run the real ast-grep and jscpd against the
// fixtures in test/fixtures/, so they prove the RULES are right — that the node
// kinds exist in each grammar, that `default:` is excluded, that inline closures
// fold into their enclosing callable — rather than that the arithmetic is right.
//
// Every expected complexity is hand-counted in a comment inside the fixture
// itself, so the fixture and the assertion can be checked against each other.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Callable, SlopConfig } from "../src/config.ts";
import { measure } from "../src/measure.ts";

const FIXTURES = join(import.meta.dir, "fixtures");

function configFor(language: "typescript" | "swift", include: string[]): SlopConfig {
	return {
		languages: { [language]: { include, exclude: [] } },
		thresholds: { erosion: null, verbosity: null },
		calibratedAtRulePackVersion: 0,
	};
}

/**
 * Callables come back without names — the engine only ever needs ranges — so
 * tests identify them by start line, which is stable and easy to read off the
 * fixture.
 */
function byStartLine(callables: Callable[]): Map<number, Callable> {
	return new Map(callables.map((c) => [c.startLine + 1, c]));
}

/**
 * Measuring shells out to ast-grep and jscpd, which costs seconds. Several
 * assertions share a fixture, so the result is memoised per file — without this
 * the suite re-runs the whole pipeline for every expectation and jscpd gets
 * killed by the per-test timeout.
 */
const cache = new Map<string, Promise<Awaited<ReturnType<typeof runMeasure>>>>();

async function runMeasure(language: "typescript" | "swift", file: string) {
	const { callables, metrics } = await measure(configFor(language, [file]), FIXTURES);
	return { callables, metrics, byLine: byStartLine(callables) };
}

function measureFixture(language: "typescript" | "swift", file: string) {
	const key = `${language}:${file}`;
	const existing = cache.get(key);
	if (existing) return existing;
	const pending = runMeasure(language, file);
	cache.set(key, pending);
	return pending;
}

/** Generous, because the first call for a fixture pays for both subprocesses. */
const TIMEOUT_MS = 60_000;

describe("typescript structural rules", () => {
	test("computes the hand-counted complexity of every callable", async () => {
		const { byLine } = await measureFixture("typescript", "typescript/complexity.ts");

		// plain() — no decision points.
		expect(byLine.get(7)?.complexity).toBe(1);

		// branching() — 9 decision points, and `default:` is NOT one of them.
		// Exactly 10 also pins the Eq. 3 boundary: high complexity is > 10.
		expect(byLine.get(16)?.complexity).toBe(10);

		// withClosure() — the two inline closures are not callables, so the
		// ternary inside one of them folds in here.
		expect(byLine.get(46)?.complexity).toBe(2);

		// nullish() — `??` twice, `?.` never. CC 3, not 4.
		expect(byLine.get(70)?.complexity).toBe(3);
	}, TIMEOUT_MS);

	test("an inline closure does not become its own callable", async () => {
		const { callables } = await measureFixture("typescript", "typescript/complexity.ts");

		// withClosure spans a single statement containing two arrow functions.
		// If those were counted, there would be callables nested inside it.
		const withClosure = callables.filter((c) => c.startLine + 1 === 46);
		expect(withClosure).toHaveLength(1);

		const nested = callables.filter(
			(c) =>
				withClosure[0] !== undefined &&
				c !== withClosure[0] &&
				c.startByte >= (withClosure[0]?.startByte ?? 0) &&
				c.endByte <= (withClosure[0]?.endByte ?? 0),
		);
		expect(nested).toHaveLength(0);
	}, TIMEOUT_MS);

	test("a named nested function gets its own entry and is removed from the parent", async () => {
		const { byLine } = await measureFixture("typescript", "typescript/complexity.ts");

		// outer() keeps only its own `if`; the ternary belongs to inner().
		expect(byLine.get(53)?.complexity).toBe(2);

		// inner() is a const-bound arrow, so it is a callable in its own right.
		expect(byLine.get(54)?.complexity).toBe(2);
	}, TIMEOUT_MS);

	test("methods and constructors are callables", async () => {
		const { byLine } = await measureFixture("typescript", "typescript/complexity.ts");
		expect(byLine.get(61)?.complexity).toBe(2); // render()
		expect(byLine.get(66)?.complexity).toBe(1); // constructor
	}, TIMEOUT_MS);

	test("SLOC excludes comment-only and blank lines", async () => {
		const { byLine } = await measureFixture("typescript", "typescript/complexity.ts");

		const plain = byLine.get(7);
		// `export function plain(): number {`, `return 1;`, `}` — the comment
		// above it is outside the callable's range and the body has no blanks.
		expect(plain?.sloc).toBe(3);
	}, TIMEOUT_MS);
});

describe("swift structural rules", () => {
	test("computes the hand-counted complexity of every callable", async () => {
		const { byLine } = await measureFixture("swift", "swift/complexity.swift");

		// plain() — no decision points.
		expect(byLine.get(7)?.complexity).toBe(1);

		// branching() — 10 decision points including guard and `where`, excluding
		// `default:`. At 11 this is over the Eq. 3 cutoff.
		expect(byLine.get(17)?.complexity).toBe(11);

		// risky() — one `??` and one catch.
		expect(byLine.get(40)?.complexity).toBe(3);

		// withClosure() — the trailing closure's ternary folds in.
		expect(byLine.get(51)?.complexity).toBe(2);
	}, TIMEOUT_MS);

	test("a trailing closure does not become its own callable", async () => {
		const { callables } = await measureFixture("swift", "swift/complexity.swift");
		expect(callables.filter((c) => c.startLine + 1 === 51)).toHaveLength(1);
	}, TIMEOUT_MS);

	test("computed properties and initialisers are callables", async () => {
		const { byLine } = await measureFixture("swift", "swift/complexity.swift");

		// `var body: String { … }` — this is how SwiftUI view bodies parse, so
		// their complexity is measured rather than invisible.
		expect(byLine.get(60)?.complexity).toBe(2);

		// init(label:)
		expect(byLine.get(65)?.complexity).toBe(2);
	}, TIMEOUT_MS);

	test("the Eq. 3 cutoff counts CC 11 as eroded", async () => {
		const { metrics } = await measureFixture("swift", "swift/complexity.swift");
		// branching() at CC 11 is the only high-complexity callable in the file.
		expect(metrics.detail.highComplexityCallables).toBe(1);
		expect(metrics.erosion).toBeGreaterThan(0);
		expect(metrics.erosion).toBeLessThan(1);
	}, TIMEOUT_MS);
});

describe("cross-language behaviour", () => {
	test("tsx files are measured, not silently skipped", async () => {
		// `.tsx` is a separate grammar in ast-grep; a rule pack authored as
		// `language: typescript` matches nothing in a .tsx file unless the engine
		// re-targets it. A zero here would mean the whole dialect is invisible.
		const { callables } = await measure(
			configFor("typescript", ["typescript/view.tsx"]),
			FIXTURES,
		);

		expect(callables.length).toBeGreaterThan(0);
		// Badge() — two ternaries and one `&&`, so CC 4.
		expect(callables.find((c) => c.startLine + 1 === 8)?.complexity).toBe(4);
	}, TIMEOUT_MS);

	test("verbosity stays within [0, 1] on real files", async () => {
		const { metrics } = await measureFixture("typescript", "typescript/complexity.ts");
		expect(metrics.verbosity).toBeGreaterThanOrEqual(0);
		expect(metrics.verbosity).toBeLessThanOrEqual(1);
	}, TIMEOUT_MS);
});
