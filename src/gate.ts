// The gate's verdict: which checks a measured change fails.
//
// Pure: it takes the measurements and the config and returns the failure
// messages. The CLI prints them and sets the exit code, so every rule here is
// testable without a repository or a process.

import type { Metric, SlopConfig, SlopMetrics } from "./config.ts";
import {
	DEGRADATION_VELOCITY,
	HIGH_COMPLEXITY_CUTOFF,
	HUMAN_PANEL_REFERENCE,
	METRICS,
	WAIVER,
} from "./config.ts";
import type { HotCallable } from "./hot.ts";

/** A metric value, at the precision every message and report line uses. */
export function fixed(value: number): string {
	return value.toFixed(4);
}

/** A delta with its sign, so a fall reads as clearly as a rise. */
export function signed(value: number): string {
	return `${value >= 0 ? "+" : ""}${fixed(value)}`;
}

/** One metric's change against its maxDelta: the base and head levels, and the limit. */
type Breach = { metric: Metric; before: number; after: number; limit: number };

/** One metric's level against its absolute threshold. */
type Overshoot = { metric: Metric; value: number; ceiling: number };

/**
 * The absolute backstop failure, as a GitHub Actions `::error::` annotation, so
 * it shows inline in the pull request.
 */
function thresholdMessage({ metric, value, ceiling }: Overshoot): string {
	return (
		`::error::${metric} ${fixed(value)} exceeds the ${ceiling} ratchet ceiling — ` +
		`this change concentrates complexity or adds redundant code. ` +
		`The ceiling is a one-way ratchet and must not be raised; ` +
		`reduce ${metric === "erosion" ? "branching in the largest functions" : "duplicated or flagged lines"} instead.`
	);
}

/**
 * The primary failure: this change degraded the codebase faster than a human
 * commit typically does.
 */
function deltaMessage({ metric, before, after, limit }: Breach): string {
	const delta = after - before;
	const humanRate = DEGRADATION_VELOCITY.humanMedian[metric];
	return (
		`::error::${metric} rose ${signed(delta)} (${fixed(before)} -> ${fixed(after)}), ` +
		`past the ${limit} allowed for one change. That is ${(delta / humanRate).toFixed(1)}x ` +
		`the median human commit in ${HUMAN_PANEL_REFERENCE.source}. ` +
		(metric === "erosion"
			? "Split the new branching into its own function instead of adding another arm to an existing one."
			: "Factor out the duplicated lines.")
	);
}

/**
 * The per-callable failure: one annotation per offending callable, anchored on
 * its line so the pull request's diff view shows it in place.
 */
export function formatHotCallables(hot: HotCallable[]): string[] {
	return hot.map((h) => {
		const what =
			h.baseComplexity === null
				? `is new at CC ${h.complexity}`
				: `grew from CC ${h.baseComplexity} to ${h.complexity}`;
		return (
			`::error file=${h.file},line=${h.line}::${h.name ?? "this callable"} ${what}, over the ` +
			`CC ${HIGH_COMPLEXITY_CUTOFF} cutoff. Move the new branching into its own function ` +
			`rather than adding it here. If this one is deliberate, put a \`${WAIVER}: <reason>\` ` +
			"comment on the line above it."
		);
	});
}

/** Everything the verdict depends on. */
export type GateInput = {
	/** The validated config of the measured repository. */
	config: SlopConfig;
	/** Where the config came from, so a message can name the file to edit. */
	configPath: string;
	/** The metrics of the tree under test. */
	head: SlopMetrics;
	/** The metrics of the merge base, or null without --base. */
	base: SlopMetrics | null;
	/** The callables that break the ratchet, or null when the rule is off or there is no base. */
	hot: HotCallable[] | null;
};

/**
 * A failure that stops the run before any other check, because the numbers
 * after it would mean nothing, or null. Two cases: an absolute threshold set
 * against an older rule pack, and a per-change rule (maxDelta or hotCallables)
 * with no base to compare. Skipping the per-change rules in silence would make
 * a change look checked when it was not, which is the failure this tool exists
 * to prevent.
 */
function stoppingFailure({ config, configPath, head, base }: GateInput): string | null {
	const usesThreshold = METRICS.some((m) => config.thresholds[m] !== null);
	if (usesThreshold && config.calibratedAtRulePackVersion !== head.detail.rulePackVersion) {
		return (
			`::error::rule pack is v${head.detail.rulePackVersion} but the ceilings in ` +
			`${configPath} were calibrated against v${config.calibratedAtRulePackVersion}. ` +
			"Re-run with --report, write the new ceilings and calibratedAtRulePackVersion " +
			"into that file, and commit them together."
		);
	}
	const perChange = METRICS.some((m) => config.maxDelta[m] !== null) || config.hotCallables;
	if (base === null && perChange) {
		return (
			"::error::maxDelta or hotCallables is configured but --base was not given, so the " +
			"change itself was never measured. Pass the PR's base ref (e.g. --base origin/main), " +
			"or set maxDelta to null and hotCallables to false to opt out deliberately."
		);
	}
	return null;
}

/** One failure for each metric whose change against the base is over its maxDelta. */
function deltaFailures({ config, head, base }: GateInput): string[] {
	if (base === null) return [];
	return METRICS.flatMap((m) => {
		const limit = config.maxDelta[m];
		return limit !== null && head[m] - base[m] > limit
			? [deltaMessage({ metric: m, before: base[m], after: head[m], limit })]
			: [];
	});
}

/** One failure for each metric over its absolute threshold, the optional backstop. */
function thresholdFailures({ config, head }: GateInput): string[] {
	return METRICS.flatMap((m) => {
		const ceiling = config.thresholds[m];
		return ceiling !== null && head[m] > ceiling
			? [thresholdMessage({ metric: m, value: head[m], ceiling })]
			: [];
	});
}

/**
 * Every failure for this run, each one a message to print. Empty means pass.
 * The hot callables print as one block, one annotation for each line.
 */
export function decide(input: GateInput): string[] {
	const stop = stoppingFailure(input);
	if (stop !== null) return [stop];
	const hot = formatHotCallables(input.hot ?? []);
	return [
		...deltaFailures(input),
		...(hot.length > 0 ? [hot.join("\n")] : []),
		...thresholdFailures(input),
	];
}
