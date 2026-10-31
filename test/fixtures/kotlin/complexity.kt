// Fixture for the Kotlin structural rules. Every callable here has a
// hand-counted cyclomatic complexity asserted in test/rules.test.ts.
//
// Keep this file boring: any construct added here changes the expected counts.

package fixture

// CC 1 - no decision points at all.
fun plain(): Int {
	return 1
}

// CC 13. Decision points, in order:
//   1 if, 2 else-if, 3 && , 4 when arm, 5 when arm (`1, 2` is ONE arm),
//   6 when arm (`in`), 7 elvis, 8 ||, 9 for, 10 while, 11 do-while,
//   12 catch, 13 nested if
// `else ->` is deliberately present and NOT counted; `?.` and `try` are not
// counted either.
fun branching(n: Int, s: String?): String {
	if (n > 0 && n < 10) {
		return "small"
	} else if (n >= 10) {
		return "large"
	}

	val label = when (n) {
		1, 2 -> "low"
		in 3..4 -> "mid"
		else -> "other"
	}

	val len = s?.length ?: 0
	if (len > 3 || label.isEmpty()) {
		return "x"
	}
	for (i in 0..n) {
		println(i)
	}
	while (n > 100) {
		return "w"
	}
	do {
		println(n)
	} while (n > 200)
	try {
		println(n)
	} catch (e: Exception) {
		return "bad"
	}
	return label
}

// CC 4 - a Compose-style trailing lambda: its branches fold into the function.
//   1 if, 2 when arm, 3 && (all inside the lambda)
fun content(show: Boolean, n: Int) {
	column {
		if (show && n > 0) {
			when (n) {
				1 -> text("one")
				else -> text("many")
			}
		}
	}
}

// outer CC 3: 1 + for + the `if` inside the forEach lambda. The local fun owns
// its own `if` (CC 2), which is not counted again in outer.
fun outer(xs: List<Int>): Int {
	fun local(x: Int): Int {
		if (x > 0) return x
		return 0
	}
	for (x in xs) {
		xs.forEach { if (it > x) println(it) }
	}
	return local(1)
}

interface Shape {
	// No body: not a callable.
	fun area(): Int

	// Has a default body: CC 2.
	fun describe(flag: Boolean): String {
		return if (flag) "a" else "b"
	}
}

class Box(val w: Int, val h: Int) {
	// Property initialisers are not callables.
	val double = w * 2

	// Secondary constructor with a body: CC 2.
	constructor(side: Int, check: Boolean) : this(side, side) {
		if (check) println(side)
	}

	// Delegating-only secondary constructor: not a callable.
	constructor(side: Int) : this(side, side)

	// init block: CC 2.
	init {
		if (w < 0) println(w)
	}

	// Getter with a body: CC 2.
	val area: Int
		get() {
			return if (w > h) w else h
		}

	// Expression-bodied getter: CC 2.
	val big: Boolean
		get() = w > 10 && h > 10

	// Default accessors are not callables.
	var tag: String = ""
		private set

	// Setter with a body: CC 2.
	var size: Int = 0
		set(value) {
			if (value > 0) field = value
		}
}
