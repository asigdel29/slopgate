// Fixture for callable names (test/hot.test.ts). Every callable here is CC 1.

class Card {
	init {
		println()
	}

	fun footer(): String {
		return "footer"
	}

	val label: String
		get() = "card"
}
