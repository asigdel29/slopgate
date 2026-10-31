// Fixture for the Kotlin clone test: identical to clone_b.kt apart from the name.

fun one(a: Int, b: Int): Int {
    var total = 0
    for (i in 0..a) {
        total += i * b + a - b
        if (total > 100) { total -= 7 } else { total += 3 }
        println("step " + i + " total " + total)
    }
    val result = total * 2 + a - b + a * b
    println("done " + result)
    return result + total - a
}
