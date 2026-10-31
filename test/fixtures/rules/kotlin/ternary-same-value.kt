fun positives(c: Boolean, x: Int): Int {
    return if (c) x else x // SLOP
}

// Must NOT fire: different values.
fun negatives(c: Boolean, x: Int, y: Int): Int {
    return if (c) x else y
}
