// Locating the external analysers (ast-grep, jscpd).
//
// The engine runs in three quite different places and each needs a different
// answer, so resolution is an explicit chain rather than a bare PATH lookup:
//
//   1. an explicit env override — how CI pins a specific build
//   2. this package's own node_modules — the normal installed case, since both
//      tools are declared dependencies
//   3. the measured repository's node_modules — the vendored case, where this
//      directory is copied into a repo that installs the tools itself
//   4. PATH — nix shells, Homebrew, a system install
//
// Getting this wrong is a confusing failure (a silently different analyser
// version changes the metric), so the error message names every path tried.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const PACKAGE_DIR = dirname(import.meta.dir);

export type ToolName = "ast-grep" | "jscpd";

const ENV_OVERRIDE: Record<ToolName, string> = {
	"ast-grep": "SLOP_AST_GREP",
	jscpd: "SLOP_JSCPD",
};

export function resolveTool(tool: ToolName, root: string): string {
	const override = process.env[ENV_OVERRIDE[tool]];
	if (override) return override;

	const candidates = [
		join(PACKAGE_DIR, "node_modules", ".bin", tool),
		join(root, "node_modules", ".bin", tool),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}

	// Fall through to PATH. If it is not there either, the spawn fails and
	// describeMissing() below explains what was tried.
	return tool;
}

export function describeMissing(tool: ToolName, root: string): string {
	return (
		`could not run '${tool}'. Tried $${ENV_OVERRIDE[tool]}, ` +
		`${join(PACKAGE_DIR, "node_modules", ".bin", tool)}, ` +
		`${join(root, "node_modules", ".bin", tool)}, and PATH.\n` +
		`Install it, or set ${ENV_OVERRIDE[tool]} to its path.`
	);
}
