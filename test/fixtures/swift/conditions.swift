// Fixture for multi-clause conditions.
//
// The point of this file: `if let x = a, let y = b` and `if a != nil && b != nil`
// express the same two short-circuit tests, so they must score the same
// complexity. Before meta-condition-binding existed, the comma form scored one
// lower, making optional-binding-heavy Swift read as simpler than it is.

// CC 3 — the `if` plus one extra clause.
func commaForm(_ a: Int?, _ b: Int?) -> Int {
	if let x = a, let y = b {
		return x + y
	}
	return 0
}

// CC 3 — the `if` plus the `&&`. Must equal commaForm above.
func andForm(_ a: Int?, _ b: Int?) -> Int {
	if a != nil && b != nil {
		return a! + b!
	}
	return 0
}

// CC 2 — a single binding is one test, so it adds nothing beyond the `if`.
func singleBinding(_ a: Int?) -> Int {
	if let x = a {
		return x
	}
	return 0
}

// CC 4 — guard with three bindings: the guard plus two extra clauses.
func guardThree(_ a: Int?, _ b: Int?, _ c: Int?) -> Int {
	guard let x = a, let y = b, let z = c else { return 0 }
	return x + y + z
}

// CC 3 — nested bindings must NOT pool into the outer statement. The outer `if`
// and the inner `if` are one decision point each, and neither has an extra
// clause.
func nested(_ a: Int?, _ b: Int?) -> Int {
	if let x = a {
		if let y = b {
			return x + y
		}
	}
	return 0
}
