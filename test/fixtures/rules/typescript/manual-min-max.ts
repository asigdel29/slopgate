export function positives(a: number, b: number): number[] {
	return [
		a > b ? a : b, // SLOP
		a < b ? a : b, // SLOP
	];
}

// Must NOT fire: the branches are not the compared operands.
export function negatives(a: number, b: number, c: number): number[] {
	return [a > b ? c : b, a > b ? a : c];
}
