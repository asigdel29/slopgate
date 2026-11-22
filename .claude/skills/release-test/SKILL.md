---
name: release-test
description: Run a GO or NO-GO release pass that proves a branch or a build is ready to promote or release, in any repo. The pass runs the repo's gate, the unit tests, the end-to-end tests, a latency comparison of base and head, and a regression diff. It then gives one verdict for each component, with evidence. Use it when someone asks for a release check, a regression pass, a smoke pass or a latency pass before a release. Also use it when someone asks "is this ready to ship", "is this ready to promote" or "can we release this". Use it when a PR needs a release-test status.
---

# Release test

This skill gives one GO or NO-GO verdict for each component of a repo. The verdict applies to one head commit only. The pass works for a CLI, a library, a server or an app.

The pass does not merge, approve or release anything. The owner does that after the pass.

## Terms

- **Base:** the commit that users run now. Usually it is the last release tag or the tip of the release branch.
- **Head:** the commit that you test.
- **Component:** a part of the repo that ships on its own, for example a CLI, a server or a client app. A repo with one artifact has one component.
- **Check:** one item of the phases, for example the gate or the latency comparison.
- **Run directory:** the folder that holds the evidence of one pass. Keep it outside git, for example `$TMPDIR/release-test/<run>/`. This document calls it `$RUN_DIR`.

Each check gets one of these results:

- `PASS`: the check ran and met its rule.
- `FAIL`: the check ran and did not meet its rule.
- `SKIPPED`: a required check did not run. Give the reason.
- `N/A`: the check does not apply to the component. Give the reason.

## Rules

- Do not write `PASS` or `GO` for a check that did not run. Write `SKIPPED` and the reason.
- A component is `GO` only when each required check is `PASS`. Phases 2 to 6 are required. Phase 7 is required when the component has a client UI.
- A `NO-GO` names the check that failed. It also gives the shortest fix.
- A `NO-GO` for one component does not change the verdict of a different component.
- The verdict applies only to the head SHA. A new push to the branch makes the verdict old. Run the pass again on the new head.
- Never run the pass against production. Use test accounts and test data only.
- Never print a token or a secret. Keep tokens in environment variables or in a file with mode 0600.
- Write the report with the rules of the `writing-style` skill.

## Phases

### 1. Identify base and head

1. Fetch the remote: `git fetch --tags origin`.
2. Record the head SHA: `git rev-parse HEAD > "$RUN_DIR/sha-head"`.
3. Find the base. Use the last release tag or the tip of the release branch.
4. Record the base SHA in `$RUN_DIR/sha-base`.
5. List the changes: `git log --oneline <base>..<head>` and `git diff --stat <base>..<head>`.
6. Record each component that changed and the main risk of each change.
7. Make the base worktree: `git worktree add "$RUN_DIR/base" <base-sha>`.
8. Make the head worktree: `git worktree add "$RUN_DIR/head" <head-sha>`.

The two worktrees let the base build and the head build exist at the same time.

### 2. Run the repo's gate

The gate is the set of checks that CI runs on each change. Find it in the CI workflow files, the package scripts, the Makefile or the contributor guide.

1. Run each gate command in the head worktree, with the same flags as CI.
2. Include each check that the repo has: lint, format, typecheck, dead code, slop or erosion, and tests.
3. Save the output of each command in `logs/gate-<name>.txt`.
4. Record `PASS` only when each command exits with code 0.

Examples of gate commands are `npm run lint`, `tsc --noEmit`, `bun run check` and `make check`.

### 3. Run the unit tests

1. Run the full unit test suite in the head worktree.
2. If the tests use a database, give them a private test database. Then no other process can change the results.
3. Record the number of passed, failed and skipped tests.
4. Run the same suite in the base worktree.
5. Compare the two sets of numbers.

A test that runs at base and does not run at head needs an explanation. Name it in the report.

### 4. Run the end-to-end tests

Use the real entry point. Build the artifact the same way that the release builds it.

- **CLI:** run the built binary or the package entry with real arguments and real files. Check the exit code, stdout and stderr.
- **Server:** start the server on a test port with a test database. Send real HTTP requests. Check the status codes and the bodies.
- **App:** use phase 7.

If the repo has its own end-to-end suite, run it. Then do one manual run of the main path that the diff changes.

A server has two more checks:

- **API contract:** if the repo has an API spec such as an OpenAPI file, read the base copy with `git show <base>:<path>`. Compare it with the head copy in a tool that finds incompatible changes, for example `oasdiff breaking`. An incompatible change is `FAIL`, unless the PR says that it is intended.
- **Route sweep:** send one request to each route as a test account that no other check uses. The sweep writes data, so it must not change the accounts of other checks. Each 5xx answer is `FAIL`.

### 5. Measure the latency

Compare the time of the main operation at base and at head. The main operation is the command or the request that users wait for.

1. Build base and head in their worktrees.
2. Use the same input, the same machine and the same load for the two sides.
3. Delete old sample files in `latency/`. Samples from an earlier run change the result.
4. Do one warm-up run on each side. Do not record it.
5. Alternate the runs: base, head, base, head. Drift from heat, caches or the network then has the same effect on the two sides.
6. Do 10 or more timed runs on each side. Use 20 or more when the difference is small.
7. Write each time in milliseconds to `latency/base.txt` or `latency/head.txt`, one value on each line.

Calculate these values:

- The mean and the number of runs (n) of each side.
- The difference of the means, head minus base, in milliseconds and in percent of the base mean.
- A 95% interval for that difference. Use a bootstrap percentile interval with 10,000 resamples, or a Welch t interval.
- A test of the difference. Use the Mann-Whitney U test or the Welch t-test.

Give each result in this form. Always name the test.

```text
<operation>: head - base = +12 ms (+4.1%), 95% CI [-3, +27] ms, n = 20 each, bootstrap of the mean; Mann-Whitney U p = 0.18
```

The check is `FAIL` when the full 95% interval is above +10% of the base mean. The owner can set a different limit before the pass.

### 6. Run the regression diff

1. Collect a set of inputs. Use test fixtures, sample projects or recorded requests.
2. Run base on each input. Save each output in `regression/base/`.
3. Run head on the same inputs. Save each output in `regression/head/`.
4. Remove the fields that change on each run: timestamps, durations, absolute paths and random IDs.
5. Compare the two folders: `diff -ru regression/base regression/head`.
6. Mark each difference as intended or as a regression.

A difference is intended only when the PR or the changelog names it. A difference without an explanation is `FAIL`.

### 7. Optional: run the client on devices

Do this phase only when the component ships a client UI, for example a mobile app or a desktop app. For other components, write `N/A`.

1. Build the client in a configuration that connects to a test backend, not to production.
2. Start one emulator or simulator at a time. Two devices at the same time can overload the host.
3. Run the main flows that the diff changes on each platform that the client targets. Examples are the Android emulator and the iOS simulator.
4. Take tap points from the accessibility element tree, not from screenshot pixels.
5. Save one screenshot of the pass state of each flow in `shots/<flow>.png`.
6. Record `PASS`, `FAIL` or `SKIPPED` for each flow, with the reason.
7. Stop each device that you started.

### 8. Write the verdict

Write `verdict.md` in the run directory. Put the base SHA and the head SHA at the top. Then give one row for each component, as in this example:

| Component | Head SHA  | Verdict | Checks                                                                                                       | Evidence                           |
| --------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `cli`     | `a1b2c3d` | GO      | gate PASS, unit 212/212, e2e 14/14, latency +1.2% [-0.8%, +3.1%] (bootstrap), regression 0 diffs, client N/A | `logs/`, `latency/`, `regression/` |
| `server`  | `a1b2c3d` | NO-GO   | e2e FAIL: `POST /items` returns 500 on an empty body. Fix: validate the body before the insert.              | `logs/e2e-server.txt`              |

The evidence column holds a link or a path for each row. Under the table, list each `SKIPPED` check and each `N/A` check with its reason.

### 9. Optional: post a commit status

This phase posts the verdict as a commit status on the head SHA of the PR.

1. Read the current head of the PR: `gh pr view <number> --json headRefOid --jq .headRefOid`.
2. Compare it with `sha-head`.
3. If they are different, do not post. The branch changed after the pass, so the verdict is old.
4. If they are the same, post the status:

```bash
gh api "repos/{owner}/{repo}/statuses/$(cat "$RUN_DIR/sha-head")" \
  -f state=success -f context=release-test \
  -f description="GO $(date -u +%F)" -f target_url=<report link>
```

`gh` fills `{owner}` and `{repo}` from the current repo. Use `state=success` for GO and `state=failure` for NO-GO. If the repo has more than one component, use one context for each component, for example `release-test/server`.

## Evidence

The run directory holds these items:

- `sha-base` and `sha-head`: the two SHAs of the pass.
- `logs/`: the output of each gate, test and end-to-end command.
- `latency/`: `base.txt`, `head.txt` and the calculated result.
- `regression/`: the base outputs, the head outputs and the diff.
- `shots/`: the screenshots of the client flows (phase 7 only).
- `verdict.md`: the verdict table.

When the pass ends, remove the two worktrees with `git worktree remove`.

## Common mistakes

| Mistake                                                    | Correct way                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Compare latency samples from two different sessions        | Alternate base and head in one session, on one machine              |
| Keep latency samples from an earlier run                   | Delete the old sample files before you start                        |
| Post a status after a new push to the branch               | Compare the PR head with `sha-head` first                           |
| Use the accounts of other checks for the route sweep       | Give the route sweep its own test account                           |
| Count a gap in the test configuration as a code regression | Compare the test configuration with the release configuration first |
| Write `PASS` for a check that did not run                  | Write `SKIPPED` and the reason                                      |
| Start two emulators or simulators at the same time         | Start one device at a time                                          |
