// `slopgate init`: copy the anti-slop kit into another repository.
//
// The kit is the files this repository already uses on itself: the agent rules
// in .github/instructions, the skills in .claude/skills, an example slop config
// and an example CI workflow. Copying the same files keeps one source for both.

import { copyFile, lstat, mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PACKAGE_DIR } from "./config.ts";

/** Suffix of an agent rule file. Copilot reads these from .github/instructions. */
export const RULE_SUFFIX = ".instructions.md";

/**
 * The target of the .claude/rules link for rule `name`, relative to the link.
 * Claude Code reads rules from .claude/rules, so each one links to the single
 * copy in .github/instructions.
 */
export function ruleLink(name: string): string {
	return `../../.github/instructions/${name}${RULE_SUFFIX}`;
}

/**
 * Package-relative paths of the files that match `pattern`. Dotfiles such as
 * .DS_Store are left out, so a local clone cannot leak them into a target.
 */
function scanPackage(pattern: string): Promise<string[]> {
	return Array.fromAsync(new Bun.Glob(pattern).scan(PACKAGE_DIR));
}

/**
 * Copy the kit into `target` and link each rule into .claude/rules. Prints one
 * line for each path. Never overwrites a path unless `force` is set, so a
 * second run is safe and keeps local edits. On `force` an existing path is
 * removed first, because symlink() does not replace.
 *
 * Fails when the package has no rules, which is the case for a vendored copy,
 * and refuses to run on the package itself: there the source and the
 * destination of each kit file are the same path, and `force` would delete it.
 */
async function init(target: string, force: boolean): Promise<void> {
	if ((await realpath(target).catch(() => target)) === (await realpath(PACKAGE_DIR))) {
		throw new Error(`${target} is the slopgate package itself; run init in another repository`);
	}
	const rules = await scanPackage(`.github/instructions/*${RULE_SUFFIX}`);
	if (rules.length === 0) {
		throw new Error(`no kit files in ${PACKAGE_DIR}; run init from an installed slopgate`);
	}
	const skills = await scanPackage(".claude/skills/**/*");

	const place = async (to: string, write: (path: string) => Promise<void>): Promise<void> => {
		const path = join(target, to);
		const present = await lstat(path).then(
			() => true,
			() => false,
		);
		if (present && !force) {
			console.log(`skipped  ${to} (exists; --force overwrites)`);
			return;
		}
		if (present) await unlink(path);
		await mkdir(dirname(path), { recursive: true });
		await write(path);
		console.log(`created  ${to}`);
	};
	const copy = (from: string, to: string) =>
		place(to, (path) => copyFile(join(PACKAGE_DIR, from), path));

	for (const file of [...skills, ...rules].toSorted()) await copy(file, file);
	await copy("examples/slop.config.json", "slop.config.json");
	await copy("examples/slopgate.yml", ".github/workflows/slopgate.yml");
	for (const rule of rules.toSorted()) {
		const name = basename(rule, RULE_SUFFIX);
		await place(`.claude/rules/${name}.md`, (path) => symlink(ruleLink(name), path));
	}
}

/** How to call the subcommand, printed for --help. */
const INIT_USAGE = `slopgate init [--root <dir>] [--force]

  Copy the agent rules, skills, slop config and CI workflow into the repository.
  Existing files are skipped unless --force is given.`;

/** What to do after init, printed once at the end. */
const NEXT_STEPS = `Next steps:
  1. Edit the include globs in slop.config.json for this repository.
  2. Add this line to AGENTS.md: "Before you edit a file, read each rule in
     .github/instructions whose applyTo glob matches it."
  3. Run: bunx slopgate --report`;

/**
 * The `init` subcommand: parse its arguments, run init and print the result.
 * Throws on an unknown argument, before it writes anything.
 */
export async function runInit(argv: string[]): Promise<void> {
	const { values } = parseArgs({
		args: argv,
		options: {
			root: { type: "string", default: "." },
			force: { type: "boolean", default: false },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		console.log(INIT_USAGE);
		return;
	}
	await init(resolve(values.root), values.force);
	console.log(`\n${NEXT_STEPS}`);
}
