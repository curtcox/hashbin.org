#!/usr/bin/env bash
# Summarize project status from STATUS.md.
# Usage: scripts/status.sh [--all]
#   default: show open (non-✅) items from every section
#   --all:   show every tracked item

set -euo pipefail

STATUS_FILE="$(cd "$(dirname "$0")/.." && pwd)/STATUS.md"
SHOW_ALL=false
[ "${1:-}" = "--all" ] && SHOW_ALL=true

if [ ! -f "$STATUS_FILE" ]; then
  echo "STATUS.md not found at $STATUS_FILE" >&2
  exit 1
fi

grep -E '^\- \*\*(Last audited|Production|Overall):\*\*' "$STATUS_FILE" | sed 's/\*\*//g'
echo

# Tracked rows look like: | L1 | Item | owner | ⬜ | notes |
awk -v show_all="$SHOW_ALL" -F'|' '
  function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
  /^## / { section = substr($0, 4) }
  /^\| *[LSB][0-9]+ *\|/ {
    id = trim($2); item = trim($3); owner = trim($4); status = trim($5)
    total[section]++
    if (status == "✅") { done[section]++; if (show_all != "true") next }
    if (!(section in printed)) { print "== " section; printed[section] = 1; order[++n] = section }
    printf "  %s %-4s [%s] %s\n", status, id, owner, item
  }
  END {
    print ""
    print "Summary (done / total):"
    split("Launch blockers|Soon after launch|Backlog (not needed for launch)", secs, "|")
    for (i = 1; i <= 3; i++) {
      s = secs[i]
      printf "  %-34s %d / %d\n", s, done[s] + 0, total[s] + 0
    }
    if (total["Launch blockers"] > 0 && done["Launch blockers"] == total["Launch blockers"]) {
      print "\nAll launch blockers complete."
    } else {
      print "\nNot ready to accept customers: launch blockers remain."
    }
  }
' "$STATUS_FILE"
