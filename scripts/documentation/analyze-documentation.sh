#!/bin/bash
set -e

echo "Analyzing documentation coverage..."

mkdir -p build-reports/documentation

node scripts/documentation/analyze-jsdoc.mjs

if [ ! -f build-reports/documentation/data.json ]; then
  echo '{"summary":{"total_functions":0,"documented_functions":0,"coverage_pct":0},"undocumented":[]}' > build-reports/documentation/data.json
fi

cp build-reports/documentation/data.json build-reports/documentation/summary.json

echo "Documentation analysis complete"
