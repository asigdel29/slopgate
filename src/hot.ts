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
// Identity across revisions is the callable's first line in the same file, then
// its name, but only where the name is unambiguous: two methods called `handle`
// in one file, or two `render`s in different files, are never mistaken for each
// other. A renamed, or ambiguously named, function therefore reads as new, which
// is the conservative reading; a `slopgate-allow` comment on the line above a
// callable exempts it, so the exception is visible in review.

import type { Callable } from "./config.ts";
import { HIGH_COMPLEXITY_CUTOFF } from "./config.ts";

/** A callable plus the identity used to find it in the other revision. */
export type KeyedCallable = Callable & {
	/** The callable's first line, trimmed: its most specific identity. */
	signature: string;
	/** The callable's name as read off its first line, or null when none reads. */
	name: string | null;
	/** Whether the line above the callable carries a `slopgate-allow` waiver. */
	waived: boolean;
};

/** One callable that breaks the ratchet, with what it was on the base. */
export type HotCallable = {
	file: string;
	/** One-based, for editors and annotations. */
	line: number;
	/** The callable's name, or its first line when it has none. */
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

// What NAME finds on a line that names nothing, such as `export default
// function (` or an arrow that starts on the line after its `const`.
const NOT_NAMES = new Set(["async", "function", "func", "init"]);

/**
 * The name a callable is known by, read off its first line, or null.
 *
 * Keywords before the name (`export`, `async`, `function`, `private`) are never
 * followed by one of the delimiters, so the first match is the name itself.
 */
export function callableName(firstLine: string): string | null {
	const name = NAME.exec(firstLine.trim())?.[1];
	return name === undefined || NOT_NAMES.has(name) ? null : name;
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
		const firstLine = lines[callable.startLine] ?? "";
		keyed.push({
			...callable,
			signature: firstLine.trim(),
			name: callableName(firstLine),
			waived: (lines[callable.startLine - 1] ?? "").includes(WAIVER),
		});
	}
	return keyed;
}

function group(callables: KeyedCallable[], key: (c: KeyedCallable) => string | null) {
	const groups = new Map<string, KeyedCallable[]>();
	for (const c of callables) {
		const k = key(c);
		if (k !== null) groups.set(k, [...(groups.get(k) ?? []), c]);
	}
	return groups;
}

/** The only entry, or undefined when there are none or several. */
function only(candidates: KeyedCallable[] | undefined): KeyedCallable | undefined {
	return candidates?.length === 1 ? candidates[0] : undefined;
}

/**
 * Callables over the cutoff on the head that are new or more complex than on
 * the base.
 *
 * A head callable is matched, in order, to the base callable with the same first
 * line in the same file, the only one with its name in the same file, or the
 * only one with its name anywhere (a function moved between files). Anything
 * else is new. When one first line repeats in a file, the most complex copy is
 * the match: the rule asks whether branching was ADDED.
 */
export function findHotCallables(head: KeyedCallable[], base: KeyedCallable[]): HotCallable[] {
	const bySignature = group(base, (c) => `${c.file}\u0000${c.signature}`);
	const byFileAndName = group(base, (c) => (c.name === null ? null : `${c.file}\u0000${c.name}`));
	const byName = group(base, (c) => c.name);

	const hot: HotCallable[] = [];
	for (const c of head) {
		if (c.complexity <= HIGH_COMPLEXITY_CUTOFF || c.waived) continue;
		const sameLine = bySignature.get(`${c.file}\u0000${c.signature}`) ?? [];
		const match =
			sameLine.reduce<KeyedCallable | undefined>(
				(best, b) => (best === undefined || b.complexity > best.complexity ? b : best),
				undefined,
			) ??
			(c.name === null
				? undefined
				: (only(byFileAndName.get(`${c.file}\u0000${c.name}`)) ?? only(byName.get(c.name))));
		if (match !== undefined && c.complexity <= match.complexity) continue;
		hot.push({
			file: c.file,
			line: c.startLine + 1,
			name: c.name ?? c.signature,
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
