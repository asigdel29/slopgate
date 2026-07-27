// Output formatting for the slop gate.
//
// Kept free of process state and I/O so the wording can be asserted in tests.

import type { Callable, SlopConfig, SlopMetrics } from "./config.ts";
import { DEGRADATION_VELOCITY, HIGH_COMPLEXITY_CUTOFF, HUMAN_PANEL_REFERENCE } from "./config.ts";
import { mass } from "./metrics.ts";

function pct(value: number): string {
	return value.toFixed(4);
}

/** The worst offenders, so a failing gate points at something actionable. */
export function topOffenders(callables: Callable[], limit: number): Callable[] {
	return [...callables]
		.filter((c) => c.complexity > HIGH_COMPLEXITY_CUTOFF && c.sloc > 0)
		.sort((a, b) => mass(b.complexity, b.sloc) - mass(a.complexity, a.sloc))
		.slice(0, limit);
}

function signed(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

export function formatReport(
	metrics: SlopMetrics,
	config: SlopConfig,
	callables: Callable[],
	base: SlopMetrics | null = null,
): string {
	const { detail } = metrics;
	const lines: string[] = [];

	lines.push("Code degradation metrics — SlopCodeBench (arXiv:2603.24755)");
	lines.push("");
	lines.push(
		`  Structural erosion  ${pct(metrics.erosion)}   ` +
			`(${detail.highComplexityCallables}/${detail.callables} callables over CC ${HIGH_COMPLEXITY_CUTOFF}, ` +
			`${detail.highComplexityMass.toFixed(0)}/${detail.totalMass.toFixed(0)} complexity mass)`,
	);
	lines.push(
		`  Verbosity           ${pct(metrics.verbosity)}   ` +
			`(${detail.unionLines}/${detail.loc} source lines; ` +
			`${detail.flaggedLines} rule-flagged, ${detail.cloneLines} cloned, deduplicated)`,
	);
	lines.push("");
	lines.push(`  Measured over ${detail.files} files, rule pack v${detail.rulePackVersion}.`);
	lines.push("");

	// Context, explicitly not a threshold — the panel is Python-only.
	lines.push(
		`  For reference, ${HUMAN_PANEL_REFERENCE.source} reports a human panel of 473 open-source`,
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

	// The delta is the number the gate actually decides on, so it leads.
	if (base !== null) {
		lines.push("");
		lines.push("  Change against the merge base:");
		for (const name of ["erosion", "verbosity"] as const) {
			const delta = metrics[name] - base[name];
			const limit = config.maxDelta[name];
			const verdict =
				typeof limit !== "number"
					? "not gated"
					: delta > limit
						? `OVER the ${limit} limit`
						: `within the ${limit} limit`;
			lines.push(
				`    ${name.padEnd(10)} ${base[name].toFixed(4)} -> ${metrics[name].toFixed(4)}  ` +
					`${signed(delta)}  (${verdict})`,
			);
		}
		lines.push("");
		lines.push(
			`  The limits are the paper's median HUMAN per-commit velocity ` +
				`(erosion +${DEGRADATION_VELOCITY.humanMedian.erosion}, verbosity ` +
				`+${DEGRADATION_VELOCITY.humanMedian.verbosity}). An agent checkpoint moves them`,
		);
		lines.push(
			`  +${DEGRADATION_VELOCITY.agentPerCheckpoint.erosion} and ` +
				`+${DEGRADATION_VELOCITY.agentPerCheckpoint.verbosity} — 5x and ~7x faster. ` +
				"So this gate asks whether the change degrades the",
		);
		lines.push("  codebase faster than a person typically would, not whether the codebase is good.");
	}

	const ceilings = config.thresholds;
	if (typeof ceilings.erosion === "number" || typeof ceilings.verbosity === "number") {
		lines.push("");
		lines.push(
			`  Absolute backstop: erosion ${ceilings.erosion ?? "none"}, ` +
				`verbosity ${ceilings.verbosity ?? "none"}.`,
		);
	}

	const offenders = topOffenders(callables, 10);
	if (offenders.length > 0) {
		lines.push("");
		lines.push("  Highest complexity mass:");
		for (const c of offenders) {
			lines.push(
				`    ${c.file}:${c.startLine + 1}  CC ${c.complexity}, ${c.sloc} SLOC, ` +
					`mass ${mass(c.complexity, c.sloc).toFixed(0)}`,
			);
		}
	}

	return lines.join("\n");
}

/**
 * A GitHub Actions error annotation. Matches the `::error::` convention the
 * coverage gate already uses, so a failure surfaces the same way in the UI.
 */
export function formatFailure(metric: "erosion" | "verbosity", value: number, ceiling: number): string {
	return (
		`::error::${metric} ${pct(value)} exceeds the ${ceiling} ratchet ceiling — ` +
		`this change concentrates complexity or adds redundant code. ` +
		`The ceiling is a one-way ratchet and must not be raised; ` +
		`reduce ${metric === "erosion" ? "branching in the largest functions" : "duplicated or flagged lines"} instead.`
	);
}

/**
 * The primary failure: this change degraded the codebase faster than a human
 * commit typically does.
 */
export function formatDeltaFailure(
	metric: "erosion" | "verbosity",
	before: number,
	after: number,
	limit: number,
): string {
	const delta = after - before;
	const humanRate = DEGRADATION_VELOCITY.humanMedian[metric];
	return (
		`::error::${metric} rose ${signed(delta)} (${before.toFixed(4)} -> ${after.toFixed(4)}), ` +
		`past the ${limit} allowed for one change. That is ${(delta / humanRate).toFixed(1)}x ` +
		`the median human commit in ${HUMAN_PANEL_REFERENCE.source}. ` +
		(metric === "erosion"
			? "Split the new branching into its own function instead of adding another arm to an existing one."
			: "Factor out the duplicated lines.")
	);
}
