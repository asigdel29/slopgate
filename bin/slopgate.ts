#!/usr/bin/env bun
// slopgate — measure structural erosion and verbosity, and gate CI on them.
//
// Implements the two code-degradation metrics from SlopCodeBench
// (arXiv:2603.24755) so they can run as a CI check on any repository. Run
// `slopgate --help` for the flags (src/cli.ts holds the only copy).
//
// This file only dispatches. An error of any kind exits 2 with one line, so CI
// can tell a broken run from a failed gate (exit 1).

import { runGate } from "../src/cli.ts";
import { runInit } from "../src/init.ts";

const args = process.argv.slice(2);
const [command, ...rest] = args;
try {
	if (command === "init") await runInit(rest);
	else process.exitCode = await runGate(args);
} catch (err) {
	console.error(`slopgate: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 2;
}
