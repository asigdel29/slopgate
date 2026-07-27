# Rule port ledger

The verbosity metric (Eq. 4) has two halves: duplicated lines and *rule-flagged*
lines. Duplication is complete. This file tracks the second half.

The paper describes 137 targeted ast-grep rules; the reference implementation's
[`configs/slop_rules.yaml`](https://github.com/SprocketLab/slop-code-bench/blob/main/configs/slop_rules.yaml)
ships **214** rule documents, of which 203 carry `category: slop`. All 214 are
declared `language: python`. None run against TypeScript or Swift as
written — the patterns reference Python node kinds (`list_comprehension`,
`boolean_operator`, `dictionary_comprehension`) that neither grammar has. So the
rules are **re-authored per language**, not translated, and this ledger records
what happened to each one so "ported the rule pack" stays auditable.

## Progress

`rules/VERSION` is **1**.

| | slots | share |
|---|---|---|
| Ported | 13 | 3.0% |
| Assessed as not applicable | 9 | 2.1% |
| Not yet done | 406 | 94.9% |
| **Total** | **428** | 214 upstream rules x 2 languages |

Every shipped rule has a fixture under `test/fixtures/rules/<language>/` and is
verified by `test/rulepack-fixtures.test.ts`, which asserts it fires on exactly
the `// SLOP`-marked lines and nowhere else. A rule without a fixture fails the
suite rather than shipping unverified — that harness is why the count above can
be trusted.

## Status values

| value | meaning |
|---|---|
| `` `rule-id` `` | shipped, with a passing fixture |
| pending | not yet authored |
| — | assessed: no idiomatic analogue in this language (reason in Notes) |

## Ledger

| upstream id | typescript | swift | notes |
|---|---|---|---|
| `chained-comparison-opportunity` | pending | pending |  |
| `chained-dict-get` | pending | pending |  |
| `comprehension-used-but-ignored-result` | pending | — | no comprehensions in Swift |
| `duplicated-if-condition` | pending | pending |  |
| `isinstance-return-ladder` | pending | pending |  |
| `manual-min-max` | `manual-min-max` | `manual-min-max` |  |
| `manual-str-join` | pending | pending |  |
| `nested-if-no-else` | pending | pending |  |
| `pointless-lambda-call` | pending | pending |  |
| `repeated-dict-key-assignment` | pending | pending |  |
| `repeated-if-continue` | pending | pending |  |
| `repeated-if-return-error` | pending | pending |  |
| `repeated-validation-calls` | pending | pending |  |
| `ternary-same-value` | `ternary-same-value` | `ternary-same-value` |  |
| `repeated-function-or-chain` | pending | pending |  |
| `value-compare-return-ladder` | pending | pending |  |
| `repetitive-list-append-elif` | pending | pending |  |
| `for-range-len` | pending | pending | `for (let i = 0; i < xs.length; i++)` / `for i in 0..<xs.count` |
| `boolean-return-if-else` | `boolean-return-if-else` | `boolean-return-if-else` |  |
| `json-dumps-then-loads` | pending | pending |  |
| `pointless-bool-cast` | pending | pending |  |
| `consecutive-if-same-variable` | pending | pending |  |
| `nested-attribute-guard-chain` | pending | pending |  |
| `repeated-isinstance-validation` | pending | pending |  |
| `split-magic-index` | pending | pending |  |
| `ternary-none-comparison` | pending | pending |  |
| `redundant-bool-in-condition` | pending | pending |  |
| `deep-dict-access` | pending | pending |  |
| `long-tuple-unpacking` | pending | pending |  |
| `fetchone-none-check` | pending | pending |  |
| `dict-get-zero-default` | pending | pending |  |
| `dict-get-empty-string-default` | pending | pending |  |
| `dict-get-empty-list-default` | pending | pending |  |
| `dict-get-empty-dict-default` | pending | pending |  |
| `check-key-in-dict-keys` | pending | pending |  |
| `json-loads-read` | pending | pending |  |
| `json-roundtrip-dumps-loads` | pending | pending |  |
| `list-dict-keys` | pending | pending |  |
| `listcomp-in-builtin-call` | pending | — | no comprehensions in Swift |
| `unnecessary-list-call` | pending | pending |  |
| `len-as-condition` | — | — | `if len(x)` vs `if x` is a Python idiom; `arr.length > 0` and `!arr.isEmpty` are the idiomatic forms in both targets |
| `list-map-filter` | pending | pending |  |
| `range-len-antipattern` | pending | pending |  |
| `membership-test-list-literal` | pending | pending |  |
| `bool-comparison` | `redundant-bool-comparison` | `redundant-bool-comparison` |  |
| `chained-none-check` | pending | pending |  |
| `dict-get-default-none` | pending | pending |  |
| `empty-init` | pending | pending |  |
| `empty-string-or` | pending | pending |  |
| `explicit-bool-cast` | pending | pending |  |
| `get-then-none-check` | pending | pending |  |
| `guard-return-none` | pending | pending |  |
| `if-none-raise` | pending | pending |  |
| `if-not-guard` | pending | pending |  |
| `if-return-bool-else` | pending | pending |  |
| `int-float-coerce` | pending | pending |  |
| `len-comparison` | pending | pending |  |
| `manual-dict-setdefault` | pending | pending |  |
| `multiple-isinstance-or` | pending | pending |  |
| `range-len-pattern` | pending | pending |  |
| `redundant-bool-ternary` | `redundant-bool-ternary` | `redundant-bool-ternary` |  |
| `redundant-continue` | pending | pending |  |
| `redundant-list-comprehension` | pending | — | no comprehensions in Swift |
| `redundant-none-empty-check` | pending | pending |  |
| `redundant-return-none` | pending | pending |  |
| `set-literal-list` | pending | pending |  |
| `unnecessary-cast-str` | pending | pending |  |
| `unnecessary-elif` | pending | pending |  |
| `unnecessary-else-raise` | pending | pending |  |
| `unnecessary-lambda` | `unnecessary-lambda` | pending |  |
| `verbose-and-return` | pending | pending |  |
| `verbose-none-default` | pending | `redundant-nil-coalescing` |  |
| `verbose-or-return` | pending | pending |  |
| `verbose-dict-key-access` | pending | pending |  |
| `defensive-isinstance-return` | pending | pending |  |
| `defensive-if-return-same` | pending | pending |  |
| `redundant-str-in-fstring` | pending | pending | template literals / string interpolation |
| `return-ternary-or-none` | pending | pending |  |
| `if-pass-else-action` | pending | pending |  |
| `dict-comprehension-from-keys` | pending | — | no comprehensions in Swift |
| `defensive-or-empty` | pending | pending |  |
| `isinstance-bool-exclusion` | pending | pending |  |
| `isinstance-guard-raise` | pending | pending |  |
| `type-equality` | pending | pending |  |
| `dict-str-any` | pending | pending |  |
| `list-any` | pending | pending |  |
| `union-with-any` | pending | pending |  |
| `object-type-annotation` | pending | pending |  |
| `verbose-dict-update` | pending | pending |  |
| `verbose-list-append-loop` | pending | pending |  |
| `verbose-dict-elif-updates` | pending | pending |  |
| `verbose-missing-remove-loop` | pending | pending |  |
| `duplicate-regex-return` | pending | pending |  |
| `tokenizer-char-append-branch` | pending | pending |  |
| `manual-quote-strip` | pending | pending |  |
| `manual-bool-str-parse` | pending | pending |  |
| `manual-float-dot-check` | pending | pending |  |
| `manual-line-continuation-join` | pending | pending |  |
| `init-populate-iterate-dict` | pending | pending |  |
| `init-populate-iterate-list` | pending | pending |  |
| `verbose-type-conversion-chain` | pending | pending |  |
| `double-conversion-int-float` | pending | pending |  |
| `list-comprehension-identity` | pending | — | no comprehensions in Swift; TS analogue is `.map(x => x)` |
| `consecutive-append-calls` | pending | pending |  |
| `verbose-dict-iteration` | pending | pending |  |
| `verbose-string-concat-str` | `redundant-string-concat` | pending |  |
| `verbose-range-zero-start` | pending | pending |  |
| `verbose-string-literal-plus-str` | pending | pending |  |
| `verbose-sorted-list` | pending | pending |  |
| `items-unused-value` | pending | pending |  |
| `items-unused-key` | pending | pending |  |
| `list-extend-from-loop` | pending | pending |  |
| `join-list-literal` | pending | pending |  |
| `join-list-comprehension` | pending | — | no comprehensions in Swift |
| `manual-sum-loop` | pending | pending |  |
| `manual-count-loop` | pending | pending |  |
| `set-add-loop` | pending | pending |  |
| `manual-dict-get-assign` | pending | pending |  |
| `frozenset-list-wrap` | pending | pending |  |
| `list-self-concat` | pending | pending |  |
| `manual-dict-counter-if-else` | pending | pending |  |
| `set-from-list-literal` | pending | pending |  |
| `sorted-dict-keys-wrap` | pending | pending |  |
| `predicate-count-via-sum-one` | pending | pending |  |
| `manual-index-unpack` | pending | pending |  |
| `redundant-guard-same-return` | pending | pending |  |
| `duplicate-wrapper-return-branches` | pending | pending |  |
| `materialize-then-sort-return` | pending | pending |  |
| `sorted-list-comprehension-wrap` | pending | — | no comprehensions in Swift |
| `set-generator-wrap` | pending | pending |  |
| `manual-find-return-none` | pending | pending |  |
| `conditional-same-target-append` | pending | pending |  |
| `conditional-same-target-extend` | pending | pending |  |
| `conditional-same-target-subscript-assign` | pending | pending |  |
| `duplicate-wrapper-assign-branches` | pending | pending |  |
| `sorted-key-indexed-dict-comprehension` | pending | pending |  |
| `duplicate-tuple-return-branches` | pending | pending |  |
| `guard-helper-graveyard-module` | pending | pending |  |
| `defensive-none-passthrough` | pending | pending |  |
| `defensive-falsy-passthrough` | pending | pending |  |
| `defensive-type-probe-default-return` | pending | pending |  |
| `paranoid-inline-type-validation` | pending | pending |  |
| `nullable-forwarding-wrapper` | pending | pending |  |
| `exception-sentinel-helper-function` | pending | pending |  |
| `silent-type-probe-helper-function` | pending | pending |  |
| `none-error-pair-propagation` | pending | pending |  |
| `inline-error-list-pair-return` | pending | pending |  |
| `ad-hoc-result-function` | pending | pending |  |
| `none-error-code-return` | pending | pending |  |
| `none-error-tuple-return` | pending | pending |  |
| `ad-hoc-error-code-parser-function` | pending | pending |  |
| `go-style-error-propagating-function` | pending | pending |  |
| `multi-branch-result-parser-function` | pending | pending |  |
| `nullable-scalar-cast-wrapper` | pending | pending |  |
| `result-parser-function` | pending | pending |  |
| `ad-hoc-result-parser-function` | pending | pending |  |
| `go-style-result-function` | pending | pending |  |
| `ad-hoc-result-tuple-parser` | pending | pending |  |
| `typed-result-parser-function` | pending | pending |  |
| `paranoid-validator-helper-function` | pending | pending |  |
| `guard-rail-helper-function` | pending | pending |  |
| `flat-guard-ladder-helper` | pending | pending |  |
| `three-guard-rail-helper-function` | pending | pending |  |
| `guard-clause-wrapper-function` | pending | pending |  |
| `defensive-guard-rail-function` | pending | pending |  |
| `long-guarded-workflow-function` | pending | pending |  |
| `try-except-sentinel-wrapper` | pending | pending |  |
| `frozen-micro-dataclass` | pending | pending |  |
| `repeated-structured-dict-return` | pending | pending |  |
| `flat-guard-return-helper` | pending | pending |  |
| `flat-try-except-sentinel-helper` | pending | pending |  |
| `flat-isinstance-return-helper` | pending | pending |  |
| `flat-error-return-helper` | pending | pending |  |
| `guard-railed-utility-module` | pending | pending |  |
| `swallow-exception-pass-multi-stmt` | pending | pending |  |
| `defensive-fstring-raise-heavy` | pending | pending |  |
| `defensive-isinstance-raise-heavy` | pending | pending |  |
| `defensive-none-return-heavy` | pending | pending |  |
| `defensive-try-soup-function` | pending | pending |  |
| `defensive-except-exception-heavy` | pending | pending |  |
| `defensive-long-dispatch-ladder` | pending | pending |  |
| `defensive-error-message-repeated-fields` | pending | pending |  |
| `defensive-validator-function` | pending | pending |  |
| `defensive-validator-returnmix` | pending | pending |  |
| `defensive-function-isinstance-heavy` | pending | pending |  |
| `defensive-function-nullable-heavy` | pending | pending |  |
| `type-probe-ladder` | pending | pending |  |
| `multi-none-or-chain` | pending | pending |  |
| `isinstance-return-constructor` | pending | pending |  |
| `wrap-raise-fstring` | pending | pending |  |
| `except-return-static-sentinel` | pending | pending |  |
| `triple-attr-none-default-chain` | pending | pending |  |
| `redundant-coerce-to-str` | pending | pending |  |
| `none-continue-in-loop` | pending | pending |  |
| `parse-and-fallback-exception` | pending | pending |  |
| `return-none-guard-ladder` | pending | pending |  |
| `raise-guard-ladder` | pending | pending |  |
| `function-with-many-type-guards` | pending | pending |  |
| `sentinel-fallback-function` | pending | pending |  |
| `dispatch-by-string-equality` | pending | pending |  |
| `go-style-err-tuple-return` | pending | pending |  |
| `len-arity-raise` | pending | pending |  |
| `raw-guard-module` | pending | pending |  |
| `guard-rail-utility-module` | pending | pending |  |
| `exp-parserish` | pending | pending |  |
| `exp-result-parser` | pending | pending |  |
| `exp-guard-func` | pending | pending |  |
| `exp-guardy-func` | pending | pending |  |
| `exp-size-only` | pending | pending |  |
| `exp-flat-guardy-func` | pending | pending |  |
| `exp-flat-guard-regex` | pending | pending |  |
| `exp-three-error-returns` | pending | pending |  |
| `nullable-subscript-wrapper` | pending | pending |  |
| `nullable-method-wrapper` | pending | pending |  |

## Batches

Remaining rules land in families, each with fixtures:

1. `redundant-*` / `pointless-*` / `unnecessary-*` — **started**
2. `verbose-*`
3. `manual-*` loop reimplementations
4. `defensive-*`
5. `guard-*` / `flat-*` / `exp-*` function-shape heuristics
6. Collection and dict idioms
7. `go-style-*` / `*-result-*` / `*-error-*` error-handling shapes
8. Type probing (`isinstance-*` -> `typeof` / `instanceof` / `is` / `as?`)

Batches 5 and 7 are the hard ones: multi-node relational rules with counting
thresholds, not single patterns.

## Why adding rules does not force a re-baseline

More rules can only flag more lines, so verbosity rises when a batch lands. That
would matter for an absolute ceiling — but the gate compares a merge base
against a head, both measured with the same pack in the same run, so a pack
change cancels out. The `calibratedAtRulePackVersion` guard therefore only
applies when an absolute `thresholds` value is in use.
