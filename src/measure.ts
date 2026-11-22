// The measurement pipeline: source files in, SlopMetrics out.
//
// Separate from the CLI so tests and other tools can measure a tree without
// flags, output or an exit code.

import { readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { buildCallables, ruleKind } from "./callables.ts";
import { findCloneLines } from "./clones.ts";
import type { Callable, FileMeasurement, Language, SlopConfig, SlopMetrics } from "./config.ts";
import { LANGUAGES, PACKAGE_DIR } from "./config.ts";
import { computeErosion, computeVerbosity } from "./metrics.ts";
import { withTempDir } from "./process.ts";
import type { Dialect } from "./scan.ts";
import { DIALECTS, dialectRuleDir, scan } from "./scan.ts";
import { measureFiles, resolveFiles, sourceLineKeys } from "./sources.ts";

/**
 * The rule pack's version from its VERSION file in `rulesDir`. Version 0 turns
 * the pack off, so verbosity counts clones only. A missing file is an error,
 * not 0: a wrong SLOP_RULES_DIR would otherwise drop the rule-flagged half with
 * no word.
 */
async function loadRulePackVersion(rulesDir: string): Promise<number> {
	const path = join(rulesDir, "VERSION");
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(`no rule pack VERSION at ${path}; check SLOP_RULES_DIR`);
	}
	const parsed = Number.parseInt((await file.text()).trim(), 10);
	if (Number.isNaN(parsed)) throw new Error(`${path} does not contain an integer`);
	return parsed;
}

/**
 * The authored rule files for `language` in `rulesDir`. A pack with no folder
 * for the language has no rules for it yet, so verbosity counts clone lines
 * only, which is a correct half of Eq. 4. Any other read error is a fault.
 */
export async function rulePackFiles(rulesDir: string, language: Language): Promise<string[]> {
	const dir = join(rulesDir, language);
	try {
		return (await readdir(dir)).filter((f) => f.endsWith(".yml")).map((f) => join(dir, f));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
}

/** One dialect's share of a run: its files, and where to read and write. */
type DialectRun = {
	/** The language of the files. */
	language: Language;
	/** The grammar the files parse with. */
	dialect: Dialect;
	/** Paths relative to `root`, all with one of the dialect's extensions. */
	files: string[];
	/** A temp folder for re-targeted rules, removed after the run. */
	workspace: string;
	/** The repository root. */
	root: string;
	/** The rule pack folder, or null when the pack is off (VERSION 0). */
	rulesDir: string | null;
};

/** What one dialect contributes to the metrics. */
type DialectResult = {
	/** One entry for each file. */
	measurements: FileMeasurement[];
	/** The callables in those files. */
	callables: Callable[];
	/** Rule-flagged source lines, as `file:line` keys. */
	flagged: string[];
};

/**
 * Run the slop rule pack in `rulesDir` for one dialect and return the flagged
 * `file:line` keys.
 *
 * Rules live one-per-file, so they are scanned through a generated ast-grep
 * project config (`ruleDirs`) rather than one subprocess per rule — with a full
 * pack that would be hundreds of spawns.
 */
async function scanRulePack(
	run: DialectRun,
	sourceLinesByFile: Map<string, Set<number>>,
): Promise<string[]> {
	if (run.rulesDir === null) return [];
	const authored = await rulePackFiles(run.rulesDir, run.language);
	if (authored.length === 0) return [];
	const ruleDir = await dialectRuleDir({
		files: authored,
		dialect: run.dialect,
		destDir: join(run.workspace, `rules-${run.dialect.astGrepLanguage}`),
	});

	// A whole rule DIRECTORY can only be scanned through an ast-grep project
	// config, which takes --config, not --rule. The sgconfig is written to the
	// workspace root rather than inside ruleDir: anything under a `ruleDirs`
	// entry is itself parsed as a rule, and the config is not a valid rule.
	const sgconfig = join(run.workspace, `sgconfig-${run.dialect.astGrepLanguage}.yml`);
	await writeFile(sgconfig, `ruleDirs:\n  - ${ruleDir}\n`, "utf8");

	const matches = await scan({
		source: { kind: "project", path: sgconfig },
		files: run.files,
		cwd: run.root,
	});
	// A rule can span several lines; every source line it covers is flagged,
	// which is what "flagged lines" means in Eq. 4.
	return matches.flatMap((match) =>
		sourceLineKeys({
			file: match.file,
			sourceLines: sourceLinesByFile.get(match.file),
			startLine: match.range.start.line,
			endLine: match.range.end.line,
		}),
	);
}

/**
 * Measure one dialect's files. `.ts` and `.tsx` parse with different grammars,
 * so they cannot share a scan even though they share authored rules.
 */
async function measureDialect(run: DialectRun): Promise<DialectResult> {
	const authored = join(PACKAGE_DIR, "structural", `${run.language}.yml`);
	const structuralDir = await dialectRuleDir({
		files: [authored],
		dialect: run.dialect,
		destDir: join(run.workspace, `structural-${run.dialect.astGrepLanguage}`),
	});
	const structural = join(structuralDir, basename(authored));

	const matches = await scan({
		source: { kind: "rule", path: structural },
		files: run.files,
		cwd: run.root,
	});
	const comments = Map.groupBy(
		matches.filter((m) => ruleKind(m.ruleId) === "comment"),
		(m) => m.file,
	);
	const commentsByFile = new Map(
		[...comments].map(([file, spans]) => [
			file,
			spans.map((m): [number, number] => [m.range.byteOffset.start, m.range.byteOffset.end]),
		]),
	);
	const measurements = await measureFiles({
		files: run.files,
		language: run.language,
		commentsByFile,
		root: run.root,
	});
	const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));
	return {
		measurements,
		callables: buildCallables({ matches, sourceLinesByFile, language: run.language }),
		flagged: await scanRulePack(run, sourceLinesByFile),
	};
}

/** Order callables by file, then by position. */
function byPosition(a: Callable, b: Callable): number {
	if (a.file !== b.file) return a.file < b.file ? -1 : 1;
	return a.startByte - b.startByte;
}

/** The metrics, and the callables behind erosion for the report and the ratchet. */
export type Measurement = {
	/** The two metrics and their counts: the JSON output. */
	metrics: SlopMetrics;
	/** Every measured callable, in file and position order. */
	callables: Callable[];
};

/**
 * Measure the repository at `root` with `config`. Throws when an analyser
 * fails or a file cannot be read: a partial scan would give a wrong number
 * that looks like a real one.
 *
 * The rule pack comes from `SLOP_RULES_DIR`, which lets a project point at its
 * own rules and lets the tests use a temporary pack (upstream has the same
 * override, `AST_GREP_RULES_PATH`), or else from the package. It is read once
 * here, so the VERSION and the rules of one run come from one folder.
 */
export async function measure(config: SlopConfig, root: string): Promise<Measurement> {
	const rulesDir = process.env.SLOP_RULES_DIR ?? join(PACKAGE_DIR, "rules");
	const rulePackVersion = await loadRulePackVersion(rulesDir);

	const parts = await withTempDir("slop-", async (workspace) => {
		const results: DialectResult[] = [];
		for (const language of LANGUAGES) {
			const languageConfig = config.languages[language];
			const languageFiles = languageConfig ? await resolveFiles(languageConfig, root) : [];
			for (const dialect of DIALECTS[language]) {
				const files = languageFiles.filter((f) => dialect.extensions.includes(extname(f)));
				if (files.length === 0) continue;
				results.push(
					await measureDialect({
						language,
						dialect,
						files,
						workspace,
						root,
						rulesDir: rulePackVersion > 0 ? rulesDir : null,
					}),
				);
			}
		}
		return results;
	});

	const measurements = parts.flatMap((p) => p.measurements);
	// ast-grep returns matches in a varied order, and a float sum depends on its
	// order. Sorting first makes two runs on one tree give identical numbers.
	const callables = parts.flatMap((p) => p.callables).toSorted(byPosition);
	const { erosion, ...erosionDetail } = computeErosion(callables);
	const { verbosity, ...verbosityDetail } = computeVerbosity({
		flaggedLines: new Set(parts.flatMap((p) => p.flagged)),
		cloneLines: await findCloneLines(measurements, root),
		loc: measurements.reduce((sum, m) => sum + m.loc, 0),
	});

	return {
		callables,
		metrics: {
			erosion,
			verbosity,
			detail: {
				files: measurements.length,
				...erosionDetail,
				...verbosityDetail,
				rulePackVersion,
			},
		},
	};
}
