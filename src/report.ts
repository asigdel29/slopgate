// Output formatting for the slop gate.
//
// Kept free of process state and I/O so the wording can be asserted in tests.

import type { Callable, Metric, SlopConfig, SlopMetrics } from "./config.ts";
import {
	DEGRADATION_VELOCITY,
	HIGH_COMPLEXITY_CUTOFF,
	HUMAN_PANEL_REFERENCE,
	METRICS,
} from "./config.ts";
import { fixed, signed } from "./gate.ts";
import type { Measurement } from "./measure.ts";
import { isHighComplexity, mass } from "./metrics.ts";

/** How many of the most complex callables the report lists. */
const TOP_OFFENDERS = 10;

/** What the report shows: the head, the base when there is one, and the limits. */
type ReportInput = {
	/** The tree under test, with its callables for the offender list. */
	head: Measurement;
	/** The merge base's metrics, or null without --base. */
	base: SlopMetrics | null;
	/** The limits to print the verdicts against. */
	config: SlopConfig;
};

/** How many times faster an agent checkpoint moves `metric` than a median human commit. */
function agentSpeedup(metric: Metric): string {
	const { agentPerCheckpoint, humanMedian } = DEGRADATION_VELOCITY;
	return `${(agentPerCheckpoint[metric] / humanMedian[metric]).toFixed(1)}x`;
}

/** The change against the merge base: the number the gate decides on, so it leads. */
function deltaLines(head: SlopMetrics, { base, config }: ReportInput): string[] {
	if (base === null) return [];
	const { agentPerCheckpoint, humanMedian } = DEGRADATION_VELOCITY;
	return [
		"",
		"  Change against the merge base:",
		...METRICS.map((name) => {
			const delta = head[name] - base[name];
			const limit = config.maxDelta[name];
			const verdict =
				limit === null ? "not gated" : `${delta > limit ? "OVER" : "within"} the ${limit} limit`;
			return (
				`    ${name.padEnd(10)} ${fixed(base[name])} -> ${fixed(head[name])}  ` +
				`${signed(delta)}  (${verdict})`
			);
		}),
		"",
		`  The limits are the paper's median HUMAN per-commit velocity ` +
			`(erosion +${humanMedian.erosion}, verbosity +${humanMedian.verbosity}). ` +
			"An agent checkpoint moves them",
		`  +${agentPerCheckpoint.erosion} and +${agentPerCheckpoint.verbosity} — ` +
			`${agentSpeedup("erosion")} and ${agentSpeedup("verbosity")} faster. ` +
			"So this gate asks whether the change degrades the",
		"  codebase faster than a person typically would, not whether the codebase is good.",
	];
}

/** The callables that hold the most complexity mass: where to look when erosion fails. */
function offenderLines(callables: Callable[]): string[] {
	const offenders = callables
		.filter(isHighComplexity)
		.toSorted((a, b) => mass(b.complexity, b.sloc) - mass(a.complexity, a.sloc))
		.slice(0, TOP_OFFENDERS);
	if (offenders.length === 0) return [];
	return [
		"",
		"  Highest complexity mass:",
		...offenders.map(
			(c) =>
				`    ${c.file}:${c.startLine + 1}  CC ${c.complexity}, ${c.sloc} SLOC, ` +
				`mass ${mass(c.complexity, c.sloc).toFixed(0)}`,
		),
	];
}

/** The absolute backstop line, when a threshold is set. */
function backstopLines({ thresholds }: SlopConfig): string[] {
	if (thresholds.erosion === null && thresholds.verbosity === null) return [];
	return [
		"",
		`  Absolute backstop: erosion ${thresholds.erosion ?? "none"}, ` +
			`verbosity ${thresholds.verbosity ?? "none"}.`,
	];
}

/** The human-readable report: the two metrics, context, the delta and the offenders. */
export function formatReport(input: ReportInput): string {
	const { metrics, callables } = input.head;
	const { detail } = metrics;
	const panel = HUMAN_PANEL_REFERENCE;
	return [
		"Code degradation metrics — SlopCodeBench (arXiv:2603.24755)",
		"",
		`  Structural erosion  ${fixed(metrics.erosion)}   ` +
			`(${detail.highComplexityCallables}/${detail.callables} callables over CC ${HIGH_COMPLEXITY_CUTOFF}, ` +
			`${detail.highComplexityMass.toFixed(0)}/${detail.totalMass.toFixed(0)} complexity mass)`,
		`  Verbosity           ${fixed(metrics.verbosity)}   ` +
			`(${detail.unionLines}/${detail.loc} source lines; ` +
			`${detail.flaggedLines} rule-flagged, ${detail.cloneLines} cloned, deduplicated)`,
		"",
		`  Measured over ${detail.files} files, rule pack v${detail.rulePackVersion}.`,
		"",
		// Context, explicitly not a threshold — the panel is Python-only.
		`  For reference, ${panel.source} reports a human panel of ${panel.repos} open-source`,
		`  Python repos at erosion ${panel.erosion.mean} +/- ${panel.erosion.sd}, ` +
			`verbosity ${panel.verbosity.mean} +/- ${panel.verbosity.sd}, and agent`,
		`  checkpoints at erosion ${panel.agentCheckpoints.erosion}, verbosity ${panel.agentCheckpoints.verbosity}. ` +
			"Those are Python numbers and a",
		"  different language, so they are context here and never a pass/fail line.",
		...deltaLines(metrics, input),
		...backstopLines(input.config),
		...offenderLines(callables),
	].join("\n");
}
