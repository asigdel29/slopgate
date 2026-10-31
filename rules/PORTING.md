# Rule port ledger

The verbosity metric (Eq. 4) has two halves: duplicated lines and *rule-flagged*
lines. Duplication is complete. This file tracks the second half.

The paper describes 137 targeted ast-grep rules; the reference implementation's
[`configs/slop_rules.yaml`](https://github.com/SprocketLab/slop-code-bench/blob/main/configs/slop_rules.yaml)
ships **214** rule documents, of which 203 carry `category: slop`. All 214 are
declared `language: python`. None run against TypeScript, Swift or Kotlin as
written — the patterns reference Python node kinds (`list_comprehension`,
`boolean_operator`, `dictionary_comprehension`) that none of these grammars has. So the
rules are **re-authored per language**, not translated, and this ledger records
what happened to each one so "ported the rule pack" stays auditable.

## Progress

`rules/VERSION` is **1**.

| | slots | share |
|---|---|---|
| Ported | 18 | 2.8% |
| Assessed as not applicable | 18 | 2.8% |
| Not yet done | 606 | 94.4% |
| **Total** | **642** | 214 upstream rules x 3 languages |

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

| upstream id | typescript | swift | kotlin | notes |
|---|---|---|---|---|
| `chained-comparison-opportunity` | pending | pending | pending |  |
| `chained-dict-get` | pending | pending | pending |  |
| `comprehension-used-but-ignored-result` | pending | — | — | no comprehensions in Swift or Kotlin |
| `duplicated-if-condition` | pending | pending | pending |  |
| `isinstance-return-ladder` | pending | pending | pending |  |
| `manual-min-max` | `manual-min-max` | `manual-min-max` | `manual-min-max` |  |
| `manual-str-join` | pending | pending | pending |  |
| `nested-if-no-else` | pending | pending | pending |  |
| `pointless-lambda-call` | pending | pending | pending |  |
| `repeated-dict-key-assignment` | pending | pending | pending |  |
| `repeated-if-continue` | pending | pending | pending |  |
| `repeated-if-return-error` | pending | pending | pending |  |
| `repeated-validation-calls` | pending | pending | pending |  |
| `ternary-same-value` | `ternary-same-value` | `ternary-same-value` | `ternary-same-value` |  |
| `repeated-function-or-chain` | pending | pending | pending |  |
| `value-compare-return-ladder` | pending | pending | pending |  |
| `repetitive-list-append-elif` | pending | pending | pending |  |
| `for-range-len` | pending | pending | pending | `for (let i = 0; i < xs.length; i++)` / `for i in 0..<xs.count` |
| `boolean-return-if-else` | `boolean-return-if-else` | `boolean-return-if-else` | `boolean-return-if-else` |  |
| `json-dumps-then-loads` | pending | pending | pending |  |
| `pointless-bool-cast` | pending | pending | pending |  |
| `consecutive-if-same-variable` | pending | pending | pending |  |
| `nested-attribute-guard-chain` | pending | pending | pending |  |
| `repeated-isinstance-validation` | pending | pending | pending |  |
| `split-magic-index` | pending | pending | pending |  |
| `ternary-none-comparison` | pending | pending | pending |  |
| `redundant-bool-in-condition` | pending | pending | pending |  |
| `deep-dict-access` | pending | pending | pending |  |
| `long-tuple-unpacking` | pending | pending | pending |  |
| `fetchone-none-check` | pending | pending | pending |  |
| `dict-get-zero-default` | pending | pending | pending |  |
| `dict-get-empty-string-default` | pending | pending | pending |  |
| `dict-get-empty-list-default` | pending | pending | pending |  |
| `dict-get-empty-dict-default` | pending | pending | pending |  |
| `check-key-in-dict-keys` | pending | pending | pending |  |
| `json-loads-read` | pending | pending | pending |  |
| `json-roundtrip-dumps-loads` | pending | pending | pending |  |
| `list-dict-keys` | pending | pending | pending |  |
| `listcomp-in-builtin-call` | pending | — | — | no comprehensions in Swift or Kotlin |
| `unnecessary-list-call` | pending | pending | pending |  |
| `len-as-condition` | — | — | — | `if len(x)` vs `if x` is a Python idiom; `arr.length > 0` and `!arr.isEmpty` are the idiomatic forms in both targets |
| `list-map-filter` | pending | pending | pending |  |
| `range-len-antipattern` | pending | pending | pending |  |
| `membership-test-list-literal` | pending | pending | pending |  |
| `bool-comparison` | `redundant-bool-comparison` | `redundant-bool-comparison` | — | `nullable == true` is idiomatic Kotlin for a `Boolean?` and the scan has no type information (Kotlin) |
| `chained-none-check` | pending | pending | pending |  |
| `dict-get-default-none` | pending | pending | pending |  |
| `empty-init` | pending | pending | pending |  |
| `empty-string-or` | pending | pending | pending |  |
| `explicit-bool-cast` | pending | pending | pending |  |
| `get-then-none-check` | pending | pending | pending |  |
| `guard-return-none` | pending | pending | pending |  |
| `if-none-raise` | pending | pending | pending |  |
| `if-not-guard` | pending | pending | pending |  |
| `if-return-bool-else` | pending | pending | pending |  |
| `int-float-coerce` | pending | pending | pending |  |
| `len-comparison` | pending | pending | pending |  |
| `manual-dict-setdefault` | pending | pending | pending |  |
| `multiple-isinstance-or` | pending | pending | pending |  |
| `range-len-pattern` | pending | pending | pending |  |
| `redundant-bool-ternary` | `redundant-bool-ternary` | `redundant-bool-ternary` | `redundant-bool-ternary` |  |
| `redundant-continue` | pending | pending | pending |  |
| `redundant-list-comprehension` | pending | — | — | no comprehensions in Swift or Kotlin |
| `redundant-none-empty-check` | pending | pending | pending |  |
| `redundant-return-none` | pending | pending | pending |  |
| `set-literal-list` | pending | pending | pending |  |
| `unnecessary-cast-str` | pending | pending | pending |  |
| `unnecessary-elif` | pending | pending | pending |  |
| `unnecessary-else-raise` | pending | pending | pending |  |
| `unnecessary-lambda` | `unnecessary-lambda` | pending | pending |  |
| `verbose-and-return` | pending | pending | pending |  |
| `verbose-none-default` | pending | `redundant-nil-coalescing` | `redundant-nil-coalescing` |  |
| `verbose-or-return` | pending | pending | pending |  |
| `verbose-dict-key-access` | pending | pending | pending |  |
| `defensive-isinstance-return` | pending | pending | pending |  |
| `defensive-if-return-same` | pending | pending | pending |  |
| `redundant-str-in-fstring` | pending | pending | pending | template literals / string interpolation |
| `return-ternary-or-none` | pending | pending | pending |  |
| `if-pass-else-action` | pending | pending | pending |  |
| `dict-comprehension-from-keys` | pending | — | — | no comprehensions in Swift or Kotlin |
| `defensive-or-empty` | pending | pending | pending |  |
| `isinstance-bool-exclusion` | pending | pending | pending |  |
| `isinstance-guard-raise` | pending | pending | pending |  |
| `type-equality` | pending | pending | pending |  |
| `dict-str-any` | pending | pending | pending |  |
| `list-any` | pending | pending | pending |  |
| `union-with-any` | pending | pending | pending |  |
| `object-type-annotation` | pending | pending | pending |  |
| `verbose-dict-update` | pending | pending | pending |  |
| `verbose-list-append-loop` | pending | pending | pending |  |
| `verbose-dict-elif-updates` | pending | pending | pending |  |
| `verbose-missing-remove-loop` | pending | pending | pending |  |
| `duplicate-regex-return` | pending | pending | pending |  |
| `tokenizer-char-append-branch` | pending | pending | pending |  |
| `manual-quote-strip` | pending | pending | pending |  |
| `manual-bool-str-parse` | pending | pending | pending |  |
| `manual-float-dot-check` | pending | pending | pending |  |
| `manual-line-continuation-join` | pending | pending | pending |  |
| `init-populate-iterate-dict` | pending | pending | pending |  |
| `init-populate-iterate-list` | pending | pending | pending |  |
| `verbose-type-conversion-chain` | pending | pending | pending |  |
| `double-conversion-int-float` | pending | pending | pending |  |
| `list-comprehension-identity` | pending | — | — | no comprehensions in Swift or Kotlin; TS analogue is `.map(x => x)` |
| `consecutive-append-calls` | pending | pending | pending |  |
| `verbose-dict-iteration` | pending | pending | pending |  |
| `verbose-string-concat-str` | `redundant-string-concat` | pending | pending |  |
| `verbose-range-zero-start` | pending | pending | pending |  |
| `verbose-string-literal-plus-str` | pending | pending | pending |  |
| `verbose-sorted-list` | pending | pending | pending |  |
| `items-unused-value` | pending | pending | pending |  |
| `items-unused-key` | pending | pending | pending |  |
| `list-extend-from-loop` | pending | pending | pending |  |
| `join-list-literal` | pending | pending | pending |  |
| `join-list-comprehension` | pending | — | — | no comprehensions in Swift or Kotlin |
| `manual-sum-loop` | pending | pending | pending |  |
| `manual-count-loop` | pending | pending | pending |  |
| `set-add-loop` | pending | pending | pending |  |
| `manual-dict-get-assign` | pending | pending | pending |  |
| `frozenset-list-wrap` | pending | pending | pending |  |
| `list-self-concat` | pending | pending | pending |  |
| `manual-dict-counter-if-else` | pending | pending | pending |  |
| `set-from-list-literal` | pending | pending | pending |  |
| `sorted-dict-keys-wrap` | pending | pending | pending |  |
| `predicate-count-via-sum-one` | pending | pending | pending |  |
| `manual-index-unpack` | pending | pending | pending |  |
| `redundant-guard-same-return` | pending | pending | pending |  |
| `duplicate-wrapper-return-branches` | pending | pending | pending |  |
| `materialize-then-sort-return` | pending | pending | pending |  |
| `sorted-list-comprehension-wrap` | pending | — | — | no comprehensions in Swift or Kotlin |
| `set-generator-wrap` | pending | pending | pending |  |
| `manual-find-return-none` | pending | pending | pending |  |
| `conditional-same-target-append` | pending | pending | pending |  |
| `conditional-same-target-extend` | pending | pending | pending |  |
| `conditional-same-target-subscript-assign` | pending | pending | pending |  |
| `duplicate-wrapper-assign-branches` | pending | pending | pending |  |
| `sorted-key-indexed-dict-comprehension` | pending | pending | pending |  |
| `duplicate-tuple-return-branches` | pending | pending | pending |  |
| `guard-helper-graveyard-module` | pending | pending | pending |  |
| `defensive-none-passthrough` | pending | pending | pending |  |
| `defensive-falsy-passthrough` | pending | pending | pending |  |
| `defensive-type-probe-default-return` | pending | pending | pending |  |
| `paranoid-inline-type-validation` | pending | pending | pending |  |
| `nullable-forwarding-wrapper` | pending | pending | pending |  |
| `exception-sentinel-helper-function` | pending | pending | pending |  |
| `silent-type-probe-helper-function` | pending | pending | pending |  |
| `none-error-pair-propagation` | pending | pending | pending |  |
| `inline-error-list-pair-return` | pending | pending | pending |  |
| `ad-hoc-result-function` | pending | pending | pending |  |
| `none-error-code-return` | pending | pending | pending |  |
| `none-error-tuple-return` | pending | pending | pending |  |
| `ad-hoc-error-code-parser-function` | pending | pending | pending |  |
| `go-style-error-propagating-function` | pending | pending | pending |  |
| `multi-branch-result-parser-function` | pending | pending | pending |  |
| `nullable-scalar-cast-wrapper` | pending | pending | pending |  |
| `result-parser-function` | pending | pending | pending |  |
| `ad-hoc-result-parser-function` | pending | pending | pending |  |
| `go-style-result-function` | pending | pending | pending |  |
| `ad-hoc-result-tuple-parser` | pending | pending | pending |  |
| `typed-result-parser-function` | pending | pending | pending |  |
| `paranoid-validator-helper-function` | pending | pending | pending |  |
| `guard-rail-helper-function` | pending | pending | pending |  |
| `flat-guard-ladder-helper` | pending | pending | pending |  |
| `three-guard-rail-helper-function` | pending | pending | pending |  |
| `guard-clause-wrapper-function` | pending | pending | pending |  |
| `defensive-guard-rail-function` | pending | pending | pending |  |
| `long-guarded-workflow-function` | pending | pending | pending |  |
| `try-except-sentinel-wrapper` | pending | pending | pending |  |
| `frozen-micro-dataclass` | pending | pending | pending |  |
| `repeated-structured-dict-return` | pending | pending | pending |  |
| `flat-guard-return-helper` | pending | pending | pending |  |
| `flat-try-except-sentinel-helper` | pending | pending | pending |  |
| `flat-isinstance-return-helper` | pending | pending | pending |  |
| `flat-error-return-helper` | pending | pending | pending |  |
| `guard-railed-utility-module` | pending | pending | pending |  |
| `swallow-exception-pass-multi-stmt` | pending | pending | pending |  |
| `defensive-fstring-raise-heavy` | pending | pending | pending |  |
| `defensive-isinstance-raise-heavy` | pending | pending | pending |  |
| `defensive-none-return-heavy` | pending | pending | pending |  |
| `defensive-try-soup-function` | pending | pending | pending |  |
| `defensive-except-exception-heavy` | pending | pending | pending |  |
| `defensive-long-dispatch-ladder` | pending | pending | pending |  |
| `defensive-error-message-repeated-fields` | pending | pending | pending |  |
| `defensive-validator-function` | pending | pending | pending |  |
| `defensive-validator-returnmix` | pending | pending | pending |  |
| `defensive-function-isinstance-heavy` | pending | pending | pending |  |
| `defensive-function-nullable-heavy` | pending | pending | pending |  |
| `type-probe-ladder` | pending | pending | pending |  |
| `multi-none-or-chain` | pending | pending | pending |  |
| `isinstance-return-constructor` | pending | pending | pending |  |
| `wrap-raise-fstring` | pending | pending | pending |  |
| `except-return-static-sentinel` | pending | pending | pending |  |
| `triple-attr-none-default-chain` | pending | pending | pending |  |
| `redundant-coerce-to-str` | pending | pending | pending |  |
| `none-continue-in-loop` | pending | pending | pending |  |
| `parse-and-fallback-exception` | pending | pending | pending |  |
| `return-none-guard-ladder` | pending | pending | pending |  |
| `raise-guard-ladder` | pending | pending | pending |  |
| `function-with-many-type-guards` | pending | pending | pending |  |
| `sentinel-fallback-function` | pending | pending | pending |  |
| `dispatch-by-string-equality` | pending | pending | pending |  |
| `go-style-err-tuple-return` | pending | pending | pending |  |
| `len-arity-raise` | pending | pending | pending |  |
| `raw-guard-module` | pending | pending | pending |  |
| `guard-rail-utility-module` | pending | pending | pending |  |
| `exp-parserish` | pending | pending | pending |  |
| `exp-result-parser` | pending | pending | pending |  |
| `exp-guard-func` | pending | pending | pending |  |
| `exp-guardy-func` | pending | pending | pending |  |
| `exp-size-only` | pending | pending | pending |  |
| `exp-flat-guardy-func` | pending | pending | pending |  |
| `exp-flat-guard-regex` | pending | pending | pending |  |
| `exp-three-error-returns` | pending | pending | pending |  |
| `nullable-subscript-wrapper` | pending | pending | pending |  |
| `nullable-method-wrapper` | pending | pending | pending |  |

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
