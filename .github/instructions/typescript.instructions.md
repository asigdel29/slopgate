---
applyTo: "**/*.ts,**/*.tsx"
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript

`tsconfig.json` turns on the options below. Code that works against an option is the finding. Do not turn the option off.

## Compiler options that change how you write code

- **`strict` and `noUncheckedIndexedAccess`.** The type of `xs[i]`, `map[key]` and a destructured element is `T | undefined`. Narrow it with an early `return`, a check, or `??` with a real default. A non-null assertion (`!`) on an index read is a finding.
- **`verbatimModuleSyntax`.** Import a type with `import type { X }`. Split an import that mixes types and values.
- **`isolatedModules`.** Export a type again with `export type { X }`. Do not use `const enum`.
- **`noImplicitOverride` and `noFallthroughCasesInSwitch`.** Mark an overriding member with `override`. End each non-empty `case` with `break`, `return` or `throw`.
- **ESM only.** Do not use `require` or `__dirname`. Use `import.meta`.
- **`types: ["bun"]`.** The runtime is Bun. Use `Bun.file`, `bun:test` and the Web `fetch` types before a Node-shaped API.

## Lint

- `bun run lint` allows zero warnings. A new finding fails CI.
- Do not add an escape hatch: `oxlint-disable`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or `as any`. A policy test fails on each one. Fix the code.
- To turn a rule off, change the lint config and write the reason above the change.

## Types

- Do not use `any`. Give an unknown payload the type `unknown`, and narrow it with a schema or a type predicate before use.
- Do not use `as` on a parsed payload. The cast skips the check that the parse is for.
- Use one object parameter when a function has more than two arguments.
- Give each exported function an explicit return type. The annotation is the contract at the module boundary.
