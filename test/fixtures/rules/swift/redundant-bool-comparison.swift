func positives(_ flag: Bool) -> [Bool] {
	return [
		flag == true, // SLOP
		flag == false, // SLOP
		flag != true, // SLOP
		flag != false, // SLOP
	]
}

// Must NOT fire: comparing two values, or against non-boolean literals.
func negatives(_ flag: Bool, _ other: Bool, _ n: Int) -> [Bool] {
	return [flag == other, n == 1, flag, !flag]
}
