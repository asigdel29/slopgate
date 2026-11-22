#!/bin/sh
# Coverage ratchet: total line coverage must not fall below FLOOR.
#
# bunfig's coverageThreshold is a per-file minimum, and this repo has thin
# files (the CLI entry runs in a subprocess in tests, so it reads low). The
# gate therefore reads the "All files" row of the coverage report.
#
# Raise FLOOR when coverage climbs. Never lower it.
set -eu

FLOOR=69.6

report=$(bun test --coverage 2>&1) || {
	printf '%s\n' "$report"
	exit 1
}
line=$(printf '%s\n' "$report" | grep '^All files' | awk -F'|' '{ gsub(/[^0-9.]/, "", $3); print $3 }')
if [ -z "$line" ]; then
	echo "::error::could not read total line coverage from the report"
	exit 1
fi
echo "Total line coverage: ${line}% (floor ${FLOOR}%)"
if ! awk -v c="$line" -v f="$FLOOR" 'BEGIN { exit (c + 0 >= f + 0) ? 0 : 1 }'; then
	echo "::error::line coverage ${line}% is below the ${FLOOR}% floor. Add tests; do not lower the floor."
	exit 1
fi
