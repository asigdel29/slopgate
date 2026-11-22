// Locating the external analysers (ast-grep, jscpd).
//
// The engine runs in three quite different places and each needs a different
// answer, so resolution is an explicit chain rather than a bare PATH lookup:
//
//   1. an explicit env override — how CI pins a specific build
//   2. for ast-grep, the binary in its platform package (see below)
//   3. this package's own node_modules — the normal installed case, since both
//      tools are declared dependencies
//   4. the measured repository's node_modules — the vendored case, where this
//      directory is copied into a repo that installs the tools itself
//   5. PATH — nix shells, Homebrew, a system install
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

/** Resolves `specifier` from `fromDir` the way an import would, or null when it is not installed. */
function tryResolve(specifier: string, fromDir: string): string | null {
	try {
		return Bun.resolveSync(specifier, fromDir);
	} catch {
		return null;
	}
}

/** Platform suffixes that @ast-grep/cli publishes a binary package for, by OS. */
const AST_GREP_SUFFIXES: Partial<Record<NodeJS.Platform, string[]>> = {
	linux: ["-gnu", "-musl"],
	win32: ["-msvc"],
};

/**
 * The real ast-grep binary in its platform package, such as
 * `@ast-grep/cli-darwin-arm64`, or null when none is installed.
 *
 * `node_modules/.bin/ast-grep` is a stub until the package's postinstall links
 * the platform binary over it, and Bun blocks that postinstall unless the host
 * repository trusts it. The platform package is installed either way, so
 * reading the binary from there works on every install. The lookup starts
 * from @ast-grep/cli itself, as its postinstall does, so it also works when
 * the package manager does not hoist the platform package.
 */
function astGrepPlatformBinary(fromDirs: string[]): string | null {
	const exe = process.platform === "win32" ? "ast-grep.exe" : "ast-grep";
	const suffixes = AST_GREP_SUFFIXES[process.platform] ?? [""];
	for (const fromDir of fromDirs) {
		const cli = tryResolve("@ast-grep/cli/package.json", fromDir);
		if (cli === null) continue;
		for (const suffix of suffixes) {
			const name = `@ast-grep/cli-${process.platform}-${process.arch}${suffix}`;
			const manifest = tryResolve(`${name}/package.json`, dirname(cli));
			if (manifest !== null) return join(dirname(manifest), exe);
		}
	}
	return null;
}

/** The path or command to run `tool` with, from the first source in the chain above. */
export function resolveTool(tool: ToolName, root: string): string {
	const override = process.env[ENV_OVERRIDE[tool]];
	if (override) return override;

	const platformBinary = tool === "ast-grep" ? astGrepPlatformBinary([PACKAGE_DIR, root]) : null;
	if (platformBinary !== null && existsSync(platformBinary)) return platformBinary;

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

/** The error text for a tool that could not be started, naming every path tried. */
export function describeMissing(tool: ToolName, root: string): string {
	return (
		`could not run '${tool}'. Tried $${ENV_OVERRIDE[tool]}, ` +
		`${join(PACKAGE_DIR, "node_modules", ".bin", tool)}, ` +
		`${join(root, "node_modules", ".bin", tool)}, and PATH.\n` +
		`Install it, or set ${ENV_OVERRIDE[tool]} to its path.`
	);
}
