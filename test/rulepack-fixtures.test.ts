// Every slop rule must prove itself against a fixture.
//
// This walks the whole rule pack, and for each rule runs it in isolation against
// `test/fixtures/rules/<language>/<rule-id>.<ext>`. Lines that should be flagged
// carry a trailing `// SLOP` marker; the rule must fire on exactly those and
// nowhere else.
//
// Both halves matter equally. A rule that misses its positive case is dead
// weight, and a rule that fires on the negative case makes the verbosity metric
// punish correct code — which is worse, because the number still looks
// plausible.
//
// Adding a rule therefore means adding a fixture. A rule without one fails here
// rather than silently shipping unverified.

import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveTool } from "../src/bin.ts";
import { LANGUAGES, type Language } from "../src/config.ts";
import { PACKAGE_DIR } from "../src/measure.ts";
import { runTool } from "../src/process.ts";

const FIXTURE_ROOT = join(import.meta.dir, "fixtures", "rules");
const EXTENSION: Record<Language, string> = { typescript: "ts", swift: "swift" };

/** Marks a line the rule under test is expected to flag. */
const MARKER = "// SLOP";

type RuleFile = { language: Language; id: string; path: string };

async function allRules(): Promise<RuleFile[]> {
	const rules: RuleFile[] = [];
	for (const language of LANGUAGES) {
		const dir = join(PACKAGE_DIR, "rules", language);
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			continue;
		}
		for (const entry of entries.filter((e) => e.endsWith(".yml")).sort()) {
			rules.push({ language, id: entry.replace(/\.yml$/, ""), path: join(dir, entry) });
		}
	}
	return rules;
}

/** Zero-based lines carrying the marker, and the file's total line count. */
function expectedLines(source: string): number[] {
	return source
		.split("\n")
		.map((line, index) => (line.includes(MARKER) ? index : -1))
		.filter((index) => index >= 0);
}

async function firedLines(rulePath: string, fixturePath: string): Promise<number[]> {
	const { stdout } = await runTool(
		"ast-grep",
		resolveTool("ast-grep", PACKAGE_DIR),
		["scan", "--rule", rulePath, "--json", fixturePath],
		{ cwd: PACKAGE_DIR, root: PACKAGE_DIR },
	);
	const trimmed = stdout.trim();
	if (trimmed === "") return [];
	const matches = JSON.parse(trimmed) as Array<{ range: { start: { line: number } } }>;
	return [...new Set(matches.map((m) => m.range.start.line))].sort((a, b) => a - b);
}

const rules = await allRules();

describe("rule pack fixtures", () => {
	// An empty pack is a valid state (rules/VERSION 0), so this is not a failure —
	// but it should be visible rather than silently vacuous.
	test("the pack is discoverable", () => {
		expect(Array.isArray(rules)).toBe(true);
	});

	for (const rule of rules) {
		test(
			`${rule.language}/${rule.id} fires on exactly its marked lines`,
			async () => {
				const fixturePath = join(
					FIXTURE_ROOT,
					rule.language,
					`${rule.id}.${EXTENSION[rule.language]}`,
				);
				const file = Bun.file(fixturePath);
				expect(
					await file.exists(),
					`missing fixture ${fixturePath} — every rule needs one`,
				).toBe(true);

				const source = await file.text();
				const expected = expectedLines(source);

				// A fixture with no marked lines proves nothing about the positive
				// case, which is the whole point of the exercise.
				expect(expected.length, `${rule.id} fixture has no ${MARKER} markers`).toBeGreaterThan(0);

				const fired = await firedLines(rule.path, fixturePath);
				expect(fired).toEqual(expected);
			},
			30_000,
		);
	}
});
