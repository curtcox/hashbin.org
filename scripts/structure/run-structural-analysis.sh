#!/bin/bash
set -e

echo "Running structural analysis..."

mkdir -p build-reports/structure

npx madge src --json > build-reports/structure/dependencies.json 2>/dev/null || echo "{}" > build-reports/structure/dependencies.json
npx madge src --circular --json > build-reports/structure/circular.json 2>/dev/null || echo "[]" > build-reports/structure/circular.json
npx madge src --orphans --json > build-reports/structure/orphans.json 2>/dev/null || echo "[]" > build-reports/structure/orphans.json

cat > build-reports/structure/data.json << EOF
{
  "dependencies": $(cat build-reports/structure/dependencies.json),
  "circular": $(cat build-reports/structure/circular.json),
  "orphans": $(cat build-reports/structure/orphans.json)
}
EOF

CIRCULAR_COUNT=$(jq '.circular | length' build-reports/structure/data.json 2>/dev/null || echo "0")
ORPHAN_COUNT=$(jq '.orphans | length' build-reports/structure/data.json 2>/dev/null || echo "0")

cat > build-reports/structure/summary.json << EOF
{
  "circular_dependencies": ${CIRCULAR_COUNT:-0},
  "orphan_files": ${ORPHAN_COUNT:-0}
}
EOF

echo "Structural analysis complete: ${CIRCULAR_COUNT:-0} circular dependencies, ${ORPHAN_COUNT:-0} orphans"
