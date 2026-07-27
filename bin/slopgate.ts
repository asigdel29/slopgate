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
import { checkoutWorktree, isGitRepository, resolveBase } from "../src/git.ts";
import { measure } from "../src/measure.ts";
import { formatDeltaFailure, formatFailure, formatReport } from "../src/report.ts";

type Options = {
	root: string;
	configPath: string;
	baseRef: string | null;
	reportOnly: boolean;
	asJson: boolean;
};

const USAGE = `slopgate [--root <dir>] [--config <path>] [--base <ref>] [--report] [--json]

  --root <dir>      repository to measure (default: current directory)
  --config <path>   config file (default: <root>/slop.config.json)
  --base <ref>      also measure this revision and gate on the DELTA — this is
                    the primary gate; pass the PR's base branch or SHA
  --report          measure and print, always exit 0 — use this to calibrate
  --json            machine-readable output, always exit 0
  --help            this message`;

export function parseArgs(argv: string[]): Options {
	let root = process.cwd();
	let configPath: string | null = null;
	let baseRef: string | null = null;
	let reportOnly = false;
	let asJson = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--report") reportOnly = true;
		else if (arg === "--json") asJson = true;
		else if (arg === "--root") root = resolve(argv[++i] ?? ".");
		else if (arg === "--config") configPath = argv[++i] ?? null;
		else if (arg === "--base") baseRef = argv[++i] ?? null;
		else throw new Error(`unknown argument '${arg}'\n\n${USAGE}`);
	}

	return {
		root,
		baseRef,
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

	for (const group of ["maxDelta", "thresholds"] as const) {
		const section = config?.[group];
		if (typeof section !== "object" || section === null) {
			problems.push(`\`${group}\` must be an object with \`erosion\` and \`verbosity\``);
			continue;
		}
		for (const key of ["erosion", "verbosity"] as const) {
			const value = section[key];
			if (value !== null && typeof value !== "number") {
				problems.push(
					`${group}.${key} must be a number or null (explicitly disabled), got ${
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

	// Measure the merge base too, when asked. This is what makes the gate a
	// statement about the CHANGE rather than about the codebase: an absolute
	// ceiling on a whole-repo ratio is a one-time budget that the first few
	// changes exhaust permanently, whereas a delta limit applies equally to
	// every change forever.
	let baseMetrics: Awaited<ReturnType<typeof measure>>["metrics"] | null = null;
	if (options.baseRef !== null) {
		if (!(await isGitRepository(options.root))) {
			throw new Error(`--base was given but ${options.root} is not a git repository`);
		}
		const baseSha = await resolveBase(options.baseRef, options.root);
		const worktree = await checkoutWorktree(baseSha, options.root);
		try {
			// The base tree is measured with THIS revision's engine and config, so a
			// delta only ever reflects source changes — never a change to how the
			// measurement itself works.
			baseMetrics = (await measure(config, worktree.path)).metrics;
		} finally {
			await worktree.dispose();
		}
	}

	if (options.asJson) {
		console.log(JSON.stringify({ ...metrics, base: baseMetrics }, null, 2));
		return 0;
	}

	console.log(formatReport(metrics, config, callables, baseMetrics));
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
	const names = ["erosion", "verbosity"] as const;

	// The primary gate: how fast is THIS change degrading the codebase.
	if (baseMetrics !== null) {
		for (const name of names) {
			const limit = config.maxDelta[name];
			if (typeof limit !== "number") continue;

			const delta = metrics[name] - baseMetrics[name];
			// Improvements are always welcome, however large.
			if (delta > limit) {
				console.error("");
				console.error(formatDeltaFailure(name, baseMetrics[name], metrics[name], limit));
				failed = true;
			}
		}
	} else if (names.some((n) => typeof config.maxDelta[n] === "number")) {
		// Silently skipping the primary gate would make a PR look checked when it
		// was not, which is the failure mode this tool exists to avoid.
		console.error("");
		console.error(
			"::error::maxDelta is configured but --base was not given, so the change " +
				"itself was never measured. Pass the PR's base ref (e.g. --base origin/main), " +
				"or set maxDelta to null to opt out deliberately.",
		);
		return 1;
	}

	// The optional absolute backstop, for catastrophic drift only.
	for (const name of names) {
		const ceiling = config.thresholds[name];
		if (typeof ceiling !== "number") continue;
		if (metrics[name] > ceiling) {
			console.error("");
			console.error(formatFailure(name, metrics[name], ceiling));
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
