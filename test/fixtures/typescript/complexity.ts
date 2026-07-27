// Fixture for the TypeScript structural rules. Every callable here has a
// hand-counted cyclomatic complexity asserted in test/rules.test.ts.
//
// Keep this file boring: any construct added here changes the expected counts.

// CC 1 — no decision points at all.
export function plain(): number {
	return 1;
}

// CC 10. Decision points, in order:
//   1 if, 2 &&, 3 else-if, 4 for, 5 nested if, 6 case, 7 case, 8 ternary, 9 catch
// `default:` is deliberately present and deliberately NOT counted.
// Sitting exactly at 10 also pins the Eq. 3 boundary: >10 is high-complexity,
// so this callable must NOT be counted as eroded.
export function branching(n: number): string {
	if (n > 0 && n < 10) {
		return "small";
	} else if (n >= 10) {
		return "large";
	}

	for (const x of [1, 2]) {
		if (x) return "loop";
	}

	switch (n) {
		case 1:
			return "one";
		case 2:
			return "two";
		default:
			break;
	}

	try {
		return n ? "t" : "f";
	} catch {
		return "err";
	}
}

// CC 2, and exactly ONE callable. The two inline closures are not callables in
// their own right, so the ternary inside the first one folds into this function
// rather than becoming a separate near-zero-complexity entry.
export function withClosure(items: number[]): number[] {
	return items.filter((x) => (x > 0 ? true : false)).map((x) => x * 2);
}

// TWO callables. `inner` is bound to a name, so it gets its own entry (CC 2 for
// the ternary) and its complexity is removed from `outer` (CC 2 for the if) —
// the nested-function rule Radon applies.
export function outer(n: number): number {
	const inner = (x: number): number => (x > 0 ? x : -x);
	if (n > 0) return inner(n);
	return 0;
}

export class Widget {
	// CC 2 — a method_definition, one ternary.
	render(flag: boolean): string {
		return flag ? "on" : "off";
	}

	// CC 1 — `constructor` is also a method_definition.
	constructor(readonly id: string) {}
}

// CC 3 — `??` and `||` both count, `?.` deliberately does not.
export function nullish(a: string | null, b: string | null): string {
	return a?.trim() ?? b ?? "fallback";
}
