// Callable extraction and cyclomatic complexity.
//
// Turns the structural scan's flat match list into the per-callable (CC, SLOC)
// pairs that Eq. 2 consumes.
//
// The one judgement call worth knowing about: a decision point is attributed to
// the INNERMOST callable containing it, and inline closures are not callables
// (structural/typescript.yml explains which are and aren't). So a closure's
// branches count toward the named function that owns it, rather than becoming a
// separate near-zero-complexity entry that would dilute the denominator. Radon
// treats Python lambdas the same way. Nested *named* functions do get their own
// entry, and their branches are removed from the parent's count — also Radon's
// behaviour.

import type { Callable, Language } from "./config.ts";
import { WAIVER } from "./config.ts";
import type { Match } from "./scan.ts";
import { sourceLineKeys } from "./sources.ts";

type Span = {
	startByte: number;
	endByte: number;
	startLine: number;
	endLine: number;
};

/** The byte and line range of a match. */
function toSpan(m: Match): Span {
	return {
		startByte: m.range.byteOffset.start,
		endByte: m.range.byteOffset.end,
		startLine: m.range.start.line,
		endLine: m.range.end.line,
	};
}

/** The span's length in bytes, which orders spans from innermost to outermost. */
function size(s: Span): number {
	return s.endByte - s.startByte;
}

/**
 * The smallest span in `bySizeAsc` that contains `byte`, or undefined. The
 * list must be sorted smallest first, so the first hit is the innermost.
 */
function innermost<T extends Span>(bySizeAsc: T[], byte: number): T | undefined {
	return bySizeAsc.find((s) => byte >= s.startByte && byte < s.endByte);
}

/** What a structural match means to the engine. */
type RuleKind = "callable" | "name" | "comment" | "binding" | "decision";

/**
 * The rule-id contract with structural/*.yml: a match's meaning comes from the
 * prefix of its rule id. Prefix rather than equality, because a re-targeted
 * dialect pack suffixes rule ids (`meta-comment-tsx`). This table is the one
 * place the engine reads the contract.
 */
const RULE_KINDS: Array<[prefix: string, kind: RuleKind]> = [
	["callable-", "callable"],
	// The `$NAME` of the callable that starts at the same byte.
	["meta-name", "name"],
	["meta-comment", "comment"],
	// One binding clause of a multi-clause Swift condition.
	["meta-condition-binding", "binding"],
	["dp-", "decision"],
];

/** The kind of a match from its rule id, or null for a rule the engine does not read. */
export function ruleKind(ruleId: string): RuleKind | null {
	return RULE_KINDS.find(([prefix]) => ruleId.startsWith(prefix))?.[1] ?? null;
}

/**
 * Statement kinds whose condition list can hold several clauses separated by
 * commas. Each clause after the first is a short-circuit test — the comma is an
 * AND — so it is a decision point, exactly like `&&`.
 *
 * Only Swift needs this. In TypeScript the equivalent is written with `&&`,
 * which is already a node the decision-point rules match directly.
 */
const MULTI_CLAUSE_STATEMENT_RULE = /^dp-(?:if|guard)/;

/** Callables whose name is their kind rather than an identifier in the source. */
const INTRINSIC_NAMES: Array<[rulePrefix: string, name: string]> = [
	["callable-init", "init"],
	["callable-deinit", "deinit"],
	["callable-anonymous-initializer", "init"],
	["callable-secondary-constructor", "constructor"],
	["callable-getter", "get"],
	["callable-setter", "set"],
];

/**
 * Extra decision points contributed by multi-clause conditions, keyed by the
 * byte offset of the statement that owns them.
 *
 * A statement with n bindings contributes n-1: the first clause is already
 * counted by `dp-if` / `dp-guard`, and every further clause adds a branch. Each
 * binding is attributed to its INNERMOST enclosing statement so a nested
 * `if let` inside another one does not inflate the outer statement's count.
 */
function extraConditionComplexity(statements: Span[], bindings: Span[]): Map<number, number> {
	const bySizeAsc = statements.toSorted((a, b) => size(a) - size(b));
	const bindingsPerStatement = Map.groupBy(
		bindings.flatMap((b) => innermost(bySizeAsc, b.startByte) ?? []),
		(statement) => statement.startByte,
	);
	return new Map(
		[...bindingsPerStatement].map(([start, owned]) => [start, Math.max(0, owned.length - 1)]),
	);
}

/** The name of each callable in one file, keyed by its start byte. */
function namesByStart(callables: Match[], names: Match[]): Map<number, string> {
	return new Map([
		...callables.flatMap((m) => {
			const intrinsic = INTRINSIC_NAMES.find(([prefix]) => m.ruleId.startsWith(prefix));
			return intrinsic ? [[m.range.byteOffset.start, intrinsic[1]] as const] : [];
		}),
		...names.flatMap((m) => {
			const name = m.metaVariables?.single?.NAME?.text;
			return name ? [[m.range.byteOffset.start, name] as const] : [];
		}),
	]);
}

/** One file's matches and source lines, as buildCallables groups them. */
type FileScan = {
	/** The path, relative to the repository root. */
	file: string;
	/** The language the file was measured as. */
	language: Language;
	/** The structural matches in this file. */
	matches: Match[];
	/** The file's source lines. */
	sourceLines: Set<number>;
};

/**
 * The callables in one file, innermost first. A decision point counts toward
 * the innermost callable that contains it. One outside every callable is
 * top-level control flow; upstream's mass.py only sums function and method
 * symbols, so it is dropped rather than attributed anywhere.
 */
function callablesInFile({ file, language, matches, sourceLines }: FileScan): Callable[] {
	const byKind = Map.groupBy(matches, (m) => ruleKind(m.ruleId));
	const ofKind = (kind: RuleKind): Match[] => byKind.get(kind) ?? [];

	const spans = ofKind("callable")
		.map(toSpan)
		.toSorted((a, b) => size(a) - size(b));
	const complexity = new Map<Span, number>(spans.map((s) => [s, 1]));
	const addDecisions = (byte: number, count: number): void => {
		const owner = innermost(spans, byte);
		if (owner) complexity.set(owner, (complexity.get(owner) ?? 1) + count);
	};

	for (const decision of ofKind("decision")) addDecisions(decision.range.byteOffset.start, 1);
	const statements = ofKind("decision")
		.filter((m) => MULTI_CLAUSE_STATEMENT_RULE.test(m.ruleId))
		.map(toSpan);
	const bindings = ofKind("binding").map(toSpan);
	for (const [start, extra] of extraConditionComplexity(statements, bindings)) {
		if (extra > 0) addDecisions(start, extra);
	}

	const names = namesByStart(ofKind("callable"), ofKind("name"));
	const waiverEndLines = new Set(
		ofKind("comment")
			.filter((m) => m.text?.includes(WAIVER))
			.map((m) => m.range.end.line),
	);
	return spans.map((span) => ({
		file,
		language,
		startByte: span.startByte,
		endByte: span.endByte,
		startLine: span.startLine,
		endLine: span.endLine,
		complexity: complexity.get(span) ?? 1,
		sloc: sourceLineKeys({ file, sourceLines, startLine: span.startLine, endLine: span.endLine })
			.length,
		name: names.get(span.startByte) ?? null,
		waived: waiverEndLines.has(span.startLine - 1),
	}));
}

/** One language's structural matches, with the source lines of each file. */
type LanguageScan = {
	/** Every structural match for the language's files. */
	matches: Match[];
	/**
	 * Each file's source lines, so SLOC uses the same definition as the LOC
	 * denominator rather than a second, subtly different one.
	 */
	sourceLinesByFile: Map<string, Set<number>>;
	/** The language the files were measured as. */
	language: Language;
};

/** Build the callable table for one language. */
export function buildCallables({ matches, sourceLinesByFile, language }: LanguageScan): Callable[] {
	return [...Map.groupBy(matches, (m) => m.file)].flatMap(([file, fileMatches]) => {
		const sourceLines = sourceLinesByFile.get(file);
		return sourceLines
			? callablesInFile({ file, language, matches: fileMatches, sourceLines })
			: [];
	});
}
