// The measurement pipeline: source files in, SlopMetrics out.
//
// Separate from the CLI so tests and other tools can measure a tree without
// flags, output or an exit code.

import { readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildCallables, ruleKind } from "./callables.ts";
import { findCloneLines } from "./clones.ts";
import type {
	Callable,
	Dialect,
	FileMeasurement,
	Language,
	SlopConfig,
	SlopMetrics,
} from "./config.ts";
import { DIALECTS, LANGUAGES, PACKAGE_DIR } from "./config.ts";
import { computeErosion, computeVerbosity } from "./metrics.ts";
import { withTempDir } from "./process.ts";
import { scan, writeRetargeted } from "./scan.ts";
import { measureFiles, resolveFiles } from "./sources.ts";

/**
 * Where the slop rule pack lives.
 *
 * `SLOP_RULES_DIR` overrides it, which lets a project point at its own rules and
 * — just as importantly — lets the tests exercise the rule-pack path without
 * mutating the shipped pack. Upstream's implementation has the same escape hatch
 * (`AST_GREP_RULES_PATH`).
 *
 * The directory must contain a `VERSION` file and one subdirectory per language.
 */
function rulesDir(): string {
	return process.env.SLOP_RULES_DIR ?? join(PACKAGE_DIR, "rules");
}

/**
 * The rule pack's version from its VERSION file. Version 0 turns the pack off,
 * so verbosity counts clones only. A missing file is an error, not 0: a wrong
 * SLOP_RULES_DIR would otherwise drop the rule-flagged half with no word.
 */
async function loadRulePackVersion(): Promise<number> {
	const path = join(rulesDir(), "VERSION");
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(`no rule pack VERSION at ${path}; check SLOP_RULES_DIR`);
	}
	const parsed = Number.parseInt((await file.text()).trim(), 10);
	if (Number.isNaN(parsed)) throw new Error(`${path} does not contain an integer`);
	return parsed;
}

/**
 * The authored rule files for `language`. A pack with no folder for the
 * language has no rules for it yet, so verbosity counts clone lines only, which
 * is a correct half of Eq. 4. Any other read error is a fault.
 */
async function rulePackFiles(language: Language): Promise<string[]> {
	const dir = join(rulesDir(), language);
	try {
		return (await readdir(dir)).filter((f) => f.endsWith(".yml")).map((f) => join(dir, f));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
}

/** One dialect's share of a run: its files, and where to read and write. */
type DialectRun = {
	language: Language;
	dialect: Dialect;
	files: string[];
	/** A temp folder for re-targeted rules, removed after the run. */
	workspace: string;
	root: string;
	rulePack: boolean;
};

/** What one dialect contributes to the metrics. */
type DialectResult = {
	measurements: FileMeasurement[];
	callables: Callable[];
	/** Rule-flagged source lines, as `file:line` keys. */
	flagged: string[];
};

/**
 * Run the slop rule pack for one dialect and return the flagged `file:line`
 * keys.
 *
 * Rules live one-per-file, so they are scanned through a generated ast-grep
 * project config (`ruleDirs`) rather than one subprocess per rule — with a full
 * pack that would be hundreds of spawns.
 *
 * Flagged lines are intersected with source lines for the same reason clone
 * lines are: Eq. 4's denominator counts source lines only.
 */
async function scanRulePack(
	run: DialectRun,
	sourceLinesByFile: Map<string, Set<number>>,
): Promise<string[]> {
	const authored = await rulePackFiles(run.language);
	if (authored.length === 0) return [];

	const authoredGrammar = run.dialect.idSuffix === "";
	const ruleDir = authoredGrammar
		? join(rulesDir(), run.language)
		: join(run.workspace, `rules-${run.dialect.astGrepLanguage}`);
	if (!authoredGrammar)
		await writeRetargeted({ files: authored, dialect: run.dialect, destDir: ruleDir });

	// A whole rule DIRECTORY can only be scanned through an ast-grep project
	// config, which takes --config, not --rule. The sgconfig is written to the
	// workspace root rather than inside ruleDir: anything under a `ruleDirs`
	// entry is itself parsed as a rule, and the config is not a valid rule.
	const sgconfig = join(run.workspace, `sgconfig-${run.dialect.astGrepLanguage}.yml`);
	await writeFile(sgconfig, `ruleDirs:\n  - ${ruleDir}\n`, "utf8");

	const matches = await scan({ kind: "project", path: sgconfig }, run.files, run.root);
	// A rule can span several lines; every source line it covers is flagged,
	// which is what "flagged lines" means in Eq. 4.
	return matches.flatMap((match) => {
		const sourceLines = sourceLinesByFile.get(match.file);
		const keys: string[] = [];
		for (let line = match.range.start.line; line <= match.range.end.line; line++) {
			if (sourceLines?.has(line)) keys.push(`${match.file}:${line}`);
		}
		return keys;
	});
}

/**
 * Measure one dialect's files. `.ts` and `.tsx` parse with different grammars,
 * so they cannot share a scan even though they share authored rules: a dialect
 * other than the authored one scans a re-targeted copy.
 */
async function measureDialect(run: DialectRun): Promise<DialectResult> {
	const authored = join(PACKAGE_DIR, "structural", `${run.language}.yml`);
	const retargetDir = join(run.workspace, `structural-${run.dialect.astGrepLanguage}`);
	const structural = run.dialect.idSuffix === "" ? authored : join(retargetDir, basename(authored));
	if (structural !== authored)
		await writeRetargeted({ files: [authored], dialect: run.dialect, destDir: retargetDir });

	const matches = await scan({ kind: "rule", path: structural }, run.files, run.root);
	const comments = matches.filter((m) => ruleKind(m.ruleId) === "comment");
	const measurements = await measureFiles(run.files, run.language, comments, run.root);
	const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));
	return {
		measurements,
		callables: buildCallables(matches, measurements, run.language),
		flagged: run.rulePack ? await scanRulePack(run, sourceLinesByFile) : [],
	};
}

/** Order callables by file, then by position. */
function byPosition(a: Callable, b: Callable): number {
	if (a.file !== b.file) return a.file < b.file ? -1 : 1;
	return a.startByte - b.startByte;
}

/** The metrics, and the callables behind erosion for the report and the ratchet. */
export type Measurement = {
	metrics: SlopMetrics;
	callables: Callable[];
};

/**
 * Measure the repository at `root` with `config`. Throws when an analyser
 * fails or a file cannot be read: a partial scan would give a wrong number
 * that looks like a real one.
 */
export async function measure(config: SlopConfig, root: string): Promise<Measurement> {
	const rulePackVersion = await loadRulePackVersion();

	const parts = await withTempDir("slop-", async (workspace) => {
		const results: DialectResult[] = [];
		for (const language of LANGUAGES) {
			const languageConfig = config.languages[language];
			const languageFiles = languageConfig ? await resolveFiles(languageConfig, root) : [];
			for (const dialect of DIALECTS[language]) {
				const files = languageFiles.filter((f) =>
					dialect.extensions.some((ext) => f.endsWith(ext)),
				);
				if (files.length === 0) continue;
				const run = { language, dialect, files, workspace, root, rulePack: rulePackVersion > 0 };
				results.push(await measureDialect(run));
			}
		}
		return results;
	});

	const measurements = parts.flatMap((p) => p.measurements);
	// ast-grep returns matches in a varied order, and a float sum depends on its
	// order. Sorting first makes two runs on one tree give identical numbers.
	const callables = parts.flatMap((p) => p.callables).toSorted(byPosition);
	const erosion = computeErosion(callables);
	const cloneLines = await findCloneLines(measurements, root);
	const loc = measurements.reduce((sum, m) => sum + m.loc, 0);
	const verbosity = computeVerbosity(new Set(parts.flatMap((p) => p.flagged)), cloneLines, loc);

	return {
		callables,
		metrics: {
			erosion: erosion.erosion,
			verbosity: verbosity.verbosity,
			detail: {
				files: measurements.length,
				callables: erosion.callables,
				highComplexityCallables: erosion.highComplexityCallables,
				totalMass: erosion.totalMass,
				highComplexityMass: erosion.highComplexityMass,
				loc: verbosity.loc,
				flaggedLines: verbosity.flaggedLines,
				cloneLines: verbosity.cloneLines,
				unionLines: verbosity.unionLines,
				rulePackVersion,
			},
		},
	};
}
