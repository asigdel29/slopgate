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

import type { Callable, FileMeasurement, Language } from "./config.ts";
import type { Match } from "./scan.ts";

type Span = {
	startByte: number;
	endByte: number;
	startLine: number;
	endLine: number;
};

function toSpan(m: Match): Span {
	return {
		startByte: m.range.byteOffset.start,
		endByte: m.range.byteOffset.end,
		startLine: m.range.start.line,
		endLine: m.range.end.line,
	};
}

function size(s: Span): number {
	return s.endByte - s.startByte;
}

/** Count the file's source lines that fall inside `[startLine, endLine]`. */
function slocWithin(sourceLines: Set<number>, startLine: number, endLine: number): number {
	let count = 0;
	for (let line = startLine; line <= endLine; line++) {
		if (sourceLines.has(line)) count++;
	}
	return count;
}

/**
 * Statement kinds whose condition list can hold several clauses separated by
 * commas. Each clause after the first is a short-circuit test — the comma is an
 * AND — so it is a decision point, exactly like `&&`.
 *
 * Only Swift needs this. In TypeScript the equivalent is written with `&&`,
 * which is already a node the decision-point rules match directly.
 */
const MULTI_CLAUSE_STATEMENT_RULES = ["dp-if", "dp-guard"];

export function isConditionBindingRule(ruleId: string): boolean {
	return ruleId.startsWith("meta-condition-binding");
}

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
	const perStatement = new Map<number, number>();
	if (statements.length === 0 || bindings.length === 0) return perStatement;

	const bySizeAsc = [...statements].sort((a, b) => size(a) - size(b));

	for (const binding of bindings) {
		for (const statement of bySizeAsc) {
			if (binding.startByte >= statement.startByte && binding.startByte < statement.endByte) {
				perStatement.set(statement.startByte, (perStatement.get(statement.startByte) ?? 0) + 1);
				break;
			}
		}
	}

	// n bindings => n-1 extra decision points.
	for (const [start, count] of perStatement) {
		perStatement.set(start, Math.max(0, count - 1));
	}
	return perStatement;
}

export function isCallableRule(ruleId: string): boolean {
	return ruleId.startsWith("callable-");
}

export function isDecisionPointRule(ruleId: string): boolean {
	return ruleId.startsWith("dp-");
}

// Prefix rather than equality: a re-targeted dialect pack suffixes rule ids
// (see scan.ts:retargetRules), so `meta-comment-tsx` must classify the same way.
export function isCommentRule(ruleId: string): boolean {
	return ruleId.startsWith("meta-comment");
}

/**
 * Build the callable table for one language.
 *
 * `measurements` supplies each file's source-line set, so SLOC is computed on
 * the same definition as the LOC denominator rather than a second, subtly
 * different one.
 */
export function buildCallables(
	matches: Match[],
	measurements: FileMeasurement[],
	language: Language,
): Callable[] {
	const sourceLinesByFile = new Map(measurements.map((m) => [m.file, m.sourceLines]));

	const callableSpansByFile = new Map<string, Span[]>();
	const decisionPointsByFile = new Map<string, Span[]>();
	// Statements that can carry a multi-clause condition, and the bindings found
	// in them — tracked separately because their contribution is arithmetic
	// (n - 1) rather than one-per-match.
	const clauseStatementsByFile = new Map<string, Span[]>();
	const conditionBindingsByFile = new Map<string, Span[]>();

	for (const m of matches) {
		if (isCallableRule(m.ruleId)) {
			const spans = callableSpansByFile.get(m.file) ?? [];
			spans.push(toSpan(m));
			callableSpansByFile.set(m.file, spans);
		} else if (isConditionBindingRule(m.ruleId)) {
			const spans = conditionBindingsByFile.get(m.file) ?? [];
			spans.push(toSpan(m));
			conditionBindingsByFile.set(m.file, spans);
		} else if (isDecisionPointRule(m.ruleId)) {
			const spans = decisionPointsByFile.get(m.file) ?? [];
			spans.push(toSpan(m));
			decisionPointsByFile.set(m.file, spans);

			// A dialect pack suffixes rule ids, so match on the prefix.
			if (MULTI_CLAUSE_STATEMENT_RULES.some((id) => m.ruleId.startsWith(id))) {
				const stmts = clauseStatementsByFile.get(m.file) ?? [];
				stmts.push(toSpan(m));
				clauseStatementsByFile.set(m.file, stmts);
			}
		}
	}

	const callables: Callable[] = [];

	for (const [file, spans] of callableSpansByFile) {
		const sourceLines = sourceLinesByFile.get(file);
		if (!sourceLines) continue;

		// Innermost-first. Scanning this order lets the containment search stop at
		// the first hit, which is by construction the tightest enclosing callable.
		const bySizeAsc = [...spans].sort((a, b) => size(a) - size(b));
		const complexity = new Map<Span, number>(bySizeAsc.map((s) => [s, 1]));

		for (const dp of decisionPointsByFile.get(file) ?? []) {
			for (const callable of bySizeAsc) {
				if (dp.startByte >= callable.startByte && dp.startByte < callable.endByte) {
					complexity.set(callable, (complexity.get(callable) as number) + 1);
					break;
				}
			}
			// A decision point outside every callable is top-level control flow.
			// Upstream's mass.py only sums function/method symbols, so it is
			// intentionally dropped rather than attributed anywhere.
		}

		// Multi-clause conditions add their extra branches to whichever callable
		// owns the statement — the same attribution the statement itself got.
		const extras = extraConditionComplexity(
			clauseStatementsByFile.get(file) ?? [],
			conditionBindingsByFile.get(file) ?? [],
		);
		for (const [statementStart, extra] of extras) {
			if (extra === 0) continue;
			for (const callable of bySizeAsc) {
				if (statementStart >= callable.startByte && statementStart < callable.endByte) {
					complexity.set(callable, (complexity.get(callable) as number) + extra);
					break;
				}
			}
		}

		for (const span of bySizeAsc) {
			callables.push({
				file,
				language,
				startByte: span.startByte,
				endByte: span.endByte,
				startLine: span.startLine,
				endLine: span.endLine,
				complexity: complexity.get(span) as number,
				sloc: slocWithin(sourceLines, span.startLine, span.endLine),
			});
		}
	}

	return callables;
}
