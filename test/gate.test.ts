// Checks decide(), the gate's verdict, without a repository or a process.
//
// The two stopping checks must win over every other result: a stale
// calibration and a per-change rule with no base both make the numbers after
// them meaningless. Then each kind of failure must appear only when its rule
// is set and broken, and an improvement must always pass.

import { describe, expect, test } from "bun:test";
import type { SlopConfig, SlopMetrics } from "../src/config.ts";
import { decide } from "../src/gate.ts";
import type { GateInput } from "../src/gate.ts";
import { configFor } from "./helpers.ts";

/** Metrics with the given ratios on rule pack v1. */
function metrics(erosion: number, verbosity: number): SlopMetrics {
	return {
		erosion,
		verbosity,
		detail: {
			files: 1,
			callables: 1,
			highComplexityCallables: 0,
			totalMass: 1,
			highComplexityMass: 0,
			loc: 1,
			flaggedLines: 0,
			cloneLines: 0,
			unionLines: 0,
			rulePackVersion: 1,
		},
	};
}

/** The parts of a gate input a test sets: config fields on top of a config that gates nothing. */
type Fields = Partial<Omit<GateInput, "config">> & { config?: Partial<SlopConfig> };

/** A gate input with a config that gates nothing, changed by `fields`. */
function input({ config, ...rest }: Fields): GateInput {
	return {
		configPath: "slop.config.json",
		head: metrics(0.2, 0.1),
		base: null,
		hot: null,
		...rest,
		config: { ...configFor("typescript", ["src/**/*.ts"], 1), ...config },
	};
}

const DELTA = { erosion: 0.01, verbosity: 0.01 };

describe("decide", () => {
	test("passes when no rule is set", () => {
		expect(decide(input({}))).toEqual([]);
	});

	test("a per-change rule without a base stops the run with one failure", () => {
		const failures = decide(input({ config: { maxDelta: DELTA } }));
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain("--base was not given");
		expect(decide(input({ config: { hotCallables: true } }))[0]).toContain("--base was not given");
	});

	test("a stale calibration stops the run before a delta that is over", () => {
		const failures = decide(
			input({
				config: {
					maxDelta: DELTA,
					thresholds: { erosion: 0.9, verbosity: null },
					calibratedAtRulePackVersion: 0,
				},
				base: metrics(0.1, 0.1),
			}),
		);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain("calibrated against v0");
	});

	test("a delta over maxDelta fails, and only for that metric", () => {
		const failures = decide(input({ config: { maxDelta: DELTA }, base: metrics(0.1, 0.1) }));
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain("::error::erosion rose");
	});

	test("an improvement passes however large", () => {
		expect(decide(input({ config: { maxDelta: DELTA }, base: metrics(0.9, 0.9) }))).toEqual([]);
	});

	test("hot callables print as one block with one annotation for each", () => {
		const hot = [
			{ file: "a.ts", line: 3, name: "f", complexity: 12, baseComplexity: null },
			{ file: "b.ts", line: 9, name: "g", complexity: 14, baseComplexity: 11 },
		];
		const failures = decide(
			input({ config: { hotCallables: true }, base: metrics(0.2, 0.1), hot }),
		);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.split("\n")).toHaveLength(2);
		expect(failures[0]).toContain("f is new at CC 12");
	});

	test("an absolute threshold fails only when the level is over it", () => {
		const thresholds = { erosion: 0.15, verbosity: 0.5 };
		const failures = decide(input({ config: { thresholds } }));
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain("::error::erosion 0.2000 exceeds the 0.15");
	});
});
