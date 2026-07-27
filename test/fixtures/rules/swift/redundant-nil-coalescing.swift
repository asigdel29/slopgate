func positives(_ x: Int?) -> [Int?] {
	return [
		x ?? nil, // SLOP
	]
}

// Must NOT fire: a real fallback value.
func negatives(_ x: Int?) -> [Int] {
	return [x ?? 0]
}
