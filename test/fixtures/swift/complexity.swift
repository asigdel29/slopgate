// Fixture for the Swift structural rules. Every callable here has a
// hand-counted cyclomatic complexity asserted in test/rules.test.ts.
//
// Keep this file boring: any construct added here changes the expected counts.

// CC 1 — no decision points at all.
func plain() -> Int {
	return 1
}

// CC 11. Decision points, in order:
//   1 guard, 2 if, 3 &&, 4 else-if, 5 for, 6 where, 7 nested if,
//   8 case, 9 case, 10 ternary
// `default:` is deliberately present and deliberately NOT counted.
// At 11 this is just over the Eq. 3 cutoff, so it MUST count as eroded — the
// mirror of the TypeScript fixture's boundary case at exactly 10.
func branching(_ n: Int) -> String {
	guard n >= 0 else { return "neg" }

	if n > 0 && n < 10 {
		return "small"
	} else if n >= 10 {
		return "large"
	}

	for x in [1, 2] where x > 0 {
		if x == 1 { return "one" }
	}

	switch n {
	case 1: return "a"
	case 2: return "b"
	default: break
	}

	return n > 0 ? "t" : "f"
}

// CC 3 — one `??` and one catch block.
func risky(_ value: String?) -> String {
	do {
		return try compute(value) ?? "none"
	} catch {
		return "err"
	}
}

// CC 2, and exactly ONE callable. The trailing closure is not a callable, so
// its ternary folds into this function. This is the case that matters most in
// SwiftUI code, where closures are everywhere.
func withClosure(_ xs: [Int]) -> [Int] {
	return xs.map { $0 > 0 ? $0 : -$0 }
}

struct Badge {
	let label: String

	// CC 2 — a computed property is a callable, so SwiftUI `body` complexity is
	// measured rather than invisible.
	var body: String {
		return label.isEmpty ? "empty" : label
	}

	// CC 2 — init_declaration with one guard-free branch.
	init(label: String) {
		if label.isEmpty {
			self.label = "none"
		} else {
			self.label = label
		}
	}
}

func compute(_ value: String?) throws -> String? {
	return value
}
