// The hot-callable ratchet: a per-callable complement to the ratio gates.
//
// Erosion is a ratio over the whole repository, so branches added to a function
// already far over the cutoff can move it by less than maxDelta, and a run of
// such changes eats the absolute backstop without any one of them failing. This
// rule looks at the callables themselves: one over the cutoff may not be new and
// may not gain decision points. The README's "hot-callable ratchet" section is
// the user-facing statement of the rule.

import type { Callable } from "./config.ts";
import { HIGH_COMPLEXITY_CUTOFF } from "./config.ts";

/** One callable that breaks the ratchet, with what it was on the base. */
export type HotCallable = {
	file: string;
	/** One-based, for editors and annotations. */
	line: number;
	/** The callable's name, or null when the parser found none. */
	name: string | null;
	complexity: number;
	/** The base revision's complexity, or null when the callable is new. */
	baseComplexity: number | null;
};

/** Callables grouped by file and name, each group most complex first. */
function byFileAndName(callables: Callable[]): Map<string, Callable[]> {
	const sorted = [...callables].sort((a, b) => b.complexity - a.complexity);
	return Map.groupBy(sorted, (c) => `${c.file}\u0000${c.name ?? ""}`);
}

/**
 * Callables over the cutoff on the head that are new or more complex than on
 * the base.
 *
 * A head callable is matched to the base callable with the same file and name.
 * Same-named callables in one file (overloads, or `execute` handlers on several
 * tool objects) are compared by rank, most complex against most complex, so
 * adding or removing a simple sibling never shifts the pairing; a group fails
 * only where its k-th most complex member got more complex. When the base file
 * has none of that name, the head callable is matched to the only base callable
 * with its name anywhere, which follows a function moved between files. Anything
 * else is new, including a renamed function; the `slopgate-allow` waiver covers
 * the cases that should pass anyway.
 */
export function findHotCallables(head: Callable[], base: Callable[]): HotCallable[] {
	const baseGroups = byFileAndName(base);
	const baseByName = Map.groupBy(
		base.filter((c) => c.name !== null),
		(c) => c.name as string,
	);

	const hot: HotCallable[] = [];
	for (const [key, group] of byFileAndName(head)) {
		const baseGroup = baseGroups.get(key) ?? [];
		group.forEach((c, i) => {
			if (c.complexity <= HIGH_COMPLEXITY_CUTOFF || c.waived) return;
			const moved =
				baseGroup.length === 0 && c.name !== null ? baseByName.get(c.name) : undefined;
			const match = baseGroup[i] ?? (moved?.length === 1 ? moved[0] : undefined);
			if (match !== undefined && c.complexity <= match.complexity) return;
			hot.push({
				file: c.file,
				line: c.startLine + 1,
				name: c.name,
				complexity: c.complexity,
				baseComplexity: match?.complexity ?? null,
			});
		});
	}
	return hot.sort((a, b) => b.complexity - a.complexity);
}
