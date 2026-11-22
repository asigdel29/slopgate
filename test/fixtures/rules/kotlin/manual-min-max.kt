fun positives(a: Int, b: Int): List<Int> {
    return listOf(
        if (a > b) a else b, // SLOP
        if (a < b) a else b, // SLOP
        if (a >= b) a else b, // SLOP
        if (a <= b) a else b, // SLOP
    )
}

// Must NOT fire: the branches are not the compared operands.
fun negatives(a: Int, b: Int, c: Int): List<Int> {
    return listOf(if (a > b) c else b, if (a > b) a else c)
}
