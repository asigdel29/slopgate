// Output formatting for the slop gate.
//
// Kept free of process state and I/O so the wording can be asserted in tests.

import type { Callable, SlopConfig, SlopMetrics } from "./config.ts";
import { DEGRADATION_VELOCITY, HIGH_COMPLEXITY_CUTOFF, HUMAN_PANEL_REFERENCE } from "./config.ts";

function pct(value: number): string {
	return value.toFixed(4);
}

/** The worst offenders, so a failing gate points at something actionable. */
export function topOffenders(callables: Callable[], limit: number): Callable[] {
	return [...callables]
		.filter((c) => c.complexity > HIGH_COMPLEXITY_CUTOFF && c.sloc > 0)
		.sort((a, b) => b.complexity * Math.sqrt(b.sloc) - a.complexity * Math.sqrt(a.sloc))
		.slice(0, limit);
}

export function formatReport(
	metrics: SlopMetrics,
	config: SlopConfig,
	callables: Callable[],
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

	const ceilings = config.thresholds;
	if (ceilings.erosion !== null || ceilings.verbosity !== null) {
		lines.push("");
		lines.push(
			`  Ratchet ceilings: erosion ${ceilings.erosion ?? "uncalibrated"}, ` +
				`verbosity ${ceilings.verbosity ?? "uncalibrated"}.`,
		);
		// Headroom against the paper's human-median velocity is the number that
		// actually tells you whether the next commit has room, so show it.
		if (ceilings.erosion !== null) {
			const headroom = ceilings.erosion - metrics.erosion;
			lines.push(
				`  Erosion headroom ${headroom >= 0 ? "+" : ""}${headroom.toFixed(4)} ` +
					`(a median human commit moves it +${DEGRADATION_VELOCITY.humanMedian.erosion}, ` +
					`an agent checkpoint +${DEGRADATION_VELOCITY.agentPerCheckpoint.erosion}).`,
			);
		}
		if (ceilings.verbosity !== null) {
			const headroom = ceilings.verbosity - metrics.verbosity;
			lines.push(
				`  Verbosity headroom ${headroom >= 0 ? "+" : ""}${headroom.toFixed(4)} ` +
					`(median human commit +${DEGRADATION_VELOCITY.humanMedian.verbosity}, ` +
					`agent checkpoint +${DEGRADATION_VELOCITY.agentPerCheckpoint.verbosity}).`,
			);
		}
	}

	const offenders = topOffenders(callables, 10);
	if (offenders.length > 0) {
		lines.push("");
		lines.push("  Highest complexity mass:");
		for (const c of offenders) {
			lines.push(
				`    ${c.file}:${c.startLine + 1}  CC ${c.complexity}, ${c.sloc} SLOC, ` +
					`mass ${(c.complexity * Math.sqrt(c.sloc)).toFixed(0)}`,
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
