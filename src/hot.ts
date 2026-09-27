// The hot-callable ratchet: a per-callable complement to the ratio gates.
//
// Erosion is a ratio over the whole repository, so a change can add branches to
// a function that is already far over the complexity cutoff and still move the
// ratio by less than the per-change limit: the denominator is large, and a
// single function is a small share of it. Run after run of changes like that
// eats the absolute backstop without any one of them failing. This rule looks at
// the callables themselves instead. A callable over the cutoff may not be new,
// and may not gain decision points. Its size in the codebase does not matter.
//
// Identity across revisions is the callable's file and name, falling back to the
// callable's first line when no name can be read off it. A renamed or moved
// function therefore reads as new, which is the conservative reading; a
// `slopgate-allow` comment on the line above a callable exempts it, so the
// exception is visible in review.

import type { Callable } from "./config.ts";
import { HIGH_COMPLEXITY_CUTOFF } from "./config.ts";

/** A callable plus the identity used to find it in the other revision. */
export type KeyedCallable = Callable & {
	/** The callable's name as read off its first line, or that line trimmed. */
	name: string;
	/** Whether the line above the callable carries a `slopgate-allow` waiver. */
	waived: boolean;
};

/** One callable that breaks the ratchet, with what it was on the base. */
export type HotCallable = {
	file: string;
	/** One-based, for editors and annotations. */
	line: number;
	name: string;
	complexity: number;
	/** The base revision's complexity, or null when the callable is new. */
	baseComplexity: number | null;
};

/** The marker that exempts one callable from the ratchet. */
export const WAIVER = "slopgate-allow";

// The first identifier followed by `(`, `=`, `:` or a type-parameter list reads
// as the name: `function runTurn(`, `const runTurn = async (`, `async handle(`,
// `get value(`, `func render(` all resolve to the callable's own name.
const NAME = /([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(=:]/;

/**
 * The name a callable is known by, read off its first line.
 *
 * Keywords before the name (`export`, `async`, `function`, `private`) are never
 * followed by one of the delimiters, so the first match is the name itself.
 */
export function callableName(firstLine: string): string {
	const trimmed = firstLine.trim();
	return NAME.exec(trimmed)?.[1] ?? trimmed;
}

/**
 * Attach names and waivers to callables by reading their files under `root`.
 *
 * Each file is read once, however many callables it holds.
 */
export async function keyCallables(callables: Callable[], root: string): Promise<KeyedCallable[]> {
	const linesByFile = new Map<string, string[]>();
	const keyed: KeyedCallable[] = [];
	for (const callable of callables) {
		let lines = linesByFile.get(callable.file);
		if (lines === undefined) {
			lines = (await Bun.file(`${root}/${callable.file}`).text()).split("\n");
			linesByFile.set(callable.file, lines);
		}
		keyed.push({
			...callable,
			name: callableName(lines[callable.startLine] ?? ""),
			waived: (lines[callable.startLine - 1] ?? "").includes(WAIVER),
		});
	}
	return keyed;
}

function highest(candidates: KeyedCallable[]): KeyedCallable | undefined {
	return candidates.reduce<KeyedCallable | undefined>(
		(best, c) => (best === undefined || c.complexity > best.complexity ? c : best),
		undefined,
	);
}

/**
 * Callables over the cutoff on the head that are new or more complex than on
 * the base.
 *
 * A callable is matched by file and name first, and by name alone when the file
 * has none (a function moved between files). When several base callables share
 * the key, the most complex one is the match: the rule asks whether branching
 * was ADDED, and the lenient match never reports a pre-existing function as new.
 */
export function findHotCallables(head: KeyedCallable[], base: KeyedCallable[]): HotCallable[] {
	const byFileAndName = new Map<string, KeyedCallable[]>();
	const byName = new Map<string, KeyedCallable[]>();
	for (const c of base) {
		const fileKey = `${c.file}\u0000${c.name}`;
		byFileAndName.set(fileKey, [...(byFileAndName.get(fileKey) ?? []), c]);
		byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
	}

	const hot: HotCallable[] = [];
	for (const c of head) {
		if (c.complexity <= HIGH_COMPLEXITY_CUTOFF || c.waived) continue;
		const match =
			highest(byFileAndName.get(`${c.file}\u0000${c.name}`) ?? []) ??
			highest(byName.get(c.name) ?? []);
		if (match !== undefined && c.complexity <= match.complexity) continue;
		hot.push({
			file: c.file,
			line: c.startLine + 1,
			name: c.name,
			complexity: c.complexity,
			baseComplexity: match?.complexity ?? null,
		});
	}
	return hot.sort((a, b) => b.complexity - a.complexity);
}

/**
 * One GitHub Actions error annotation per offending callable, anchored on its
 * line so the pull request's diff view shows it in place.
 */
export function formatHotCallables(hot: HotCallable[]): string[] {
	return hot.map((h) => {
		const what =
			h.baseComplexity === null
				? `is new at CC ${h.complexity}`
				: `grew from CC ${h.baseComplexity} to ${h.complexity}`;
		return (
			`::error file=${h.file},line=${h.line}::${h.name} ${what}, over the CC ` +
			`${HIGH_COMPLEXITY_CUTOFF} cutoff. Move the new branching into its own function ` +
			`rather than adding it here. If this one is deliberate, put a \`${WAIVER}: <reason>\` ` +
			"comment on the line above it."
		);
	});
}
