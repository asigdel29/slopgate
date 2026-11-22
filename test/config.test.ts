// Config validation tests.
//
// The bug these exist for: `thresholds.erosion` compared with `=== null` meant a
// MISSING or misspelt key produced `undefined`, which is not `null`, so the
// "uncalibrated" branch never ran — and `value > undefined` is `false`, so the
// gate passed. A typo silently turned the gate off while still printing a green
// build. A gate that a typo can disable is worse than no gate, because it looks
// like one.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";

async function configFile(contents: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "slop-cfg-"));
	const path = join(dir, "slop.config.json");
	await writeFile(path, typeof contents === "string" ? contents : JSON.stringify(contents), "utf8");
	return path;
}

const validLanguages = { typescript: { include: ["src/**/*.ts"] } };
const noDelta = { erosion: null, verbosity: null };

describe("loadConfig", () => {
	test("accepts a well-formed config", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: { erosion: 0.5, verbosity: 0.1 },
			calibratedAtRulePackVersion: 0,
		});
		const config = await loadConfig(path);
		expect(config.thresholds.erosion).toBe(0.5);
	});

	test("accepts null as an explicit 'not yet calibrated'", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: { erosion: null, verbosity: null },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).resolves.toBeDefined();
	});

	test("rejects a MISSING threshold rather than silently disabling the gate", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: { verbosity: 0.1 },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/thresholds\.erosion/);
	});

	test("names the likely cause when a key is missing", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: { erosionn: 0.5, verbosity: 0.1 },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/missing or misspelt/);
	});

	test("rejects a non-numeric threshold", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: { erosion: "0.5", verbosity: 0.1 },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/must be a number or null/);
	});

	test("rejects an entirely missing thresholds object", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/`thresholds` must be an object/);
	});

	test("rejects an unknown language rather than measuring nothing", async () => {
		const path = await configFile({
			languages: { rust: { include: ["src/**/*.rs"] } },
			maxDelta: noDelta,
			thresholds: { erosion: null, verbosity: null },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/unknown language 'rust'/);
	});

	test("rejects an empty include list", async () => {
		const path = await configFile({
			languages: { typescript: { include: [] } },
			maxDelta: noDelta,
			thresholds: { erosion: null, verbosity: null },
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/non-empty array of globs/);
	});

	test("rejects an unknown top-level key, so a misspelt rule cannot stay off", async () => {
		const path = await configFile({
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: noDelta,
			hotcallables: true,
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/unknown key `hotcallables`/);
	});

	test("rejects an unknown key inside a language and inside a limit section", async () => {
		const path = await configFile({
			languages: { typescript: { include: ["src/**/*.ts"], exlude: ["**/*.test.ts"] } },
			maxDelta: { ...noDelta, erosionn: 0.1 },
			thresholds: noDelta,
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(
			/languages\.typescript\.exlude(.|\n)*maxDelta\.erosionn/,
		);
	});

	test("rejects an exclude that is not an array of globs", async () => {
		const path = await configFile({
			languages: { typescript: { include: ["src/**/*.ts"], exclude: "dist/**" } },
			maxDelta: noDelta,
			thresholds: noDelta,
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).rejects.toThrow(/exclude must be an array of globs/);
	});

	test("allows $comment and $schema", async () => {
		const path = await configFile({
			$comment: "why the limits are what they are",
			$schema: "./schema.json",
			languages: validLanguages,
			maxDelta: noDelta,
			thresholds: noDelta,
			calibratedAtRulePackVersion: 0,
		});
		await expect(loadConfig(path)).resolves.toBeDefined();
	});

	test("reports every problem at once, not just the first", async () => {
		const path = await configFile({ languages: {}, thresholds: {} });
		await expect(loadConfig(path)).rejects.toThrow(/languages(.|\n)*calibratedAtRulePackVersion/);
	});

	test("gives a readable error for malformed JSON", async () => {
		const path = await configFile("{ not json");
		await expect(loadConfig(path)).rejects.toThrow(/is not valid JSON/);
	});

	test("points at the example when the file is absent", async () => {
		await expect(loadConfig("/nope/slop.config.json")).rejects.toThrow(/missing config at/);
	});
});
