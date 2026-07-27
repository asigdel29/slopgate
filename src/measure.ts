// The measurement pipeline: source files in, SlopMetrics out.
//
// Separate from bin/slopgate.ts so it can be imported by tests without the CLI's
// argument parsing and process.exit running as a side effect.

import { readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildCallables, isCommentRule } from "./callables.ts";
import { findCloneLines } from "./clones.ts";
import type {
	Callable,
	Dialect,
	FileMeasurement,
	Language,
	SlopConfig,
	SlopMetrics,
} from "./config.ts";
import { DIALECTS, LANGUAGES } from "./config.ts";
import { computeErosion, computeVerbosity } from "./metrics.ts";
import { createWorkspace, retargetRuleDir, retargetRules, scan } from "./scan.ts";
import { measureFiles, resolveFiles } from "./sources.ts";

/**
 * Package root — where structural/ and rules/ live. Resolved from this file
 * rather than the working directory, so the tool can measure a repository
 * nowhere near its own install location.
 */
export const PACKAGE_DIR = dirname(import.meta.dir);

export async function loadRulePackVersion(): Promise<number> {
	const file = Bun.file(join(PACKAGE_DIR, "rules", "VERSION"));
	if (!(await file.exists())) return 0;
	const parsed = Number.parseInt((await file.text()).trim(), 10);
	if (Number.isNaN(parsed)) throw new Error("rules/VERSION does not contain an integer");
	return parsed;
}

/**
 * Run the slop rule pack for one language dialect, returning flagged
 * `file:line` keys.
 *
 * Rules live one-per-file, so they are scanned through a generated ast-grep
 * project config (`ruleDirs`) rather than one subprocess per rule — with a full
 * pack that would be hundreds of spawns.
 *
 * Flagged lines are intersected with source lines for the same reason clone
 * lines are: Eq. 4's denominator counts source lines only.
 */
async function scanRulePack(
	language: Language,
	dialect: Dialect,
	files: string[],
	measurements: FileMeasurement[],
	workspace: string,
	root: string,
): Promise<Set<string>> {
	const authoredDir = join(PACKAGE_DIR, "rules", language);
	try {
		if ((await readdir(authoredDir)).filter((f) => f.endsWith(".yml")).length === 0) {
			return new Set();
		}
	} catch {
		// No rule pack for this language yet — verbosity is clone-lines-only,
		// which is a correct half of Eq. 4 rather than a failure.
		return new Set();
	}

	const ruleDir =
		dialect.idSuffix === ""
			? authoredDir
			: await retargetRuleDir(authoredDir, dialect.astGrepLanguage, dialect.idSuffix, workspace);

	const sgconfig = join(workspace, `sgconfig-${dialect.astGrepLanguage}.yml`);
	await writeFile(sgconfig, `ruleDirs:\n  - ${ruleDir}\n`, "utf8");

	const matches = await scan(sgconfig, files, root);
	const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));
	const flagged = new Set<string>();

	for (const match of matches) {
		const sourceLines = sourceLinesByFile.get(match.file);
		if (!sourceLines) continue;
		// A rule can span several lines; every source line it covers is flagged,
		// which is what "flagged lines" means in Eq. 4.
		for (let line = match.range.start.line; line <= match.range.end.line; line++) {
			if (sourceLines.has(line)) flagged.add(`${match.file}:${line}`);
		}
	}
	return flagged;
}

export type Measurement = {
	metrics: SlopMetrics;
	callables: Callable[];
};

export async function measure(config: SlopConfig, root: string): Promise<Measurement> {
	const rulePackVersion = await loadRulePackVersion();

	const allCallables: Callable[] = [];
	const allMeasurements: FileMeasurement[] = [];
	const flaggedLines = new Set<string>();

	const workspace = await createWorkspace();
	try {
		for (const language of LANGUAGES) {
			const languageConfig = config.languages[language];
			if (!languageConfig) continue;

			const languageFiles = await resolveFiles(languageConfig, root);
			if (languageFiles.length === 0) continue;

			const authoredRules = join(PACKAGE_DIR, "structural", `${language}.yml`);

			// One pass per grammar. `.ts` and `.tsx` parse differently, so they
			// cannot share a scan even though they share authored rules.
			for (const dialect of DIALECTS[language]) {
				const files = languageFiles.filter((f) =>
					dialect.extensions.some((ext) => f.endsWith(ext)),
				);
				if (files.length === 0) continue;

				const structuralRules =
					dialect.idSuffix === ""
						? authoredRules
						: await retargetRules(
								authoredRules,
								dialect.astGrepLanguage,
								dialect.idSuffix,
								workspace,
							);

				const matches = await scan(structuralRules, files, root);

				const measurements = await measureFiles(
					files,
					language,
					matches.filter((m) => isCommentRule(m.ruleId)),
					root,
				);
				allMeasurements.push(...measurements);
				allCallables.push(...buildCallables(matches, measurements, language));

				if (rulePackVersion > 0) {
					for (const key of await scanRulePack(
						language,
						dialect,
						files,
						measurements,
						workspace,
						root,
					)) {
						flaggedLines.add(key);
					}
				}
			}
		}
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}

	const erosion = computeErosion(allCallables);
	const cloneLines = await findCloneLines(allMeasurements, root);
	const loc = allMeasurements.reduce((sum, m) => sum + m.loc, 0);
	const verbosity = computeVerbosity(flaggedLines, cloneLines, loc);

	return {
		callables: allCallables,
		metrics: {
			erosion: erosion.erosion,
			verbosity: verbosity.verbosity,
			detail: {
				files: allMeasurements.length,
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
