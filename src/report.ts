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
import { exceeds, fixed, signed } from "./gate.ts";
import { isHighComplexity, mass } from "./metrics.ts";

/** How many of the most complex callables the report lists. */
const TOP_OFFENDERS = 10;

/** How many times faster an agent checkpoint moves `metric` than a median human commit. */
function agentSpeedup(metric: Metric): string {
	const { agentPerCheckpoint, humanMedian } = DEGRADATION_VELOCITY;
	return `${(agentPerCheckpoint[metric] / humanMedian[metric]).toFixed(1)}x`;
}

/** The change against the merge base: the number the gate decides on, so it leads. */
function deltaLines(metrics: SlopMetrics, base: SlopMetrics, config: SlopConfig): string[] {
	const { agentPerCheckpoint, humanMedian } = DEGRADATION_VELOCITY;
	return [
		"",
		"  Change against the merge base:",
		...METRICS.map((name) => {
			const delta = metrics[name] - base[name];
			const limit = config.maxDelta[name];
			const verdict =
				limit === null
					? "not gated"
					: `${exceeds(delta, limit) ? "OVER" : "within"} the ${limit} limit`;
			return (
				`    ${name.padEnd(10)} ${fixed(base[name])} -> ${fixed(metrics[name])}  ` +
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

/** The human-readable report: the two metrics, context, the delta and the offenders. */
export function formatReport(
	metrics: SlopMetrics,
	config: SlopConfig,
	callables: Callable[],
	base: SlopMetrics | null,
): string {
	const { detail } = metrics;
	const lines: string[] = [];

	lines.push("Code degradation metrics — SlopCodeBench (arXiv:2603.24755)");
	lines.push("");
	lines.push(
		`  Structural erosion  ${fixed(metrics.erosion)}   ` +
			`(${detail.highComplexityCallables}/${detail.callables} callables over CC ${HIGH_COMPLEXITY_CUTOFF}, ` +
			`${detail.highComplexityMass.toFixed(0)}/${detail.totalMass.toFixed(0)} complexity mass)`,
	);
	lines.push(
		`  Verbosity           ${fixed(metrics.verbosity)}   ` +
			`(${detail.unionLines}/${detail.loc} source lines; ` +
			`${detail.flaggedLines} rule-flagged, ${detail.cloneLines} cloned, deduplicated)`,
	);
	lines.push("");
	lines.push(`  Measured over ${detail.files} files, rule pack v${detail.rulePackVersion}.`);
	lines.push("");

	// Context, explicitly not a threshold — the panel is Python-only.
	lines.push(
		`  For reference, ${HUMAN_PANEL_REFERENCE.source} reports a human panel of ${HUMAN_PANEL_REFERENCE.repos} open-source`,
	);
	lines.push(
		`  Python repos at erosion ${HUMAN_PANEL_REFERENCE.erosion.mean} +/- ${HUMAN_PANEL_REFERENCE.erosion.sd}, ` +
			`verbosity ${HUMAN_PANEL_REFERENCE.verbosity.mean} +/- ${HUMAN_PANEL_REFERENCE.verbosity.sd}, and agent`,
	);
	lines.push(
		`  checkpoints at erosion ${HUMAN_PANEL_REFERENCE.agentCheckpoints.erosion}, verbosity ${HUMAN_PANEL_REFERENCE.agentCheckpoints.verbosity}. ` +
			"Those are Python numbers and a",
	);
	lines.push("  different language, so they are context here and never a pass/fail line.");

	if (base !== null) lines.push(...deltaLines(metrics, base, config));

	const ceilings = config.thresholds;
	if (ceilings.erosion !== null || ceilings.verbosity !== null) {
		lines.push("");
		lines.push(
			`  Absolute backstop: erosion ${ceilings.erosion ?? "none"}, ` +
				`verbosity ${ceilings.verbosity ?? "none"}.`,
		);
	}

	lines.push(...offenderLines(callables));

	return lines.join("\n");
}
