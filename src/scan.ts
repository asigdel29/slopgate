// ast-grep invocation and result typing.
//
// One `ast-grep scan` pass per language yields every structural fact the engine
// needs (callables, decision points, comment spans) plus, once rule packs exist,
// the slop-rule hits for Eq. 4. Rule ids carry the meaning — see
// structural/typescript.yml for the id contract.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describeMissing, resolveTool } from "./bin.ts";

/** A single ast-grep match, narrowed to the fields the engine uses. */
export type Match = {
	ruleId: string;
	file: string;
	range: {
		byteOffset: { start: number; end: number };
		/** ast-grep lines are zero-based. */
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
};

/**
 * argv has an OS-level size limit, and a large repo can exceed it. 400 paths at
 * a typical path length sits comfortably under the smallest limit we care about
 * while keeping the number of subprocess spawns low.
 */
const BATCH_SIZE = 400;

function run(bin: string, args: string[], root: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (err) => {
			reject(new Error(`${describeMissing("ast-grep", root)}\n(${err.message})`));
		});
		child.on("close", (code) => {
			// ast-grep exits non-zero when a rule matches at error severity. Every
			// rule the engine ships is `hint`, so a non-zero exit here is a real
			// failure (bad rule file, unreadable path) and must not be swallowed.
			if (code !== 0 && stdout.trim() === "") {
				reject(new Error(`ast-grep exited ${code}: ${stderr.trim()}`));
				return;
			}
			resolve(stdout);
		});
	});
}

/**
 * Re-target a rule file at a different ast-grep language, returning the path to
 * a temporary copy.
 *
 * This exists for one reason: `.tsx` is a separate grammar from `.ts` in
 * ast-grep, and a rule declaring `language: typescript` will not match a `.tsx`
 * file at all. The alternative — authoring every rule twice — would mean
 * maintaining two copies of a 200-rule pack that must never drift. The TSX
 * grammar is a superset of TypeScript's, so every node kind the rules reference
 * exists in both.
 *
 * Rule ids get a suffix to stay unique, which is safe because the engine reads
 * ids by prefix (`callable-`, `dp-`, `meta-comment`), never by exact match.
 */
export function retargetRuleText(source: string, targetLanguage: string, idSuffix: string): string {
	return source
		.split("\n")
		.map((line) => {
			if (line.startsWith("language:")) return `language: ${targetLanguage}`;
			if (line.startsWith("id:")) return `${line.trimEnd()}${idSuffix}`;
			return line;
		})
		.join("\n");
}

/** Re-target a single rule file into `destDir`, returning the new path. */
export async function retargetRules(
	ruleFile: string,
	targetLanguage: string,
	idSuffix: string,
	destDir: string,
): Promise<string> {
	const rewritten = retargetRuleText(await Bun.file(ruleFile).text(), targetLanguage, idSuffix);
	const target = join(destDir, basename(ruleFile));
	await writeFile(target, rewritten, "utf8");
	return target;
}

/** Re-target every `.yml` in `ruleDir` into a fresh directory under `destDir`. */
export async function retargetRuleDir(
	ruleDir: string,
	targetLanguage: string,
	idSuffix: string,
	destDir: string,
): Promise<string> {
	const out = join(destDir, `rules-${targetLanguage}`);
	await mkdir(out, { recursive: true });
	for (const name of await readdir(ruleDir)) {
		if (!name.endsWith(".yml")) continue;
		const rewritten = retargetRuleText(
			await Bun.file(join(ruleDir, name)).text(),
			targetLanguage,
			idSuffix,
		);
		await writeFile(join(out, name), rewritten, "utf8");
	}
	return out;
}

/** A temp workspace for re-targeted rule files; caller removes it. */
export function createWorkspace(): Promise<string> {
	return mkdtemp(join(tmpdir(), "slop-"));
}

/**
 * Scan `files` with `ruleFile` and return every match.
 *
 * Passing an explicit file list rather than letting ast-grep walk the tree keeps
 * include/exclude semantics in exactly one place (sources.ts), so the LOC
 * denominator and the scanned set can never disagree.
 *
 * There is no `--lang` flag: `ast-grep scan` takes the language from each rule's
 * `language:` field, which is what retargetRules above manipulates.
 */
export async function scan(ruleFile: string, files: string[], cwd: string): Promise<Match[]> {
	if (files.length === 0) return [];

	const bin = resolveTool("ast-grep", cwd);
	const matches: Match[] = [];

	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		const stdout = await run(
			bin,
			["scan", "--rule", ruleFile, "--json", ...batch.map((f) => (cwd ? `${cwd}/${f}` : f))],
			cwd,
		);

		const trimmed = stdout.trim();
		if (trimmed === "") continue;

		let parsed: Match[];
		try {
			parsed = JSON.parse(trimmed) as Match[];
		} catch (err) {
			throw new Error(
				`ast-grep produced unparseable JSON for ${ruleFile}: ${(err as Error).message}`,
			);
		}
		// Re-relativise so downstream keys are stable regardless of how the
		// engine was invoked.
		for (const m of parsed) {
			matches.push({
				...m,
				file: cwd && m.file.startsWith(`${cwd}/`) ? m.file.slice(cwd.length + 1) : m.file,
			});
		}
	}

	return matches;
}
