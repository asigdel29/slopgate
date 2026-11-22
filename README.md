# slopgate

A CI gate for the two code-degradation metrics from
**[SlopCodeBench: Benchmarking How Coding Agents Degrade Over Long-Horizon Iterative Tasks][paper]**
(Orlanski et al., arXiv:2603.24755).

The paper measured what happens when coding agents repeatedly extend their own
work. The headline result is not that agents write bad code — it is that they
**pass their tests while the code decays underneath them**:

|                                       |                                             |
| ------------------------------------- | ------------------------------------------- |
| Structural erosion rose in            | **77%** of trajectories                     |
| Verbosity rose in                     | **75.5%** of trajectories                   |
| Agent code vs. a 473-repo human panel | **2.0×** more eroded, **2.3×** more verbose |
| Degradation speed vs. human commits   | **5×** (erosion), **~7×** (verbosity)       |

Lint, typecheck, dead-code and coverage gates are all blind to this. `slopgate`
computes the paper's two metrics over a repository and fails the build when a
change degrades it faster than a human commit typically would.

Supports **TypeScript** (incl. `.tsx`, `.mts` and `.cts`) and **Swift**.

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

Erosion rises when branches are patched into functions that are _already_ big,
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

slopgate is not on npm. Add it from GitHub:

```sh
bun add -d github:asigdel29/slopgate
```

slopgate runs the ast-grep binary from its platform package, such as
`@ast-grep/cli-linux-x64-gnu`. Bun blocks the ast-grep postinstall by default,
but slopgate does not need it, so you do not have to trust the package.

It needs [Bun](https://bun.sh). The two analysers that it calls
([ast-grep](https://ast-grep.github.io) for parsing,
[jscpd](https://jscpd.dev) for clone detection) are pinned dependencies.

## Set up a repository

```sh
bunx slopgate init            # add --force to overwrite files that exist
```

`init` copies these files into the repository. It does not overwrite a file that exists.

| File                                     | What it is                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `slop.config.json`                       | The files to measure and the limits                                                             |
| `.github/workflows/slopgate.yml`         | A CI job that gates each pull request                                                           |
| `.github/instructions/*.instructions.md` | Rules for agents and reviewers: comments, tests, TypeScript, the slop gate, the review workflow |
| `.claude/rules/*.md`                     | Links to the rules, where Claude Code reads them                                                |
| `.claude/skills/*`                       | The skills: `fixit`, `writing-style`, `release-test`, `preview-test`                            |

To get only the skills, install the plugin in Claude Code:

```text
/plugin marketplace add asigdel29/slopgate
/plugin install slopgate@slopgate
```

## Use

`slop.config.json` at the root of the repository tells slopgate what to measure:

```json
{
  "languages": {
    "typescript": {
      "include": ["src/**/*.ts", "src/**/*.tsx"],
      "exclude": ["**/node_modules/**", "**/*.test.ts"]
    }
  },
  "maxDelta": { "erosion": 0.0053, "verbosity": 0.0022 },
  "hotCallables": true,
  "thresholds": { "erosion": null, "verbosity": null },
  "calibratedAtRulePackVersion": 1
}
```

Each key is required except `hotCallables`. A key with a wrong type stops the run with an error, so a typo cannot turn the gate off. `examples/slop.config.json` explains each key.

```sh
slopgate --report                  # measure and print; always exits 0
slopgate --base origin/main        # the gate: measure the base too, and fail on the change
slopgate --json                    # machine-readable; always exits 0
```

| Flag                | Effect                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| `--root <dir>`      | The repository to measure. The default is the current directory.               |
| `--config <path>`   | The config file. The default is `<root>/slop.config.json`.                     |
| `--base <ref>`      | Also measure this revision, and gate on the difference. This is the main gate. |
| `--report`          | Print the report and exit 0.                                                   |
| `--json`            | Print the JSON and exit 0.                                                     |
| `--json-out <path>` | Also write the JSON to `<path>`, and still gate.                               |

When `maxDelta` or `hotCallables` is set, the gate needs `--base`. Without it, the run fails, because the change was not measured.

| Exit code | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| 0         | The gate passed, or `--report`, `--json` or `--help` was given.                 |
| 1         | The gate failed. Each failure is a GitHub Actions `::error::` annotation.       |
| 2         | The run itself failed: a bad flag, a bad config or an analyser error. One line. |

A config key that slopgate does not know is an error, so a typo cannot turn a rule off. `$comment` and `$schema` are allowed.

When the clone has no merge base of `HEAD` and `--base` (a shallow clone), slopgate uses the `--base` commit itself and prints a warning. That is correct for the merge commit of a pull request. For a branch tip, fetch the full history.

This is the output of slopgate on its own source:

```
Code degradation metrics — SlopCodeBench (arXiv:2603.24755)

  Structural erosion  0.6305   (7/54 callables over CC 10, 1024/1624 complexity mass)
  Verbosity           0.0031   (4/1289 source lines; 4 rule-flagged, 0 cloned, deduplicated)

  Measured over 14 files, rule pack v1.
  ...
  Highest complexity mass:
    src/callables.ts:125  CC 33, 89 SLOC, mass 311
```

The report ends with the callables that hold the most complexity mass. Look there first when erosion fails.

### In CI

`examples/slopgate.yml` is a complete job. `init` copies it. The two important parts are:

- `fetch-depth: 0` on the checkout. The merge base must be in the clone.
- `--base` set to the base SHA of the pull request, with `--json-out` to keep the numbers from the same scan.

```sh
slopgate --base "$BASE_SHA" --json-out slop-metrics.json
```

The JSON has the head metrics at the top level, the base metrics under `base` (or `null` without `--base`), and the hot callables under `hot` (or `null` when `hotCallables` is off). `detail` has the counts behind each ratio.

### The hot-callable ratchet

Erosion is a ratio over the whole repository, so a change can add branches to a
function already far over CC 10 and still move the ratio by less than
`maxDelta`: one function is a small share of a large denominator. A string of
changes like that consumes an absolute backstop without any single one failing.

Set `"hotCallables": true` and run with `--base`, and every callable over CC 10
on the head is compared with the same callable on the base. It fails the run
when it is new, or when its complexity went up. A callable that stayed level or
shrank passes, however large it is, so existing debt does not block unrelated
work; it only stops growing.

Callables are matched by file and the name the parser gives them. Same-named
callables in one file (overloads, or several objects' `execute` methods) are
compared by rank, most complex against most complex, so adding a simple sibling
never shifts the comparison. A function
moved between files keeps its history when its name is unique; a renamed one
reads as new. To exempt one
deliberately, put a comment containing `slopgate-allow: <reason>` on the line
directly above it, where review will see it. The JSON output lists offenders
under `hot`.

## Choosing the limits

`maxDelta` is the main gate. It is the largest increase that one change may cause in each metric. The defaults are the paper's median per-commit velocity for _human_ commits:

```
erosion   maxDelta = 0.0053
verbosity maxDelta = 0.0022
```

The gate then makes one claim that the paper supports:

> this change degrades the codebase no faster than a typical human commit in
> the 473-repo panel does.

For scale, the paper's agent checkpoints move erosion **+0.0264** and verbosity **+0.0144** for each step. A change that fails this gate degrades the codebase at agent speed. An improvement always passes.

`thresholds` are an optional absolute backstop, normally `null`. An absolute ceiling on a ratio for the whole repository is a budget for all time, not a limit for each change: the first changes use it up, and each later change then fails. If you set one, set it far above the value today, and only lower it. Never raise a limit to make a failed build pass.

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

### Swift multi-clause conditions

`if let x = a, let y = b` and `if a != nil && b != nil` express the same two
short-circuit tests, so they score the same complexity: the comma **is** an AND.
A statement with n optional bindings contributes n-1 decision points on top of
the `if`/`guard` itself, attributed to the innermost enclosing statement so a
nested `if let` does not inflate the one around it.

Remaining gap: a _mixed_ clause list such as `if let x = a, z > 0` — a binding
followed by a plain expression — still counts as one. Matching the expression
clauses needs ast-grep's `condition` field, which this version reports
inconsistently (it does not compose with `any:`, and miscounts on its own). The
arithmetic is written so this degrades to the old behaviour rather than
misfiring, and pure-binding lists, which are the common form, are exact.

## Environment overrides

| variable         | effect                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| `SLOP_RULES_DIR` | use a different rule pack (must contain `VERSION` and one directory per language) |
| `SLOP_AST_GREP`  | path to a specific ast-grep binary                                                |
| `SLOP_JSCPD`     | path to a specific jscpd binary                                                   |

Pin the analyser paths in CI if you need the metric to be reproducible across
runners — a different analyser version can move the number.

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

The verbosity metric has two halves. Clone detection is complete. The rule-flagged half is in progress: the paper's slop rules ([`configs/slop_rules.yaml`][upstream-rules]) are all `language: python`, so each rule must be written again for each language. `rules/VERSION` is `1`, and the pack has 13 rules: 7 for TypeScript and 6 for Swift. [`rules/PORTING.md`](rules/PORTING.md) is the ledger of each rule.

A new rule can only push verbosity up. A delta is not affected, because the base and the head use the same pack in the same run. An absolute threshold is affected, so when a threshold is set, the run fails if `calibratedAtRulePackVersion` is not equal to `rules/VERSION`.

Erosion is complete and does not depend on the language: CC and SLOC carry over directly.

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
