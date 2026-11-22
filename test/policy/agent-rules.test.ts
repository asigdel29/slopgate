// Executable guard: each rule file in .github/instructions reaches every agent.
//
// Copilot reads a rule's `applyTo:` globs. Agents that read CLAUDE.md load the
// rule through its `.claude/rules/<name>.md` link and its `paths:` list. Agents
// that read AGENTS.md find it in the "Rules by path" table. The three copies of
// each glob list are written by hand, so this test fails when one of them drifts:
// a missing or wrong link, a `paths:` list that differs from `applyTo:`, a rule
// the table does not name, or a link with no rule behind it.

import { describe, expect, test } from "bun:test";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { RULE_SUFFIX, ruleLink } from "../../src/init.ts";
import { PACKAGE_DIR } from "../../src/measure.ts";

const INSTRUCTIONS = join(PACKAGE_DIR, ".github/instructions");
const RULES = join(PACKAGE_DIR, ".claude/rules");

/** Rule names, from the instruction file names. */
const NAMES = readdirSync(INSTRUCTIONS)
	.filter((file) => file.endsWith(RULE_SUFFIX))
	.map((file) => file.slice(0, -RULE_SUFFIX.length));

/** The `applyTo:` globs and the `paths:` list from one rule's frontmatter. */
function frontmatter(name: string): { applyTo: string[]; paths: string[] } {
	const text = readFileSync(join(INSTRUCTIONS, name + RULE_SUFFIX), "utf8");
	const parsed: unknown = Bun.YAML.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "");
	const fields = typeof parsed === "object" && parsed !== null ? parsed : {};
	const applyTo = "applyTo" in fields && typeof fields.applyTo === "string" ? fields.applyTo : "";
	const paths = "paths" in fields && Array.isArray(fields.paths) ? fields.paths.map(String) : [];
	return { applyTo: applyTo === "" ? [] : applyTo.split(","), paths };
}

describe("agent rules", () => {
	test("there are rule files to check", () => {
		expect(NAMES.length).toBeGreaterThan(0);
	});

	test.each(NAMES)("%s: paths matches applyTo, or is absent for **", (name) => {
		const { applyTo, paths } = frontmatter(name);
		expect(applyTo.length).toBeGreaterThan(0);
		expect(paths).toEqual(applyTo.join() === "**" ? [] : applyTo);
	});

	test.each(NAMES)("%s: .claude/rules links to the rule file", (name) => {
		const link = join(RULES, `${name}.md`);
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		expect(readlinkSync(link)).toBe(ruleLink(name));
	});

	test.each(NAMES)("%s: the AGENTS.md table names the rule", (name) => {
		expect(readFileSync(join(PACKAGE_DIR, "AGENTS.md"), "utf8")).toContain(
			`\`${name}${RULE_SUFFIX}\``,
		);
	});

	test("every .claude/rules link has a rule file behind it", () => {
		const linked = readdirSync(RULES).map((file) => file.replace(/\.md$/, ""));
		expect(linked.toSorted()).toEqual(NAMES.toSorted());
	});
});
