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
			// ANY non-zero exit is a hard failure. ast-grep only exits non-zero for
			// error-severity matches or a genuine fault (unparseable rule file,
			// unreadable path); every rule shipped here is `hint` or `warning`, both
			// of which exit 0 even when they match. Accepting a non-zero exit
			// because some stdout arrived would mean computing metrics from a
			// partial scan — a wrong number that looks like a real one, which is
			// worse than a failed build.
			if (code !== 0) {
				reject(
					new Error(
						`ast-grep exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
					),
				);
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
 * What kind of file is being handed to ast-grep. These take DIFFERENT flags and
 * are not interchangeable — passing a project config to `--rule` fails with
 * "Cannot parse rule", which is why this is explicit rather than inferred.
 *
 *   "rule"    a single rule file (possibly multi-document)  -> --rule
 *   "project" an sgconfig.yml with `ruleDirs:`              -> --config
 */
export type RuleSource = { kind: "rule" | "project"; path: string };

/**
 * Scan `files` with `source` and return every match.
 *
 * Passing an explicit file list rather than letting ast-grep walk the tree keeps
 * include/exclude semantics in exactly one place (sources.ts), so the LOC
 * denominator and the scanned set can never disagree.
 *
 * There is no `--lang` flag: `ast-grep scan` takes the language from each rule's
 * `language:` field, which is what retargetRules above manipulates.
 */
export async function scan(source: RuleSource, files: string[], cwd: string): Promise<Match[]> {
	if (files.length === 0) return [];

	const bin = resolveTool("ast-grep", cwd);
	const flag = source.kind === "project" ? "--config" : "--rule";
	const matches: Match[] = [];

	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		const stdout = await run(
			bin,
			["scan", flag, source.path, "--json", ...batch.map((f) => (cwd ? `${cwd}/${f}` : f))],
			cwd,
		);

		const trimmed = stdout.trim();
		if (trimmed === "") continue;

		let parsed: Match[];
		try {
			parsed = JSON.parse(trimmed) as Match[];
		} catch (err) {
			throw new Error(
				`ast-grep produced unparseable JSON for ${source.path}: ${(err as Error).message}`,
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
