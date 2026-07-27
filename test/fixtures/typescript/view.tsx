// Fixture proving `.tsx` is actually measured. ast-grep treats TSX as a
// separate grammar, so a rule pack authored as `language: typescript` matches
// nothing here unless the engine re-targets it (src/scan.ts:retargetRules).
//
// If that re-targeting breaks, this file reports zero callables and the whole
// dialect silently stops contributing to the metric.

export function Badge({ label, muted }: { label: string; muted?: boolean }) {
	// CC 4 — two ternaries and one `&&`.
	const text = label.length > 0 ? label : "none";
	return <span className={muted && text ? "muted" : "plain"}>{text}</span>;
}
