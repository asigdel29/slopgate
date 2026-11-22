// Fixture for callable names and the slopgate-allow waiver (test/hot.test.ts).
// Only the names and the waiver are under test; complexity is not.

export function runJob(a: number) {
	return a;
}

class Handler {
	async handle(req: string) {
		return req;
	}

	get value() {
		return 1;
	}
}

const run =
	async () => {
		return new Handler();
	};

// slopgate-allow: a parser table, one arm per token
export function parse(x: number) {
	return run() && x;
}
