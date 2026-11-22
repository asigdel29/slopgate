#!/bin/sh
# Coverage ratchet: line coverage of the shipped code must not fall below FLOOR.
#
# The number comes from the lcov data, not from bun's text table. The table's
# "All files" row is the mean of the per-file percentages, so a 10-line file
# moves it as much as a 300-line file, and it also counts files that a local
# preload brings in from outside the repository. This script sums hit lines
# over found lines for src/ and bin/ only.
#
# Raise FLOOR when coverage climbs. Never lower it.
set -eu

FLOOR=92.5

rm -rf coverage
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov
line=$(awk -F: '
	/^SF:/ { keep = ($2 ~ /^(src|bin)\//) }
	keep && /^LF:/ { found += $2 }
	keep && /^LH:/ { hit += $2 }
	END { if (found > 0) printf "%.2f", 100 * hit / found }
' coverage/lcov.info)
if [ -z "$line" ]; then
	echo "::error::could not read line coverage from coverage/lcov.info"
	exit 1
fi
echo "Line coverage of src/ and bin/: ${line}% (floor ${FLOOR}%)"
if ! awk -v c="$line" -v f="$FLOOR" 'BEGIN { exit (c + 0 >= f + 0) ? 0 : 1 }'; then
	echo "::error::line coverage ${line}% is below the ${FLOOR}% floor. Add tests; do not lower the floor."
	exit 1
fi
