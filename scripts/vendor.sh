#!/bin/sh
# Vendor slopgate into a repository that wants the gate without a network
# dependency in CI.
#
#   scripts/vendor.sh /path/to/repo
#
# Copies the engine, the structural rules and the rule pack into
# <repo>/scripts/slop/, and records the upstream commit in VENDOR.md so a stale
# copy is identifiable. It does NOT overwrite <repo>/scripts/slop.config.json —
# that file is the repository's own calibration and must survive re-vendoring.
#
# Re-run this after every upstream change; there is no automatic drift check,
# because the two repositories cannot see each other.
set -eu

target=${1:-}
if [ -z "$target" ]; then
	echo "usage: scripts/vendor.sh /path/to/repo" >&2
	exit 1
fi
if [ ! -d "$target" ]; then
	echo "no such directory: $target" >&2
	exit 1
fi

here=$(cd "$(dirname "$0")/.." && pwd)
dest="$target/scripts/slop"

# The vendored tree is replaced wholesale so a deleted upstream file cannot
# linger. slop.config.json lives outside this directory precisely so it is not
# caught by this.
rm -rf "$dest"
mkdir -p "$dest"

cp -R "$here/bin" "$dest/bin"
cp -R "$here/src" "$dest/src"
cp -R "$here/structural" "$dest/structural"
cp -R "$here/rules" "$dest/rules"
cp "$here/vendor/package.json" "$dest/package.json"

# The wrapper is upstream-owned too, so it is refreshed on every vendor.
cp "$here/vendor/slop-gate.sh" "$target/scripts/slop-gate.sh"
chmod +x "$target/scripts/slop-gate.sh"

# The config is the repository's own calibration: seed it once, never clobber it.
if [ ! -f "$target/scripts/slop.config.json" ]; then
	cp "$here/examples/slop.config.json" "$target/scripts/slop.config.json"
	echo "seeded scripts/slop.config.json — edit the globs, then calibrate with --report"
fi

# Produce the lockfile the gate installs from, so CI can use --frozen-lockfile.
(cd "$dest" && bun install >/dev/null 2>&1) || {
	echo "warning: 'bun install' in $dest failed; run it by hand before committing" >&2
}

revision=$(cd "$here" && git rev-parse HEAD 2>/dev/null || echo "unknown")
version=$(cd "$here" && git describe --tags --always 2>/dev/null || echo "unknown")

cat > "$dest/VENDOR.md" <<EOF
# Vendored — do not edit here

This directory is a copy of [slopgate](https://github.com/asigdel29/slopgate),
which implements the code-degradation metrics from
[SlopCodeBench (arXiv:2603.24755)](https://arxiv.org/abs/2603.24755).

| | |
|---|---|
| Upstream revision | \`$revision\` |
| Upstream version  | \`$version\` |

**Do not edit these files.** Change them upstream, then re-vendor by cloning
slopgate and running its \`scripts/vendor.sh\` against this repository:

\`\`\`sh
git clone https://github.com/asigdel29/slopgate
cd slopgate && git checkout $revision
./scripts/vendor.sh /path/to/this/repo
\`\`\`

That script lives in the slopgate repository, not here. The engine's tests live
upstream and run in its CI; what runs here is the gate itself.

Repository-specific settings are **not** in this directory — they live in
\`scripts/slop.config.json\`, which re-vendoring deliberately leaves alone.
EOF

echo "vendored slopgate@$revision into $dest"
echo "next: cd $dest && bun install"
