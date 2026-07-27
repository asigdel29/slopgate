func positives(_ a: Int, _ b: Int) -> [Int] {
	return [
		a > b ? a : b, // SLOP
		a < b ? a : b, // SLOP
	]
}

// Must NOT fire: the branches are not the compared operands.
func negatives(_ a: Int, _ b: Int, _ c: Int) -> [Int] {
	return [a > b ? c : b, a > b ? a : c]
}
