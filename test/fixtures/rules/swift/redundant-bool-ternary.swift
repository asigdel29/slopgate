func positives(_ n: Int) -> [Bool] {
	return [
		n > 0 ? true : false, // SLOP
		n > 0 ? false : true, // SLOP
	]
}

// Must NOT fire: branches that are not both boolean literals.
func negatives(_ n: Int) -> [Int] {
	return [n > 0 ? 1 : 0]
}
