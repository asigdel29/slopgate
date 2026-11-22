---
applyTo: "**/*.ts,**/*.tsx,**/*.swift"
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.swift"
---

# Structural erosion and verbosity (the slop gate)

slopgate fails a change that makes erosion or verbosity worse by more than the limit. Erosion is the share of complexity mass in functions over CC 10. Verbosity is the share of source lines that a rule flags or that a clone duplicates. The configuration is in `slop.config.json`.

## The most important rule

**Do not add a branch to a function that is already complex.** Put the new logic in a new named helper. New code in a new small function makes the number go down.

- With `hotCallables` on, a function over CC 10 fails the change when it is new or when it has more branches than on the base. The size of its effect on the ratio does not matter.
- A `// slopgate-allow: <reason>` comment on the line above a function exempts that function. Use it only for a reviewed exception. Do not use it to make a build pass.
- `maxDelta` in `slop.config.json` is the limit for each change.
- **Do not raise a limit or a ceiling to make a failed build pass.** Remove the branches or the duplication. A diff that changes the numbers without a reason in `$comment` is a finding.
- When the measured value falls, lower the ceiling to the new value. The ceilings only go down.

## Line patterns that the rule pack flags

Do not write these. When you change code near one, rewrite it.

| Do not write                                   | Write                     |
| ---------------------------------------------- | ------------------------- |
| `if (c) { return true } else { return false }` | `return c`                |
| `c ? true : false`                             | `c`                       |
| `x === true` / `x !== false`                   | `x`                       |
| `a > b ? a : b`                                | `Math.max(a, b)`          |
| `"" + x`                                       | `String(x)` or a template |
| `c ? a : a`                                    | `a` (one branch is dead)  |
| `(x) => f(x)`                                  | `f`                       |

A third block that is almost the same as two others is a helper. Do not paste it.

## What the gate does not measure

Test files and files outside the `include` globs of `slop.config.json` are not measured. Do not change the globs to make a build pass.
