---
applyTo: "**/*.test.ts,**/*.test.tsx"
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Tests

## What a test must assert

- Make the assertion able to fail. When the subject is "this item is absent", first assert a control that shows the item can be present. A typo then cannot make the test pass.
- Assert the behavior at the boundary that a caller uses: the return value, the exit code, the output, the stored row. Do not assert the shape of a private intermediate value.
- Write each test name as a claim, for example `"rejects a config with no languages"`.
- Above each `describe`, tell what must hold and what breaks if it does not. Explain the risk, not the mechanics.
- Do not use sleeps for timing. Control the clock, or wait for the event.
- A bug fix comes with the test that fails without the fix.

## Placement

- Use `bun:test`. Put unit tests next to the code or under `test/`, as the repository does now.
- Name integration and end-to-end suites for what they are: `*.integration.test.ts`, `*.e2e.test.ts`.
- Do not share state between suites. Each suite makes its own data and removes it at the end.

## Costs

The slop gate does not measure test files, so a thorough test has no metric cost. Lint, format and typecheck do apply to tests.
