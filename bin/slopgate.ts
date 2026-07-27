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
import type { Language, SlopConfig } from "../src/config.ts";
import { LANGUAGES } from "../src/config.ts";
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

/**
 * Read and VALIDATE the config.
 *
 * Validation is not ceremony here. A missing or misspelled `thresholds` key
 * yields `undefined`, and `undefined` compares false against every ceiling test
 * — so an unvalidated typo silently disables the gate and reports a green build
 * on a codebase nothing measured. A gate that can be switched off by a typo is
 * worse than no gate, because it looks like one.
 */
export async function loadConfig(configPath: string): Promise<SlopConfig> {
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		throw new Error(
			`missing config at ${configPath}\n` +
				"Every repository needs its own: which files to measure, and the ratchet " +
				"ceilings. See examples/slop.config.json in the slopgate repository.",
		);
	}

	let parsed: unknown;
	try {
		parsed = await file.json();
	} catch (err) {
		throw new Error(`${configPath} is not valid JSON: ${(err as Error).message}`);
	}

	const config = parsed as SlopConfig;
	const problems: string[] = [];

	if (typeof config?.languages !== "object" || config.languages === null) {
		problems.push("`languages` must be an object with at least one language");
	} else if (Object.keys(config.languages).length === 0) {
		problems.push("`languages` is empty — nothing would be measured");
	} else {
		for (const [name, lang] of Object.entries(config.languages)) {
			if (!LANGUAGES.includes(name as Language)) {
				problems.push(`unknown language '${name}' (supported: ${LANGUAGES.join(", ")})`);
			} else if (!Array.isArray(lang?.include) || lang.include.length === 0) {
				problems.push(`languages.${name}.include must be a non-empty array of globs`);
			}
		}
	}

	if (typeof config?.thresholds !== "object" || config.thresholds === null) {
		problems.push("`thresholds` must be an object with `erosion` and `verbosity`");
	} else {
		for (const key of ["erosion", "verbosity"] as const) {
			const value = config.thresholds[key];
			if (value !== null && typeof value !== "number") {
				problems.push(
					`thresholds.${key} must be a number or null (explicitly uncalibrated), got ${
						value === undefined ? "undefined — is the key missing or misspelt?" : typeof value
					}`,
				);
			}
		}
	}

	if (typeof config?.calibratedAtRulePackVersion !== "number") {
		problems.push("`calibratedAtRulePackVersion` must be a number");
	}

	if (problems.length > 0) {
		throw new Error(
			`${configPath} is not a usable slop config:\n  - ${problems.join("\n  - ")}`,
		);
	}

	return config;
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
		if (typeof ceiling !== "number") {
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

// Only run when executed directly. Without this guard, importing anything from
// this file — as the config tests do — runs the whole gate and then exits the
// test process.
if (import.meta.main) {
	process.exit(await main());
}
