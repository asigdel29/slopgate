func positives(_ n: Int, _ fallback: String) -> [String] {
	return [
		n > 0 ? fallback : fallback, // SLOP
	]
}

// Must NOT fire: the branches genuinely differ.
func negatives(_ n: Int, _ a: String, _ b: String) -> [String] {
	return [n > 0 ? a : b, n > 0 ? a : "x"]
}
