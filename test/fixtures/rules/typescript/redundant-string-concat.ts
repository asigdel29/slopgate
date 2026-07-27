export function positives(n: number): string[] {
	return [
		"" + n, // SLOP
		n + "", // SLOP
	];
}

// Must NOT fire: real concatenation.
export function negatives(a: string, b: string): string[] {
	return [a + b, `${a}${b}`, a + "x"];
}
