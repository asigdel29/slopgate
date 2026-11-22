// ast-grep invocation and result typing.
//
// One `ast-grep scan` pass per language yields every structural fact the engine
// needs (callables, decision points, comment spans) plus, once rule packs exist,
// the slop-rule hits for Eq. 4. Rule ids carry the meaning — see
// structural/typescript.yml for the id contract.

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Dialect } from "./config.ts";
import { runTool } from "./process.ts";
import { relativeTo } from "./sources.ts";
import { describeMissing, resolveTool } from "./tools.ts";

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
	/** The matched source text. */
	text?: string;
	/** Metavariables a rule captured, e.g. a callable's `$NAME`. */
	metaVariables?: { single?: Record<string, { text: string }> };
};

/**
 * argv has an OS-level size limit, and a large repo can exceed it. 400 paths at
 * a typical path length sits comfortably under the smallest limit we care about
 * while keeping the number of subprocess spawns low.
 */
const BATCH_SIZE = 400;

/**
 * Rewrite one rule file's text for another grammar: the `language:` line, and
 * a suffix on each `id:` so a re-targeted pack keeps unique ids.
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

/**
 * Write a copy of each rule file in `files` into `destDir`, re-targeted to
 * `dialect`, under the same base name. ast-grep reads a rule's grammar from
 * its `language:` line, so this is how one authored pack runs on .tsx too.
 */
export async function writeRetargeted({
	files,
	dialect,
	destDir,
}: {
	files: string[];
	dialect: Dialect;
	destDir: string;
}): Promise<void> {
	await mkdir(destDir, { recursive: true });
	for (const file of files) {
		const text = retargetRuleText(
			await Bun.file(file).text(),
			dialect.astGrepLanguage,
			dialect.idSuffix,
		);
		await writeFile(join(destDir, basename(file)), text, "utf8");
	}
}

/**
 * What kind of file is being handed to ast-grep. These take DIFFERENT flags and
 * are not interchangeable — passing a project config to `--rule` fails with
 * "Cannot parse rule", which is why this is explicit rather than inferred.
 *
 *   "rule"    a single rule file (possibly multi-document)  -> --rule
 *   "project" an sgconfig.yml with `ruleDirs:`              -> --config
 */
type RuleSource = { kind: "rule" | "project"; path: string };

/**
 * Scan `files` with `source` and return every match.
 *
 * Passing an explicit file list rather than letting ast-grep walk the tree keeps
 * include/exclude semantics in exactly one place (sources.ts), so the LOC
 * denominator and the scanned set can never disagree.
 *
 * There is no `--lang` flag: `ast-grep scan` takes the language from each rule's
 * `language:` field, which is what writeRetargeted above changes.
 */
export async function scan(source: RuleSource, files: string[], cwd: string): Promise<Match[]> {
	if (files.length === 0) return [];

	const bin = resolveTool("ast-grep", cwd);
	const flag = source.kind === "project" ? "--config" : "--rule";
	const matches: Match[] = [];

	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		const { stdout, stderr } = await runTool({
			bin,
			args: ["scan", flag, source.path, "--json", ...batch.map((f) => `${cwd}/${f}`)],
			name: "ast-grep",
			cwd,
			missingHint: describeMissing("ast-grep", cwd),
		});

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
				{ cause: err },
			);
		}
		for (const m of parsed) matches.push({ ...m, file: relativeTo(cwd, m.file) });
	}

	return matches;
}
