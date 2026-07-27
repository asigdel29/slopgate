export function positive(n: number): boolean {
	if (n > 0) { return true; } else { return false; } // SLOP
}

export function positiveInverted(n: number): boolean {
	if (n > 0) { return false; } else { return true; } // SLOP
}

// Must NOT fire: returns something other than a bare boolean pair.
export function negative(n: number): boolean | number {
	if (n > 0) { return n; } else { return false; }
}
