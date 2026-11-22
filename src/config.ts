// Configuration + shared types for the slop gate.
//
// The engine itself is repo-agnostic: everything repo-specific (which files to
// measure, what the ratchet ceilings are) lives in the repository's slop.config.json, so
// this directory stays byte-identical wherever it is vendored.

import { dirname } from "node:path";

/**
 * Package root — where structural/, rules/ and the kit live. Resolved from this
 * file rather than the working directory, so the tool can measure a repository
 * nowhere near its own install location.
 */
export const PACKAGE_DIR = dirname(import.meta.dir);

/** The two metrics, in report order. */
export const METRICS = ["erosion", "verbosity"] as const;
/** One of the two metrics. */
export type Metric = (typeof METRICS)[number];

/** Languages the structural rule packs cover. One authored rule file each. */
export const LANGUAGES = ["typescript", "swift"] as const;
/** One supported language, as a config key. */
export type Language = (typeof LANGUAGES)[number];

/** Which files of one language to measure. */
export type LanguageConfig = {
	/** Globs, relative to the repo root, of files to measure. */
	include: string[];
	/** Globs excluded from the measurement even if `include` matched them. */
	exclude?: string[];
};

/** One repository's slop.config.json, after validation. */
export type SlopConfig = {
	languages: Partial<Record<Language, LanguageConfig>>;
	/**
	 * How much a single change may move each metric — the primary gate.
	 *
	 * This is a RATE, which is what the paper actually measures and the only
	 * thing that transfers across languages and codebase sizes. The gate compares
	 * the merge base against the head, so it asks "how fast is this change
	 * degrading the codebase", not "how good is the codebase".
	 *
	 * `null` disables the delta check for that metric.
	 */
	maxDelta: Record<Metric, number | null>;
	/**
	 * Optional absolute backstop. Lower is better, so these only ever move DOWN.
	 * `null` — the default — means no absolute cap.
	 *
	 * An absolute ceiling on a whole-repo ratio is a ONE-TIME budget, not a
	 * per-change allowance: once consumed, every later change fails regardless of
	 * its own contribution. That is why it is not the primary mechanism. Use it
	 * only as a catastrophic-drift backstop, set far above the current value.
	 */
	thresholds: Record<Metric, number | null>;
	/**
	 * Which rule-pack version the thresholds above were calibrated against.
	 * Adding slop rules can only raise verbosity, so a mismatch against
	 * rules/VERSION means the ceiling is not comparable to what is now being
	 * measured, and the gate refuses to compare rather than reporting a
	 * meaningless regression. See the slopgate README.
	 */
	calibratedAtRulePackVersion: number;
	/**
	 * Gate each callable over the complexity cutoff: with `--base`, one that is new
	 * or has gained decision points fails the run (see hot.ts). The loader turns
	 * an absent key into false, so a config written before this rule keeps its
	 * behaviour and no caller repeats that default.
	 */
	hotCallables: boolean;
};

/** One callable with everything Eq. 2 needs. */
export type Callable = {
	/** The path, relative to the repository root. */
	file: string;
	/** The language the callable was measured as. */
	language: Language;
	/** Byte offsets into the UTF-8 file buffer. */
	startByte: number;
	endByte: number;
	/** Zero-based, inclusive. */
	startLine: number;
	endLine: number;
	/** McCabe cyclomatic complexity: 1 + decision points. */
	complexity: number;
	/** Source lines (blank and comment-only lines excluded). */
	sloc: number;
	/** The callable's name as the parser read it, or null when it has none. */
	name: string | null;
	/** Whether a `slopgate-allow` comment ends on the line above it. */
	waived: boolean;
};

/** One measured file and its source lines: the input to LOC and to per-callable SLOC. */
export type FileMeasurement = {
	/** The path, relative to the repository root. */
	file: string;
	/** The language the file was measured as. */
	language: Language;
	/** Source lines in the file — the per-file contribution to Eq. 4's LOC. */
	loc: number;
	/** All lines, blank and comment lines included, as jscpd counts them. */
	lineCount: number;
	/** Zero-based line numbers that are source lines. */
	sourceLines: Set<number>;
};

/** The two metrics for one tree, with the counts behind them. This is the JSON shape. */
export type SlopMetrics = {
	erosion: number;
	verbosity: number;
	/** Supporting counts, so a surprising number can be explained without a rerun. */
	detail: {
		files: number;
		callables: number;
		highComplexityCallables: number;
		totalMass: number;
		highComplexityMass: number;
		loc: number;
		flaggedLines: number;
		cloneLines: number;
		unionLines: number;
		rulePackVersion: number;
	};
};

/**
 * The paper's human-panel reference (Table 2, n=473 open-source Python repos).
 * Printed as context ONLY. It is never a threshold here: those numbers describe
 * Python repositories, so comparing a TypeScript or Swift codebase against them
 * would be a category error. The gate ratchets against the repo's own history.
 */
export const HUMAN_PANEL_REFERENCE = {
	repos: 473,
	erosion: { mean: 0.34, sd: 0.22 },
	verbosity: { mean: 0.19, sd: 0.11 },
	agentCheckpoints: { erosion: 0.68, verbosity: 0.44 },
	source: "arXiv:2603.24755 Table 2",
} as const;

/**
 * How fast each metric moves per step, from the paper's Section 3.3.
 *
 * These ARE transferable in a way the absolute panel means are not: they
 * describe a rate of change, not a language-specific level. The paper's central
 * finding is the gap between the two rows — agents accumulate erosion ~5x and
 * verbosity ~7x faster than human commits do.
 *
 * `humanMedian` is the recommended `maxDelta`, which makes the gate say exactly
 * this: a change may degrade the codebase no faster than a typical human commit
 * in the 473-repo panel does. That is a threshold the paper justifies, rather
 * than an arbitrary tolerance.
 *
 * These belong on a DELTA, never added to an absolute ceiling. Adding a
 * per-commit rate once to a whole-repo ratio yields a one-time budget that the
 * first few changes exhaust permanently — it looks like a velocity limit and
 * behaves like a quota.
 */
export const DEGRADATION_VELOCITY = {
	humanMedian: { erosion: 0.0053, verbosity: 0.0022 },
	agentPerCheckpoint: { erosion: 0.0264, verbosity: 0.0144 },
	source: "arXiv:2603.24755 section 3.3",
} as const;

/** Radon's high-complexity bound, and the cutoff in Eq. 3. Not configurable. */
export const HIGH_COMPLEXITY_CUTOFF = 10;

/**
 * The comment marker that exempts the callable below it from the hot-callable
 * ratchet (see hot.ts). A comment, so the exception is visible in review.
 */
export const WAIVER = "slopgate-allow";

/** Top-level keys a config may have. Any other key is a typo, so it is rejected. */
const CONFIG_KEYS = [
	"$comment",
	"$schema",
	"languages",
	"maxDelta",
	"thresholds",
	"hotCallables",
	"calibratedAtRulePackVersion",
];

/** Narrows an unknown JSON value to a plain object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One line for each key of `section` that is not in `allowed`, named by its full path. */
function unknownKeys({
	path,
	section,
	allowed,
}: {
	path: string;
	section: Record<string, unknown>;
	allowed: readonly string[];
}): string[] {
	return Object.keys(section)
		.filter((key) => !allowed.includes(key))
		.map((key) => `unknown key \`${path}${key}\` (allowed: ${allowed.join(", ")})`);
}

/** Whether `value` is an array of strings. */
function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** What is wrong with one entry of `languages`, one line for each problem. */
function languageEntryProblems(name: string, language: unknown): string[] {
	if (!LANGUAGES.includes(name as Language)) {
		return [`unknown language '${name}' (supported: ${LANGUAGES.join(", ")})`];
	}
	if (!isRecord(language)) return [`languages.${name} must be an object with \`include\``];
	return [
		...unknownKeys({
			path: `languages.${name}.`,
			section: language,
			allowed: ["include", "exclude"],
		}),
		...(isStringArray(language.include) && language.include.length > 0
			? []
			: [`languages.${name}.include must be a non-empty array of globs`]),
		...(language.exclude === undefined || isStringArray(language.exclude)
			? []
			: [`languages.${name}.exclude must be an array of globs`]),
	];
}

/** What is wrong with the `languages` section, one line for each problem. */
function languageProblems(languages: unknown): string[] {
	if (!isRecord(languages)) return ["`languages` must be an object with at least one language"];
	const entries = Object.entries(languages);
	if (entries.length === 0) return ["`languages` is empty — nothing would be measured"];
	return entries.flatMap(([name, language]) => languageEntryProblems(name, language));
}

/** What is wrong with a `maxDelta` or `thresholds` section, one line for each problem. */
function limitProblems(group: "maxDelta" | "thresholds", section: unknown): string[] {
	if (!isRecord(section))
		return [`\`${group}\` must be an object with \`erosion\` and \`verbosity\``];
	const values = METRICS.flatMap((metric) => {
		const value = section[metric];
		if (value === null || typeof value === "number") return [];
		const got = value === undefined ? "undefined — is the key missing or misspelt?" : typeof value;
		return [`${group}.${metric} must be a number or null (explicitly disabled), got ${got}`];
	});
	return [...unknownKeys({ path: `${group}.`, section, allowed: METRICS }), ...values];
}

/**
 * Read and VALIDATE the config at `configPath`. Throws one error that lists
 * every problem, so a user fixes them in one pass.
 *
 * Validation is not ceremony here. A missing or misspelled key yields
 * `undefined`, and `undefined` compares false against every ceiling test — so
 * an unvalidated typo silently disables the gate and reports a green build on a
 * codebase nothing measured. A gate that a typo can switch off is worse than no
 * gate, because it looks like one. For the same reason an unknown top-level key
 * is an error, not ignored: `"hotcallables": true` would leave the rule off.
 */
export async function loadConfig(configPath: string): Promise<SlopConfig> {
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		throw new Error(
			`missing config at ${configPath}\n` +
				"Every repository needs its own: which files to measure, and the ratchet " +
				"ceilings. Run `slopgate init`, or see examples/slop.config.json.",
		);
	}

	let parsed: unknown;
	try {
		parsed = await file.json();
	} catch (err) {
		throw new Error(`${configPath} is not valid JSON: ${(err as Error).message}`, { cause: err });
	}
	const config = isRecord(parsed) ? parsed : {};

	const problems = [
		...unknownKeys({ path: "", section: config, allowed: CONFIG_KEYS }),
		...languageProblems(config.languages),
		...limitProblems("maxDelta", config.maxDelta),
		...limitProblems("thresholds", config.thresholds),
		...(config.hotCallables === undefined || typeof config.hotCallables === "boolean"
			? []
			: ["`hotCallables` must be true, false, or absent (off)"]),
		...(typeof config.calibratedAtRulePackVersion === "number"
			? []
			: ["`calibratedAtRulePackVersion` must be a number"]),
	];
	if (problems.length > 0) {
		throw new Error(`${configPath} is not a usable slop config:\n  - ${problems.join("\n  - ")}`);
	}
	// Every field SlopConfig reads was checked above.
	return { ...config, hotCallables: config.hotCallables ?? false } as SlopConfig;
}
