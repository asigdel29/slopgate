// Fixture for callable names (test/hot.test.ts). Every callable here is CC 1.

struct Card {
	var body: String {
		"card"
	}

	@MainActor
	func footer() -> String {
		"footer"
	}

	init(x: Int) {
	}
}
