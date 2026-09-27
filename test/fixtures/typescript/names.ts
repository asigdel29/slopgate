// Fixture for callable names and the slopgate-allow waiver (test/hot.test.ts).
// Every callable here is CC 1; only its name and waiver are under test.

export function runTurn(a: number) {
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
