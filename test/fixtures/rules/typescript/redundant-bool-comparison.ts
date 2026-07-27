// Comparing against a boolean literal.
export function positives(flag: boolean, other: boolean): boolean[] {
	return [
		flag === true, // SLOP
		flag === false, // SLOP
		flag !== true, // SLOP
		flag !== false, // SLOP
	];
}

// Must NOT fire: comparing two values, or against non-boolean literals.
export function negatives(flag: boolean, other: boolean, n: number): boolean[] {
	return [flag === other, n === 1, flag, !flag];
}
