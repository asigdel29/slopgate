// Configuration + shared types for the slop gate.
//
// The engine itself is repo-agnostic: everything repo-specific (which files to
// measure, what the ratchet ceilings are) lives in scripts/slop.config.json, so
// this directory stays byte-identical wherever it is vendored.

/** Languages the structural rule packs cover. One authored rule file each. */
export const LANGUAGES = ["typescript", "swift"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * A grammar a language's rules must be run under, and the file extensions that
 * need it.
 *
 * TypeScript needs two: ast-grep treats `.tsx` as a distinct grammar from `.ts`,
 * so rules authored as `language: typescript` silently match nothing in a `.tsx`
 * file. Rather than maintain a duplicate rule pack, the engine re-targets the
 * authored one per dialect at run time (see scan.ts:retargetRules).
 */
export type Dialect = {
	/** ast-grep's `language:` identifier. */
	astGrepLanguage: string;
	extensions: string[];
	/** Appended to rule ids so a re-targeted pack keeps unique ids. */
	idSuffix: string;
};

export const DIALECTS: Record<Language, Dialect[]> = {
	typescript: [
		{ astGrepLanguage: "typescript", extensions: [".ts"], idSuffix: "" },
		{ astGrepLanguage: "tsx", extensions: [".tsx"], idSuffix: "-tsx" },
	],
	swift: [{ astGrepLanguage: "swift", extensions: [".swift"], idSuffix: "" }],
};

export type LanguageConfig = {
	/** Globs, relative to the repo root, of files to measure. */
	include: string[];
	/** Globs excluded from the measurement even if `include` matched them. */
	exclude?: string[];
};

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
	maxDelta: {
		erosion: number | null;
		verbosity: number | null;
	};
	/**
	 * Optional absolute backstop. Lower is better, so these only ever move DOWN.
	 * `null` — the default — means no absolute cap.
	 *
	 * An absolute ceiling on a whole-repo ratio is a ONE-TIME budget, not a
	 * per-change allowance: once consumed, every later change fails regardless of
	 * its own contribution. That is why it is not the primary mechanism. Use it
	 * only as a catastrophic-drift backstop, set far above the current value.
	 */
	thresholds: {
		erosion: number | null;
		verbosity: number | null;
	};
	/**
	 * Which rule-pack version the thresholds above were calibrated against.
	 * Adding slop rules can only raise verbosity, so a mismatch against
	 * rules/VERSION means the ceiling is not comparable to what is now being
	 * measured, and the gate refuses to compare rather than reporting a
	 * meaningless regression. See the slopgate README.
	 */
	calibratedAtRulePackVersion: number;
};

/** One callable with everything Eq. 2 needs. */
export type Callable = {
	file: string;
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
};

export type FileMeasurement = {
	file: string;
	language: Language;
	/** Source lines in the file — the per-file contribution to Eq. 4's LOC. */
	loc: number;
	/** Zero-based line numbers that are source lines. */
	sourceLines: Set<number>;
};

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
