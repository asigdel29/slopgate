// `slopgate init`: copy the anti-slop kit into another repository.
//
// The kit is the files this repository already uses on itself: the agent rules
// in .github/instructions, the skills in .claude/skills, an example slop config
// and an example CI workflow. Copying the same files keeps one source for both.

import { copyFile, lstat, mkdir, symlink, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PACKAGE_DIR } from "./measure.ts";

/** Suffix of an agent rule file. Copilot reads these from .github/instructions. */
const RULE_SUFFIX = ".instructions.md";

/** One file that init writes, as paths relative to the package and to the target. */
type KitFile = { from: string; to: string };

/** What init did, as target-relative paths, so the caller can report it. */
type InitResult = { created: string[]; skipped: string[] };

/** Package-relative paths of the files, dotfiles included, that match `pattern`. */
function scanPackage(pattern: string): Promise<string[]> {
	return Array.fromAsync(
		new Bun.Glob(pattern).scan({ cwd: PACKAGE_DIR, dot: true, onlyFiles: true }),
	);
}

/**
 * The kit, read from the package directory. Fails when the package has no
 * rules or skills, which is the case for a vendored copy: init must run from an
 * installed package or a clone.
 */
async function kitFiles(): Promise<KitFile[]> {
	// Bun.Glob does not match a brace group that holds a path, so scan twice.
	const scanned = [
		...(await scanPackage(".claude/skills/**/*")),
		...(await scanPackage(`.github/instructions/*${RULE_SUFFIX}`)),
	];
	if (!scanned.some((file) => file.endsWith(RULE_SUFFIX))) {
		throw new Error(`no kit files in ${PACKAGE_DIR}; run init from an installed slopgate`);
	}
	return [
		...scanned.toSorted().map((file) => ({ from: file, to: file })),
		{ from: "examples/slop.config.json", to: "slop.config.json" },
		{ from: "examples/slopgate.yml", to: ".github/workflows/slopgate.yml" },
	];
}

/** Whether anything, a dangling symlink included, exists at `path`. */
async function exists(path: string): Promise<boolean> {
	return lstat(path).then(
		() => true,
		() => false,
	);
}

/**
 * Copy the kit into `target` and link each rule into .claude/rules, where
 * Claude Code reads it. Never overwrites a path unless `force` is set, so a
 * second run is safe and keeps local edits. On `force` an existing path is
 * removed first, because symlink() does not replace.
 */
async function init(target: string, force: boolean): Promise<InitResult> {
	const result: InitResult = { created: [], skipped: [] };
	const place = async (to: string, write: (path: string) => Promise<void>): Promise<void> => {
		const path = join(target, to);
		const present = await exists(path);
		if (present && !force) {
			result.skipped.push(to);
			return;
		}
		if (present) await unlink(path);
		await mkdir(dirname(path), { recursive: true });
		await write(path);
		result.created.push(to);
	};
	const files = await kitFiles();
	for (const { from, to } of files) {
		await place(to, (path) => copyFile(join(PACKAGE_DIR, from), path));
	}
	for (const { to } of files.filter((file) => file.to.endsWith(RULE_SUFFIX))) {
		const name = basename(to, RULE_SUFFIX);
		await place(`.claude/rules/${name}.md`, (path) =>
			symlink(`../../.github/instructions/${name}${RULE_SUFFIX}`, path),
		);
	}
	return result;
}

/** What to do after init, printed once at the end. */
const NEXT_STEPS = `Next steps:
  1. bun add -d github:asigdel29/slopgate
  2. Edit the include globs in slop.config.json for this repository.
  3. Add this line to AGENTS.md: "Before you edit a file, read each rule in
     .github/instructions whose applyTo glob matches it."
  4. Run: bunx slopgate --report`;

/**
 * The `init` subcommand: parse its arguments, run init and print the result.
 * Returns the process exit code. Throws on an unknown argument.
 */
export async function runInit(argv: string[]): Promise<number> {
	const { values } = parseArgs({
		args: argv,
		options: { root: { type: "string", default: "." }, force: { type: "boolean", default: false } },
		strict: true,
	});
	const { created, skipped } = await init(resolve(values.root), values.force);
	for (const path of created) console.log(`created  ${path}`);
	for (const path of skipped) console.log(`skipped  ${path} (exists; --force overwrites)`);
	console.log(`\n${NEXT_STEPS}`);
	return 0;
}
