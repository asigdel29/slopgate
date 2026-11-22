# slopgate

slopgate is a CI gate for two code-degradation metrics: structural erosion and verbosity. It measures TypeScript and Swift with ast-grep and jscpd. It runs on Bun. The default branch is `main`.

## Map

- `bin/slopgate.ts`: the entry point. It sends `init` to `src/init.ts` and all else to `src/cli.ts`, and turns an error into exit code 2.
- `src/cli.ts`: the gate command. It parses the flags, measures and prints. `src/gate.ts`: the verdict, as a pure function.
- `src/config.ts`: the config types, the loader and the shared constants.
- `src/measure.ts`: the measurement pipeline, from source files to metrics.
- `src/callables.ts`, `src/scan.ts`, `src/sources.ts`, `src/clones.ts`: the parts of the pipeline.
- `src/metrics.ts`: the erosion and verbosity formulas.
- `src/hot.ts`: the hot-callable ratchet. `src/git.ts`: the base checkout.
- `src/report.ts`: the text report. `src/init.ts`: the `init` subcommand.
- `src/tools.ts`: where the analyser binaries are. `src/process.ts`: running a tool, and temp folders.
- `structural/`: the ast-grep rules that find callables and decision points.
- `rules/`: the slop rule pack. `rules/VERSION` is its version. `rules/PORTING.md` is the port ledger.
- `examples/`: the slop config and the CI workflow that `init` copies.
- `vendor/slop-gate.sh`, `scripts/vendor.sh`: the files that copy the engine into a repository.
- `.github/instructions/`: the agent rules. `.claude/skills/`: the skills. Both ship to other repositories through `init` and the plugin in `.claude-plugin/`.
- `test/`: the suites. `test/fixtures/` is input to the analysers, not code.

## Commands

| Task                     | Command                                                       |
| ------------------------ | ------------------------------------------------------------- |
| Install                  | `bun install`                                                 |
| Full check               | `bun run check` (one line for each step; `VERBOSE=1` for all) |
| Test all                 | `bun test`                                                    |
| Test one file            | `bun test test/hot.test.ts`                                   |
| Format, lint, typecheck  | `bun run fmt`, `bun run lint`, `bun run typecheck`            |
| Unused code              | `bun run knip`                                                |
| Slop gate against `main` | `bun run slop`                                                |
| Coverage floor           | `bun run coverage`                                            |
| Measure only             | `bun run self`                                                |
| Pre-commit hooks (once)  | `prek install` ([prek](https://github.com/j178/prek))         |

## Rules

- Each new file has a header comment. Each new or changed type and member has a doc comment that tells why.
- Write docs in Simplified Technical English (ASD-STE100).
- Keep the CLI flags, the config keys and the JSON output stable. Repositories that copy the engine call them from CI.
- Do not hand-edit `bun.lock`.
- The analyser pins are in `package.json` only. `scripts/vendor.sh` writes the vendored manifest from them.
- Do not change a rule in `rules/` without its fixture in `test/fixtures/rules/`. Increase `rules/VERSION` when the pack changes what it flags.
- `.claude/skills/fixit` is a copy of a third-party skill under the MIT license. Keep its `LICENSE` file.

## Rules by path

Before you edit a file, read each rule file whose glob matches the file. The globs are in the `applyTo:` line of each file. `.claude/rules/` has a link to each file.

| Rule file in `.github/instructions/` | Applies to                | Topic                                  |
| ------------------------------------ | ------------------------- | -------------------------------------- |
| `comments.instructions.md`           | `.ts`, `.tsx`, `.swift`   | Header comments and doc comments       |
| `review-workflow.instructions.md`    | All files                 | The gate, the review passes and the PR |
| `slop-gate.instructions.md`          | `.ts`, `.tsx`, `.swift`   | Erosion and verbosity limits           |
| `testing.instructions.md`            | `*.test.ts`, `*.test.tsx` | Tests with `bun:test`                  |
| `typescript.instructions.md`         | `.ts`, `.tsx`             | TypeScript baseline and lint           |

A test (`test/policy/agent-rules.test.ts`) fails when a link, a glob list or a row of this table is missing.

## Skills

| Skill           | Use it to                                                            |
| --------------- | -------------------------------------------------------------------- |
| `fixit`         | Untangle a whole codebase: list each problem, redesign, then fix.    |
| `writing-style` | Write PR text, issues, docs and CLI output in plain language.        |
| `release-test`  | Prove that a branch is ready to release, with a GO or NO-GO verdict. |
| `preview-test`  | Prove a PR end to end on a preview environment before merge.         |

## Before you propose a change

1. Run `bun run check`.
2. Do a code review of the diff. Fix each confirmed finding.
3. Do a simplify pass after the review.
4. Open a draft PR against `main`. Do not rebase or force-push a pushed branch.
