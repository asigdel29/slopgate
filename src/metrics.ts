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

import type { Callable } from "./config.ts";
import { HIGH_COMPLEXITY_CUTOFF } from "./config.ts";

export type ErosionResult = {
	erosion: number;
	totalMass: number;
	highComplexityMass: number;
	callables: number;
	highComplexityCallables: number;
};

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

		if (callable.complexity > HIGH_COMPLEXITY_CUTOFF) {
			highComplexityMass += m;
			highCount++;
		}
	}

	return {
		// A codebase with no measurable callables has no concentration to report.
		// Zero is the honest answer and matches upstream returning 0.0 for an
		// empty symbol set.
		erosion: totalMass > 0 ? highComplexityMass / totalMass : 0,
		totalMass,
		highComplexityMass,
		callables: counted,
		highComplexityCallables: highCount,
	};
}

export type VerbosityResult = {
	verbosity: number;
	flaggedLines: number;
	cloneLines: number;
	unionLines: number;
	loc: number;
};

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
export function computeVerbosity(
	flaggedLines: Set<string>,
	cloneLines: Set<string>,
	loc: number,
): VerbosityResult {
	const union = new Set<string>(flaggedLines);
	for (const line of cloneLines) union.add(line);

	return {
		verbosity: loc > 0 ? union.size / loc : 0,
		flaggedLines: flaggedLines.size,
		cloneLines: cloneLines.size,
		unionLines: union.size,
		loc,
	};
}
