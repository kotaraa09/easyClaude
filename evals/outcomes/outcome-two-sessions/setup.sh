# Day two starts where a day-one run left off. scripts/bench.mjs runs
# outcome-two-sessions-day1 first and saves each run's project under
# evals/results/seeds/outcome-two-sessions/<n>/. Each run of this case claims one of them
# by creating "<n>.claimed", so parallel runs never start from the same day one. It used to
# rename the folder instead, and on Windows two runs both got past the rename: a real run
# failed with the folder gone from under it. Creating a directory succeeds for exactly one
# caller, on every filesystem.
#
# Nothing else is copied: no conversation, no memory outside the project. What day two
# knows is what day one wrote down.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../../.." && pwd)"
seeds="$plugin/evals/results/seeds/outcome-two-sessions"

for seed in "$seeds"/*; do
  case "$seed" in *.claimed) continue ;; esac
  [ -d "$seed" ] || continue
  if mkdir "$seed.claimed" 2>/dev/null; then
    cp -R "$seed/." .
    exit 0
  fi
done
echo "No day-one project left in $seeds. Run this case through scripts/bench.mjs, which runs day one first." >&2
exit 1
