#!/usr/bin/env bun
// slopgate — measure structural erosion and verbosity, and gate CI on them.
//
// Implements the two code-degradation metrics from SlopCodeBench
// (arXiv:2603.24755) so they can run as a CI check on any repository.
//
// Usage:
//   slopgate [--root <dir>] [--config <path>] [--report] [--json]
//
//   --root <dir>      repository to measure (default: current directory)
//   --config <path>   config file (default: <root>/slop.config.json)
//   --report          measure and print, always exit 0 — use this to calibrate
//   --json            machine-readable output, always exit 0
//
// Exit codes: 0 pass, 1 a metric exceeded its ceiling or the config is stale.

import { isAbsolute, join, resolve } from "node:path";
import type { SlopConfig } from "../src/config.ts";
import { measure } from "../src/measure.ts";
import { formatFailure, formatReport } from "../src/report.ts";

type Options = {
	root: string;
	configPath: string;
	reportOnly: boolean;
	asJson: boolean;
};

const USAGE = `slopgate [--root <dir>] [--config <path>] [--report] [--json]

  --root <dir>      repository to measure (default: current directory)
  --config <path>   config file (default: <root>/slop.config.json)
  --report          measure and print, always exit 0 — use this to calibrate
  --json            machine-readable output, always exit 0
  --help            this message`;

export function parseArgs(argv: string[]): Options {
	let root = process.cwd();
	let configPath: string | null = null;
	let reportOnly = false;
	let asJson = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--report") reportOnly = true;
		else if (arg === "--json") asJson = true;
		else if (arg === "--root") root = resolve(argv[++i] ?? ".");
		else if (arg === "--config") configPath = argv[++i] ?? null;
		else throw new Error(`unknown argument '${arg}'\n\n${USAGE}`);
	}

	return {
		root,
		configPath: configPath
			? isAbsolute(configPath)
				? configPath
				: resolve(configPath)
			: join(root, "slop.config.json"),
		reportOnly,
		asJson,
	};
}

async function loadConfig(configPath: string): Promise<SlopConfig> {
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		throw new Error(
			`missing config at ${configPath}\n` +
				"Every repository needs its own: which files to measure, and the ratchet " +
				"ceilings. See examples/slop.config.json.",
		);
	}
	return (await file.json()) as SlopConfig;
}

async function main(): Promise<number> {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		console.log(USAGE);
		return 0;
	}

	const options = parseArgs(process.argv.slice(2));
	const config = await loadConfig(options.configPath);
	const { metrics, callables } = await measure(config, options.root);

	if (options.asJson) {
		console.log(JSON.stringify(metrics, null, 2));
		return 0;
	}

	console.log(formatReport(metrics, config, callables));
	if (options.reportOnly) return 0;

	// Adding rules can only push verbosity up, so a ceiling calibrated against an
	// older pack is not comparable to what was just measured. Refusing to compare
	// is the only honest option: passing would be luck and failing would be a lie.
	if (config.calibratedAtRulePackVersion !== metrics.detail.rulePackVersion) {
		console.error("");
		console.error(
			`::error::rule pack is v${metrics.detail.rulePackVersion} but the ceilings in ` +
				`${options.configPath} were calibrated against v${config.calibratedAtRulePackVersion}. ` +
				"Re-run with --report, write the new ceilings and calibratedAtRulePackVersion " +
				"into that file, and commit them together.",
		);
		return 1;
	}

	let failed = false;
	const checks: Array<["erosion" | "verbosity", number, number | null]> = [
		["erosion", metrics.erosion, config.thresholds.erosion],
		["verbosity", metrics.verbosity, config.thresholds.verbosity],
	];

	for (const [name, value, ceiling] of checks) {
		if (ceiling === null) {
			console.log("");
			console.log(`  ${name} has no ceiling yet — reporting only. Calibrate to start gating.`);
			continue;
		}
		if (value > ceiling) {
			console.error("");
			console.error(formatFailure(name, value, ceiling));
			failed = true;
		}
	}

	return failed ? 1 : 0;
}

process.exit(await main());
