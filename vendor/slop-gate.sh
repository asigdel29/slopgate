#!/bin/sh
# Structural-erosion and verbosity ratchet gate.
#
# Implements the two code-degradation metrics from SlopCodeBench
# (arXiv:2603.24755): erosion, the share of complexity mass concentrated in
# already-complex functions, and verbosity, the fraction of source lines that
# are duplicated or flagged as wasteful.
#
# This is the sibling of scripts/coverage-gate.sh and follows the same
# discipline, with one inversion: coverage has a FLOOR that only rises, these
# have CEILINGS that only fall. Lower is better for both metrics.
#
# The ceilings are NOT in this script — they live in scripts/slop.config.json
# alongside the file globs, because the engine needs them to render its report
# and to check them against the rule-pack version. Raising a ceiling to make a
# red build green defeats the gate; reduce the branching or the duplication
# instead.
#
# Usage:
#   scripts/slop-gate.sh            # measure and gate
#   scripts/slop-gate.sh --report   # measure and print, always exit 0
#   scripts/slop-gate.sh --json     # machine-readable, always exit 0
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

# The engine shells out to ast-grep and jscpd, pinned in scripts/slop/package.json
# and installed into scripts/slop/node_modules — deliberately isolated from this
# repository's own dependency tree. Installing on demand keeps a fresh clone and
# a fresh CI runner working with no separate setup step.
# Run unconditionally. Testing only whether the binaries EXIST would mean a
# version bump in scripts/slop/package.json never triggers a reinstall: the old
# binary is still there and still executable, so local runs would keep measuring
# with the stale analyser while CI (fresh checkout) used the new one — and the
# resulting shift in the number would be reported as a code-quality regression
# on whichever PR happened to be open. `--frozen-lockfile` is a fast no-op when
# the tree already matches the lockfile.
(cd scripts/slop && bun install --frozen-lockfile >/dev/null)

exec bun scripts/slop/bin/slopgate.ts \
	--root "$root" \
	--config "$root/scripts/slop.config.json" \
	"$@"
