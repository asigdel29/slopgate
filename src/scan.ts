// ast-grep invocation and result typing.
//
// One `ast-grep scan` pass per language yields every structural fact the engine
// needs (callables, decision points, comment spans) plus, once rule packs exist,
// the slop-rule hits for Eq. 4. Rule ids carry the meaning — see
// structural/typescript.yml for the id contract.

import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { resolveTool } from "./bin.ts";
import { runTool } from "./process.ts";

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
		const { stdout, stderr } = await runTool(
			"ast-grep",
			bin,
			["scan", flag, source.path, "--json", ...batch.map((f) => (cwd ? `${cwd}/${f}` : f))],
			{ cwd, root: cwd },
		);

		// ast-grep exits 0 even when it could not read some of the paths it was
		// given, reporting them only on stderr ("ERROR: <path>: No such file").
		// Those files would then contribute their lines to the LOC denominator
		// while contributing no callables, silently under-reporting erosion. A
		// successful scan writes nothing to stderr, so anything here is a fault.
		if (stderr.trim() !== "") {
			throw new Error(
				`ast-grep could not process every file:\n${stderr.trim()}\n` +
					"Refusing to report a metric computed from a partial scan.",
			);
		}

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
