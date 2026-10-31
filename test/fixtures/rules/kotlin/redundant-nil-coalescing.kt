fun positives(x: String?): String? {
    return x ?: null // SLOP
}

// Must NOT fire: a real default, and a safe call.
fun negatives(x: String?): Int {
    return x?.length ?: 0
}
