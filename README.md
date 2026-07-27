# slopgate

A CI gate for the two code-degradation metrics from
**[SlopCodeBench: Benchmarking How Coding Agents Degrade Over Long-Horizon Iterative Tasks][paper]**
(Orlanski et al., arXiv:2603.24755).

The paper measured what happens when coding agents repeatedly extend their own
work. The headline result is not that agents write bad code — it is that they
**pass their tests while the code decays underneath them**:

| | |
|---|---|
| Structural erosion rose in | **77%** of trajectories |
| Verbosity rose in | **75.5%** of trajectories |
| Agent code vs. a 473-repo human panel | **2.0×** more eroded, **2.3×** more verbose |
| Degradation speed vs. human commits | **5×** (erosion), **~7×** (verbosity) |

Lint, typecheck, dead-code and coverage gates are all blind to this. `slopgate`
computes the paper's two metrics over a repository and fails the build when a
change degrades it faster than a human commit typically would.

Supports **TypeScript** (incl. `.tsx`) and **Swift**.

[paper]: https://arxiv.org/abs/2603.24755

## The metrics

**Structural erosion** — the share of the codebase's complexity "mass" sitting
in functions already too complex to work on safely.

```
mass(f)  = CC(f) × √SLOC(f)                        (Eq. 2)
Erosion  = Σ mass(f) where CC(f) > 10 / Σ mass(f)  (Eq. 3)
```

The square root compresses size so branching dominates rather than raw length.
The `CC > 10` cutoff is Radon's high-complexity bound and is not configurable —
it is what keeps results comparable to the paper's.

Erosion rises when branches are patched into functions that are *already* big,
and falls when that logic is extracted. It is a ratio, so a codebase can grow
without eroding.

**Verbosity** — the share of source lines that are redundant.

```
Verbosity = |{rule-flagged lines} ∪ {duplicated lines}| / LOC   (Eq. 4)
```

The union is deduplicated, so a line both flagged and duplicated counts once and
the result stays in `[0, 1]`. `LOC` counts source lines only — blanks and
comment-only lines are excluded, so neither adding nor stripping comments moves
the number.

## Install

```sh
bun add -d slopgate    # or: npm i -D slopgate
```

Requires [Bun](https://bun.sh). The two analysers it shells out to
([ast-grep](https://ast-grep.github.io) for parsing,
[jscpd](https://jscpd.dev) for clone detection) are pinned dependencies.

## Use

Write a `slop.config.json` at the root of the repo you want to gate:

```json
{
  "languages": {
    "typescript": {
      "include": ["src/**/*.ts", "src/**/*.tsx"],
      "exclude": ["**/node_modules/**", "**/*.test.ts"]
    }
  },
  "thresholds": { "erosion": null, "verbosity": null },
  "calibratedAtRulePackVersion": 0
}
```

Measure, then set the ceilings:

```sh
slopgate --report     # print the numbers, never fails
slopgate              # gate: exit 1 if a metric is over its ceiling
slopgate --json       # machine-readable
```

```
Code degradation metrics — SlopCodeBench (arXiv:2603.24755)

  Structural erosion  0.5203   (108/1678 callables over CC 10, 23181/44552 complexity mass)
  Verbosity           0.0867   (4174/48152 source lines; 0 rule-flagged, 4174 cloned, deduplicated)

  Measured over 332 files, rule pack v0.
  ...
  Highest complexity mass:
    src/index.ts:113  CC 219, 699 SLOC, mass 5790
```

The report ends with the callables holding the most complexity mass — where to
look when erosion is what failed.

## Choosing a ceiling

`thresholds` are **ceilings**, and they are a one-way ratchet: lower is better,
so they only ever move down. Never raise one to make a red build green.

The recommended value is **what you measure today, plus the paper's median
_human_ per-commit velocity**:

```
erosion   ceiling = measured + 0.0053
verbosity ceiling = measured + 0.0022
```

That makes the gate assert something the paper actually justifies:

> this change may degrade the codebase no faster than a typical human commit in
> the 473-repo panel does.

For scale, the paper's agent checkpoints move erosion **+0.0264** and verbosity
**+0.0144** per step. A change that trips this gate is degrading the codebase at
agent speed. Every run prints the remaining headroom.

### Don't gate on the paper's absolute numbers

The report prints the panel means (erosion 0.34, verbosity 0.19) for scale, but
they are deliberately **not** thresholds: they were measured on **473 Python
repositories**. Gating a TypeScript or Swift codebase on a Python distribution
would be a category error. The ratchet is self-referential by design.

## How complexity is counted

Cyclomatic complexity comes from ast-grep decision points — `if` / `else if`,
loops, `case`, `catch`, ternary, `&&`, `||`, `??`, plus Swift's `guard` and
`for … where` — attributed to the **innermost enclosing named callable**.

Two deliberate choices, both directly tested:

- **Inline closures are not callables.** `xs.map(x => …)` has its branches
  folded into the function that owns it. Counting every callback separately
  would flood the denominator with near-zero-complexity entries and drive
  erosion toward zero in callback-heavy code — SwiftUI especially. Radon treats
  Python lambdas the same way.
- **Named nested functions are** callables, and their branches are removed from
  the parent — also Radon's behaviour.

Swift computed properties, including SwiftUI `var body`, **are** measured. That
is where SwiftUI complexity accumulates, so excluding them would blind the
metric to the most likely place for erosion.

`default:` / `else` are not decision points; they add no independent path.
Optional chaining (`?.`) is not counted either.

## Vendoring

For CI without a network dependency:

```sh
scripts/vendor.sh /path/to/repo
```

This copies the engine into `<repo>/scripts/slop/`, installs a `slop-gate.sh`
wrapper, and records the upstream revision in `VENDOR.md`. Your
`scripts/slop.config.json` is seeded once and never clobbered on re-vendor.
Exclude the vendored directory from your formatter and linter so re-vendoring
doesn't produce spurious diffs.

## Status

The verbosity metric has two halves. Clone detection is complete. The
**rule-flagged half is not yet implemented**: the paper's 203 slop rules
([`configs/slop_rules.yaml`][upstream-rules]) are all `language: python` and
have to be re-authored per language. `rules/VERSION` is `0` and the rule
directories are empty, so verbosity currently measures duplication only — a
correct half of Eq. 4, not an approximation of the whole.

Rule packs will land in batches. Because adding rules can only push verbosity
up, the gate hard-fails when `rules/VERSION` doesn't match the config's
`calibratedAtRulePackVersion`, rather than silently comparing incomparable
numbers. See [`rules/PORTING.md`](rules/PORTING.md) for the port ledger.

Erosion is complete and language-agnostic — CC and SLOC carry over directly.

## Relation to the original

The paper's reference implementation is
[SprocketLab/slop-code-bench][upstream], which is Python-only and built to
evaluate benchmark trajectories. This is an independent reimplementation of just
the two metrics, for TypeScript and Swift, packaged as a CI gate. Erosion is
cross-checked against upstream's [`mass.py`][mass]; verbosity follows the
paper's deduplicated-union definition rather than upstream's `composites.py`
fallback, which sums the two ratios and can exceed 1.

[upstream]: https://github.com/SprocketLab/slop-code-bench
[upstream-rules]: https://github.com/SprocketLab/slop-code-bench/blob/main/configs/slop_rules.yaml
[mass]: https://github.com/SprocketLab/slop-code-bench/blob/main/src/slop_code/metrics/checkpoint/mass.py

## Licence

MIT. Not affiliated with the paper's authors.
