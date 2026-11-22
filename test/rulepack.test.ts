// Tests for the slop rule pack path — the rule-flagged half of Eq. 4.
//
// These tests use a small temporary pack, not the shipped one, so they check
// the scan path itself: a break here would make every rule contribute nothing
// to verbosity, with no error.
//
// A real defect this file exists to prevent: the pack is scanned through an
// ast-grep *project config* (`ruleDirs:`), which takes `--config`. Passing it to
// `--rule` fails with "Cannot parse rule" — and with VERSION at 0 no test ever
// reached the code to notice.
//
// SLOP_RULES_DIR points the engine at a temporary pack so these run without
// touching the shipped one.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measure } from "../src/measure.ts";
import { retargetRuleText } from "../src/scan.ts";
import { configFor } from "./helpers.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const TIMEOUT_MS = 60_000;

let rulesDir: string;
let previousEnv: string | undefined;

/**
 * A pack with one rule per language, each matching something the complexity
 * fixtures definitely contain, so a non-zero flagged count is deterministic.
 */
beforeAll(async () => {
	rulesDir = await mkdtemp(join(tmpdir(), "slop-testpack-"));
	await writeFile(join(rulesDir, "VERSION"), "1\n", "utf8");

	await mkdir(join(rulesDir, "typescript"), { recursive: true });
	await writeFile(
		join(rulesDir, "typescript", "ternary.yml"),
		[
			"id: test-ternary-is-slop",
			"language: typescript",
			"severity: warning",
			"message: test rule",
			"rule:",
			"  kind: ternary_expression",
			"",
		].join("\n"),
		"utf8",
	);

	await mkdir(join(rulesDir, "swift"), { recursive: true });
	await writeFile(
		join(rulesDir, "swift", "guard.yml"),
		[
			"id: test-guard-is-slop",
			"language: swift",
			"severity: warning",
			"message: test rule",
			"rule:",
			"  kind: guard_statement",
			"",
		].join("\n"),
		"utf8",
	);

	previousEnv = process.env.SLOP_RULES_DIR;
	process.env.SLOP_RULES_DIR = rulesDir;
});

afterAll(async () => {
	if (previousEnv === undefined) delete process.env.SLOP_RULES_DIR;
	else process.env.SLOP_RULES_DIR = previousEnv;
	await rm(rulesDir, { recursive: true, force: true });
});

describe("rule pack", () => {
	test(
		"a matching rule contributes flagged lines to verbosity",
		async () => {
			const { metrics } = await measure(
				configFor("typescript", ["typescript/complexity.ts"]),
				FIXTURES,
			);

			expect(metrics.detail.rulePackVersion).toBe(1);
			// complexity.ts contains several ternaries. Zero here means the pack
			// never ran — the failure mode this file exists to catch.
			expect(metrics.detail.flaggedLines).toBeGreaterThan(0);
			expect(metrics.verbosity).toBeGreaterThan(0);
		},
		TIMEOUT_MS,
	);

	test(
		"the pack runs for Swift too",
		async () => {
			const { metrics } = await measure(configFor("swift", ["swift/complexity.swift"]), FIXTURES);
			// branching() has exactly one guard statement.
			expect(metrics.detail.flaggedLines).toBeGreaterThan(0);
		},
		TIMEOUT_MS,
	);

	test(
		"the pack is re-targeted for tsx, not silently skipped",
		async () => {
			// view.tsx has two ternaries. They only match if the authored
			// `language: typescript` pack is re-targeted to the tsx grammar — the
			// same dialect problem the structural rules have, on a second code path.
			const { metrics } = await measure(configFor("typescript", ["typescript/view.tsx"]), FIXTURES);
			expect(metrics.detail.flaggedLines).toBeGreaterThan(0);
		},
		TIMEOUT_MS,
	);

	test(
		"verbosity stays bounded when rules and clones overlap",
		async () => {
			const { metrics } = await measure(
				configFor("typescript", ["typescript/complexity.ts"]),
				FIXTURES,
			);
			expect(metrics.verbosity).toBeLessThanOrEqual(1);
			// The union can never be larger than the sum of its parts.
			expect(metrics.detail.unionLines).toBeLessThanOrEqual(
				metrics.detail.flaggedLines + metrics.detail.cloneLines,
			);
		},
		TIMEOUT_MS,
	);
});

/** The re-targeted TypeScript dialect: the .tsx grammar. */
const TSX = { astGrepLanguage: "tsx", extensions: [".tsx"], idSuffix: "-tsx" };

describe("retargetRuleText", () => {
	const authored = [
		"id: dp-if",
		"language: typescript",
		"severity: hint",
		"rule:",
		"  kind: if_statement",
	].join("\n");

	test("rewrites the language and suffixes the id so tsx rules stay unique", () => {
		const out = retargetRuleText(authored, TSX);
		expect(out).toContain("id: dp-if-tsx");
		expect(out).toContain("language: tsx");
		// The rule body itself must be untouched.
		expect(out).toContain("  kind: if_statement");
	});

	test("leaves indented keys alone, so only top-level fields are rewritten", () => {
		const nested = ["id: x", "language: typescript", "rule:", "  has:", "    language: nope"].join(
			"\n",
		);
		const out = retargetRuleText(nested, TSX);
		expect(out).toContain("    language: nope");
		expect(out.split("\n").filter((l) => l === "language: tsx")).toHaveLength(1);
	});
});
