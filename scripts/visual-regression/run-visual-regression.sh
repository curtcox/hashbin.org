#!/bin/bash
set -e

echo "Running visual regression tests..."

mkdir -p build-reports/visual-regression

node scripts/visual-regression/compare-screenshots.mjs

echo "Visual regression capture complete"
