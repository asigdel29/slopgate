# Rule port ledger

The verbosity metric (Eq. 4) has two halves: duplicated lines and *rule-flagged*
lines. The first is complete. This file tracks the second.

The paper flags verbose constructs with 137 targeted ast-grep rules; the
reference implementation ships
[203 of them](https://github.com/SprocketLab/slop-code-bench/blob/main/configs/slop_rules.yaml),
every one declared `language: python`. None of them run against TypeScript or
Swift as written — the patterns reference Python node kinds
(`list_comprehension`, `boolean_operator`, `dictionary_comprehension`) that do
not exist in either grammar.

So the rules have to be **re-authored per language**, not translated
mechanically. This ledger records what happened to each upstream rule, so
"ported the rule pack" stays an auditable claim rather than an assertion.

## Status

`rules/VERSION` is **0** — no rules yet. Verbosity currently measures
duplication only, which is a correct half of the definition rather than an
approximation of the whole.

## Ledger format

One row per upstream rule id per language:

| status | meaning |
|---|---|
| `ported` | direct analogue; same smell, same shape |
| `adapted` | same smell, different idiom (e.g. `list-map-filter` → `.map().filter()` chains) |
| `n/a` | no idiomatic analogue in this language — reason required |

| upstream id | typescript | swift | notes |
|---|---|---|---|
| _(pending)_ | | | |

## Batches

Rules land in families, each with fixtures and a re-baselined ceiling in every
consuming repo:

1. `redundant-*` / `pointless-*` / `unnecessary-*`
2. `verbose-*`
3. `manual-*` loop reimplementations
4. `defensive-*`
5. `guard-*` / `flat-*` / `exp-*` function-shape heuristics
6. Collection and dict idioms
7. `go-style-*` / `*-result-*` / `*-error-*` error-handling shapes
8. Type probing (`isinstance-*` → `typeof` / `instanceof` / `is` / `as?`)

Batches 5 and 7 are the hard ones: they are multi-node relational rules with
counting thresholds, not single patterns.

Every rule ships with a positive and a negative fixture and a harness assertion
that it fires on exactly the marked lines. Untested rule YAML at this volume is
not trustworthy.

## Why adding rules re-baselines the ceiling

More rules can only flag more lines, so verbosity can only go up when a batch
lands. A ceiling calibrated against an older pack is therefore not comparable to
a newer measurement. The gate hard-fails on that mismatch rather than reporting
a regression that is really just a definition change — see
`calibratedAtRulePackVersion` in the config.
