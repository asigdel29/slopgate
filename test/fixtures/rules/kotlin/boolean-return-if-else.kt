fun positive(n: Int): Boolean {
    if (n > 0) return true else return false // SLOP
}

fun positiveInverted(n: Int): Boolean {
    if (n > 0) return false else return true // SLOP
}

fun braced(n: Int): Boolean {
    if (n > 0) { return true } else { return false } // SLOP
}

// Must NOT fire: returns something other than a bare boolean pair.
fun negative(n: Int): Int {
    if (n > 0) return n else return 0
}

// Must NOT fire: both branches true.
fun sameBoolean(n: Int): Boolean {
    if (n > 0) return true else return true
}
