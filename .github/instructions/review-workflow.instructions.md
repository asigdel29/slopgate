---
applyTo: "**"
---

# Before you propose a change

## The gate

- Run `bun run check`. It runs the same steps as CI, in the same order, and stops at the first failure.
- Fix a step with its own script, for example `bun run fmt` or `bun run lint:fix`. Then run `bun run check` again.
- The slop step compares with the base branch. CI compares with the merge base of the pull request.

## The review passes

1. Do a code review of the diff. Make the depth of the review agree with the risk. Go deep on security, persistence, money and hot paths.
2. Fix each confirmed finding. When a finding is wrong, write why.
3. Do a simplify pass after the review. It looks for reuse and duplication, not for bugs.
4. Use the simplify pass to keep the slop gate green. Do not raise a ceiling.

## Scope of a change

- Make one issue into one pull request. Give the pull request the issue number.
- Keep a pull request to about 20 files and 200 changed lines. Split larger work into stacked pull requests, each with its own issue.
- Do not open a follow-up issue for polish. Do the polish in the same pull request, or do not do it.
- Write an issue with these sections:
  1. **Description**: the problem and why it matters.
  2. **Acceptance criteria**: checks that a reviewer can do.
  3. **Scope in** and **Scope out**: what the change includes and what it does not.
  4. **Reference**: links to the evidence.

## The pull request

- Open the pull request as a draft.
- Tell what changed and why. Put the reason in the code and in the commit message too.
- Do not rebase or force-push a branch after you push it. Merge the base branch into it.
- Do not merge a pull request with a stale base. Merge the base in and let CI run again.
