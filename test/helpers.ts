// Builders that several suites share, so each test states only the fields it
// is about.

import type { Callable, Language, SlopConfig } from "../src/config.ts";

/** A config that measures `include` in one language and gates nothing. */
export function configFor(
	language: Language,
	include: string[],
	calibratedAtRulePackVersion = 0,
): SlopConfig {
	return {
		languages: { [language]: { include, exclude: [] } },
		maxDelta: { erosion: null, verbosity: null },
		thresholds: { erosion: null, verbosity: null },
		calibratedAtRulePackVersion,
	};
}

/** A callable with the given fields. Every other field has a fixed, valid value. */
export function callable(fields: Partial<Callable>): Callable {
	return {
		file: "a.ts",
		language: "typescript",
		startByte: 0,
		endByte: 1,
		startLine: 0,
		endLine: 0,
		complexity: 1,
		sloc: 1,
		name: null,
		waived: false,
		...fields,
	};
}
