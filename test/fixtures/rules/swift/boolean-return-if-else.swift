func positive(_ n: Int) -> Bool {
	if n > 0 { return true } else { return false } // SLOP
}

func positiveInverted(_ n: Int) -> Bool {
	if n > 0 { return false } else { return true } // SLOP
}

// Must NOT fire: returns something other than a bare boolean pair.
func negative(_ n: Int) -> Int {
	if n > 0 { return n } else { return 0 }
}
