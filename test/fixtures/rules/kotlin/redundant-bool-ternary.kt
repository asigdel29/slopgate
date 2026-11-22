fun positives(n: Int): List<Boolean> {
    return listOf(
        if (n > 0) true else false, // SLOP
        if (n > 0) false else true, // SLOP
    )
}

// Must NOT fire: branches that are not both boolean literals.
fun negatives(n: Int): List<Int> {
    return listOf(if (n > 0) 1 else 0)
}
