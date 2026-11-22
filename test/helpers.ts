// Builders and capture helpers that several suites share, so each test
// states only the fields it is about.

import { spyOn } from "bun:test";
import type { Callable, Language, SlopConfig } from "../src/config.ts";

/** A config that measures `include` in one language and gates nothing. */
export function configFor(language: Language, include: string[]): SlopConfig {
	return {
		languages: { [language]: { include, exclude: [] } },
		maxDelta: { erosion: null, verbosity: null },
		thresholds: { erosion: null, verbosity: null },
		hotCallables: false,
		calibratedAtRulePackVersion: 0,
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

/** What a captured call printed, and its result or the error it threw. */
type Captured<T> = { out: string; err: string } & (
	| { ok: true; value: T }
	| { ok: false; thrown: unknown }
);

/**
 * Run `fn` with console.log and console.error captured. The spies are always
 * restored, so a failed assertion cannot leave the console muted for later
 * tests.
 */
export async function captureConsole<T>(fn: () => Promise<T>): Promise<Captured<T>> {
	const log = spyOn(console, "log").mockImplementation(() => {});
	const error = spyOn(console, "error").mockImplementation(() => {});
	const text = (spy: typeof log): string =>
		spy.mock.calls.map((call) => String(call[0])).join("\n");
	try {
		const value = await fn();
		return { ok: true, value, out: text(log), err: text(error) };
	} catch (thrown) {
		return { ok: false, thrown, out: text(log), err: text(error) };
	} finally {
		log.mockRestore();
		error.mockRestore();
	}
}
