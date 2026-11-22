// The gate command: parse the flags, measure the head and the base, print the
// report or the JSON, and return the exit code from the gate's verdict.
//
// Kept out of bin/ so tests import it without running a process. bin/ only
// dispatches and maps an error to exit code 2.

import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import type { SlopConfig } from "./config.ts";
import { decide } from "./gate.ts";
import type { GateInput } from "./gate.ts";
import { resolveBase, withWorktree } from "./git.ts";
import { findHotCallables } from "./hot.ts";
import { measure } from "./measure.ts";
import type { Measurement } from "./measure.ts";
import { formatReport } from "./report.ts";

/** The help text. The only copy of the flag list. */
const USAGE = `slopgate [--root <dir>] [--config <path>] [--base <ref>] [--report] [--json] [--json-out <path>]

  --root <dir>      repository to measure (default: current directory)
  --config <path>   config file (default: <root>/slop.config.json)
  --base <ref>      also measure this revision and gate on the DELTA — this is
                    the primary gate; pass the PR's base branch or SHA
  --report          measure and print, always exit 0 — use this to calibrate
  --json            machine-readable output, always exit 0
  --json-out <path> also write the machine-readable output to <path>, and
                    still gate — one scan for both the verdict and the numbers
  --help, -h        this message

slopgate init --help   set up a repository (see its own help)

Exit codes: 0 pass, 1 the gate failed, 2 an error (bad flag, bad config, tool failure).`;

/** The parsed flags, with every path made absolute. */
type Options = {
	/** The repository to measure. */
	root: string;
	/** The config file. */
	configPath: string;
	/** The revision to gate the change against, or null for no delta. */
	baseRef: string | null;
	/** Print the report and exit 0. */
	report: boolean;
	/** Print the JSON and exit 0. */
	json: boolean;
	/** Where to also write the JSON output while still gating, or null. */
	jsonOut: string | null;
};

/** Parse the gate's flags. Throws on an unknown flag or a flag with no value. */
export function parseOptions(argv: string[]): Options {
	const { values } = parseArgs({
		args: argv,
		options: {
			root: { type: "string", default: "." },
			config: { type: "string" },
			base: { type: "string" },
			report: { type: "boolean", default: false },
			json: { type: "boolean", default: false },
			"json-out": { type: "string" },
		},
	});
	const root = resolve(values.root);
	return {
		root,
		configPath: resolve(values.config ?? join(root, "slop.config.json")),
		baseRef: values.base ?? null,
		report: values.report,
		json: values.json,
		jsonOut: values["json-out"] === undefined ? null : resolve(values["json-out"]),
	};
}

/** What one run measured: the head, plus the base and the ratchet with --base. */
type Run = Pick<GateInput, "base" | "hot"> & {
	/** The tree under test, with its callables. */
	head: Measurement;
};

/**
 * Measure everything this run needs: the head, then, with --base, the merge
 * base in a throwaway worktree and the hot-callable ratchet. The base tree is
 * measured with THIS revision's engine and config, so a delta only ever
 * reflects source changes, never a change to how the measurement works.
 */
async function measureRun(config: SlopConfig, { root, baseRef }: Options): Promise<Run> {
	const head = await measure(config, root);
	if (baseRef === null) return { head, base: null, hot: null };
	const ref = await resolveBase(baseRef, root);
	const base = await withWorktree({ ref, root }, (baseRoot) => measure(config, baseRoot));
	const hot = config.hotCallables ? findHotCallables(head.callables, base.callables) : null;
	return { head, base: base.metrics, hot };
}

/**
 * Run the gate with `argv` and return the exit code: 0 pass, 1 fail. Throws on
 * a bad flag, a bad config or a tool failure; the caller maps that to 2.
 */
export async function runGate(argv: string[]): Promise<number> {
	// Before parsing, so help works even next to a bad flag.
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE);
		return 0;
	}
	const options = parseOptions(argv);
	const config = await loadConfig(options.configPath);
	const { head, base, hot } = await measureRun(config, options);

	const json = JSON.stringify({ ...head.metrics, base, hot }, null, 2);
	if (options.jsonOut !== null) await Bun.write(options.jsonOut, `${json}\n`);
	if (options.json) {
		console.log(json);
		return 0;
	}
	console.log(formatReport({ head, base, config }));
	if (options.report) return 0;

	const failures = decide({
		config,
		configPath: options.configPath,
		head: head.metrics,
		base,
		hot,
	});
	for (const failure of failures) console.error(`\n${failure}`);
	return failures.length > 0 ? 1 : 0;
}
