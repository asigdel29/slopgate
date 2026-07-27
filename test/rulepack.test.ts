// Tests for the slop rule pack path — the rule-flagged half of Eq. 4.
//
// This path is dormant in the shipped package (rules/VERSION is 0, the rule
// directories are empty), which is exactly why it needs its own tests: nothing
// else exercises it, so a break here stays invisible until the first rule pack
// lands and silently contributes nothing to verbosity.
//
// A real defect this file exists to prevent: the pack is scanned through an
// ast-grep *project config* (`ruleDirs:`), which takes `--config`. Passing it to
// `--rule` fails with "Cannot parse rule" — and with VERSION at 0 no test ever
// reached the code to notice.
//
// SLOP_RULES_DIR points the engine at a temporary pack so these run without
// touching the shipped one.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SlopConfig } from "../src/config.ts";
import { measure } from "../src/measure.ts";

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

function configFor(language: "typescript" | "swift", include: string[]): SlopConfig {
	return {
		languages: { [language]: { include, exclude: [] } },
		thresholds: { erosion: null, verbosity: null },
		calibratedAtRulePackVersion: 1,
	};
}

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
			const { metrics } = await measure(
				configFor("swift", ["swift/complexity.swift"]),
				FIXTURES,
			);
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
			const { metrics } = await measure(
				configFor("typescript", ["typescript/view.tsx"]),
				FIXTURES,
			);
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
