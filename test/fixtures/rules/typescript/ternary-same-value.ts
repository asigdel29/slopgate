export function positives(n: number, fallback: string): string[] {
	return [
		n > 0 ? fallback : fallback, // SLOP
	];
}

// Must NOT fire: the branches genuinely differ.
export function negatives(n: number, a: string, b: string): string[] {
	return [n > 0 ? a : b, n > 0 ? a : "x"];
}
