export function positives(xs: number[], f: (n: number) => number) {
	return xs.map((x) => f(x)); // SLOP
}

// Must NOT fire: the closure does more than forward.
export function negatives(xs: number[], f: (n: number) => number) {
	return [xs.map((x) => f(x) + 1), xs.map((x) => f(1)), xs.map((x, i) => f(i))];
}
