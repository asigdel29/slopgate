export function positives(n: number): boolean[] {
	return [
		n > 0 ? true : false, // SLOP
		n > 0 ? false : true, // SLOP
	];
}

// Must NOT fire: branches that are not both boolean literals.
export function negatives(n: number): unknown[] {
	return [n > 0 ? 1 : 0, n > 0 ? true : n, n > 0];
}
