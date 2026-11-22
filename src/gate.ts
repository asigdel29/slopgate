// The gate's verdict: which checks a measured change fails.
//
// Pure: it takes the measurements and the config and returns the failure
// messages. The CLI prints them and sets the exit code, so every rule here is
// testable without a repository or a process.

import type { SlopConfig, SlopMetrics } from "./config.ts";
import { METRICS } from "./config.ts";
import type { HotCallable } from "./hot.ts";
import { exceeds } from "./metrics.ts";
import { formatDeltaFailure, formatFailure, formatHotCallables } from "./report.ts";

/** Everything the verdict depends on. `base` and `hot` are null without --base. */
export type GateInput = {
	config: SlopConfig;
	configPath: string;
	head: SlopMetrics;
	base: SlopMetrics | null;
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
	const perChange =
		METRICS.some((m) => config.maxDelta[m] !== null) || config.hotCallables === true;
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
		return limit !== null && exceeds(head[m] - base[m], limit)
			? [formatDeltaFailure(m, base[m], head[m], limit)]
			: [];
	});
}

/** One failure for each metric over its absolute threshold, the optional backstop. */
function thresholdFailures({ config, head }: GateInput): string[] {
	return METRICS.flatMap((m) => {
		const ceiling = config.thresholds[m];
		return ceiling !== null && exceeds(head[m], ceiling)
			? [formatFailure(m, head[m], ceiling)]
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
