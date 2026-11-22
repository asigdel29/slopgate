// The metrics themselves — SlopCodeBench Eq. 2, 3 and 4.
//
//   mass(f)   = CC(f) x sqrt(SLOC(f))                        (Eq. 2)
//   Erosion   = sum{f : CC(f) > 10} mass(f) / sum{f} mass(f)  (Eq. 3)
//   Verbosity = |flagged lines UNION clone lines| / LOC       (Eq. 4)
//
// Everything here is pure so the formulas can be tested against hand-computed
// values without any tooling in the loop; see metrics.test.ts.
//
// Reference: arXiv:2603.24755, cross-checked against upstream's
// src/slop_code/metrics/checkpoint/mass.py.

import type { Callable, SlopMetrics } from "./config.ts";
import { HIGH_COMPLEXITY_CUTOFF } from "./config.ts";

/** Eq. 3 and the sums and counts behind it, as the JSON `detail` names them. */
type ErosionResult = { erosion: number } & Pick<
	SlopMetrics["detail"],
	"callables" | "highComplexityCallables" | "totalMass" | "highComplexityMass"
>;

/**
 * Whether a callable counts toward the high-complexity share of erosion. The
 * erosion sum, the report's offender list and the hot-callable ratchet all use
 * this one rule, so they cannot disagree about which callables are hot.
 * A callable with no source lines has no mass, so it never counts.
 */
export function isHighComplexity(c: Callable): boolean {
	return c.sloc > 0 && c.complexity > HIGH_COMPLEXITY_CUTOFF;
}

/** Eq. 2. The square root compresses size so complexity dominates, not raw length. */
export function mass(complexity: number, sloc: number): number {
	return complexity * Math.sqrt(sloc);
}

/**
 * Eq. 3 — the share of total complexity mass held by functions above the
 * high-complexity cutoff.
 *
 * Callables with no source lines are skipped, matching upstream's `sloc <= 0`
 * guard: a bodiless declaration has no complexity to concentrate, and including
 * it would add a zero to both sums for no reason.
 */
export function computeErosion(callables: Callable[]): ErosionResult {
	let totalMass = 0;
	let highComplexityMass = 0;
	let counted = 0;
	let highCount = 0;

	for (const callable of callables) {
		if (callable.sloc <= 0) continue;

		const m = mass(callable.complexity, callable.sloc);
		totalMass += m;
		counted++;

		if (isHighComplexity(callable)) {
			highComplexityMass += m;
			highCount++;
		}
	}

	return {
		// A codebase with no measurable callables has no concentration to report.
		// Zero is the honest answer and matches upstream returning 0.0 for an
		// empty symbol set.
		erosion: totalMass > 0 ? highComplexityMass / totalMass : 0,
		callables: counted,
		highComplexityCallables: highCount,
		totalMass,
		highComplexityMass,
	};
}

/** Eq. 4 and the line counts behind it, as the JSON `detail` names them. */
type VerbosityResult = { verbosity: number } & Pick<
	SlopMetrics["detail"],
	"loc" | "flaggedLines" | "cloneLines" | "unionLines"
>;

/**
 * Eq. 4 — the fraction of source lines that are either rule-flagged or
 * duplicated.
 *
 * The union is what bounds this in [0, 1]: a line flagged by three rules AND
 * sitting inside a clone still counts once. Upstream's composites.py fallback
 * instead ADDS the two ratios, which can exceed 1; the paper defines the
 * deduplicated union, and that is what is implemented here.
 *
 * Both sets are keyed `file:line`, so dedup is per physical line rather than per
 * line number — two files sharing a line number stay distinct.
 */
export function computeVerbosity({
	flaggedLines,
	cloneLines,
	loc,
}: {
	flaggedLines: Set<string>;
	cloneLines: Set<string>;
	loc: number;
}): VerbosityResult {
	const union = flaggedLines.union(cloneLines);
	return {
		verbosity: loc > 0 ? union.size / loc : 0,
		loc,
		flaggedLines: flaggedLines.size,
		cloneLines: cloneLines.size,
		unionLines: union.size,
	};
}
