#!/bin/bash
# Main validation orchestrator
# Runs all validation tests in the correct order with fail-fast on critical issues

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"
SKIP_AUTH_TESTS="${SKIP_AUTH_TESTS:-false}"
EXPECTED_GIT_SHA="${EXPECTED_GIT_SHA:-}"
VALIDATION_API_KEY="${VALIDATION_API_KEY:-}"

# Export for child scripts
export TARGET_URL
export VERBOSE
export EXPECTED_GIT_SHA
export VALIDATION_API_KEY

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test results tracking
TOTAL_PHASES=0
PASSED_PHASES=0
FAILED_PHASES=0
declare -a PHASE_RESULTS
declare -a PHASE_NAMES
declare -a PHASE_EXIT_CODES

echo ""
echo "=========================================="
echo "HashBin.org Deployment Validation"
echo "=========================================="
echo "Target URL: $TARGET_URL"
echo "Verbose: $VERBOSE"
echo "Skip Auth Tests: $SKIP_AUTH_TESTS"
if [ -n "$EXPECTED_GIT_SHA" ]; then
  echo "Expected Git SHA: $EXPECTED_GIT_SHA"
fi
if [ -n "$VALIDATION_API_KEY" ]; then
  echo "API Key: Provided (***)"
fi
echo "=========================================="
echo ""

# Helper function to run a test phase
run_phase() {
  local phase_name="$1"
  local script_path="$2"
  local critical="${3:-false}"
  
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}Phase: $phase_name${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  
  TOTAL_PHASES=$((TOTAL_PHASES + 1))
  PHASE_NAMES+=("$phase_name")
  
  if [ ! -f "$script_path" ]; then
    echo -e "${RED}ERROR${NC}: Script not found: $script_path"
    FAILED_PHASES=$((FAILED_PHASES + 1))
    PHASE_RESULTS+=("FAIL")
    PHASE_EXIT_CODES+=(1)
    if [ "$critical" = "true" ]; then
      echo ""
      echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      echo -e "${RED}CRITICAL PHASE FAILED - ABORTING${NC}"
      echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      exit 2
    fi
    return 1
  fi
  
  if bash "$script_path"; then
    echo ""
    echo -e "${GREEN}✅ Phase passed: $phase_name${NC}"
    PASSED_PHASES=$((PASSED_PHASES + 1))
    PHASE_RESULTS+=("PASS")
    PHASE_EXIT_CODES+=(0)
  else
    local exit_code=$?
    echo ""
    echo -e "${RED}❌ Phase failed: $phase_name${NC}"
    FAILED_PHASES=$((FAILED_PHASES + 1))
    PHASE_RESULTS+=("FAIL")
    PHASE_EXIT_CODES+=($exit_code)
    
    if [ "$critical" = "true" ]; then
      echo ""
      echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      echo -e "${RED}CRITICAL PHASE FAILED - ABORTING${NC}"
      echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      exit 2
    fi
  fi
}

# Phase 1: Smoke Tests (Critical - fail fast)
run_phase "Phase 1: Infrastructure Smoke Tests" \
  "$SCRIPT_DIR/test-infrastructure.sh" \
  "true"

# Phase 2: Frontend Availability
run_phase "Phase 2: Frontend Availability Tests" \
  "$SCRIPT_DIR/test-frontend.sh" \
  "false"

# Phase 3: Public API Validation
run_phase "Phase 3: Public API Tests" \
  "$SCRIPT_DIR/test-public-api.sh" \
  "false"

# Phase 4: Authentication Boundaries
if [ "$SKIP_AUTH_TESTS" != "true" ]; then
  run_phase "Phase 4: Authentication Boundary Tests" \
    "$SCRIPT_DIR/test-auth-boundaries.sh" \
    "false"
else
  echo ""
  echo -e "${YELLOW}⊘ Skipping Phase 4: Authentication Tests${NC}"
fi

# Phase 5: Security Checks
run_phase "Phase 5: Security Header Tests" \
  "$SCRIPT_DIR/test-security.sh" \
  "false"

# Phase 6: Error Handling
run_phase "Phase 6: Error Handling Tests" \
  "$SCRIPT_DIR/test-error-handling.sh" \
  "false"

# Phase 7: Content Integrity
run_phase "Phase 7: Content Integrity Tests" \
  "$SCRIPT_DIR/test-content-integrity.sh" \
  "false"

# Phase 8: Performance Checks
run_phase "Phase 8: Performance Tests" \
  "$SCRIPT_DIR/test-performance.sh" \
  "false"

# Phase 9: Webhook Validation
run_phase "Phase 9: Webhook Tests" \
  "$SCRIPT_DIR/test-webhooks.sh" \
  "false"

# Phase 10: Edge/Geographic
run_phase "Phase 10: Edge/Geographic Tests" \
  "$SCRIPT_DIR/test-edge.sh" \
  "false"

# Phase 11: API Key Tests (optional)
if [ -n "$VALIDATION_API_KEY" ]; then
  run_phase "Phase 11: API Key Authentication Tests" \
    "$SCRIPT_DIR/test-api-keys.sh" \
    "false"
else
  echo ""
  echo -e "${YELLOW}⊘ Skipping Phase 11: API Key Tests (VALIDATION_API_KEY not provided)${NC}"
fi

# Phase 12: Rate Limiting (optional, read-only)
run_phase "Phase 12: Rate Limiting Tests" \
  "$SCRIPT_DIR/test-rate-limiting.sh" \
  "false"

# Print final summary
echo ""
echo ""
echo "=========================================="
echo "FINAL VALIDATION SUMMARY"
echo "=========================================="
echo "Total Phases:  $TOTAL_PHASES"
echo -e "Passed:        ${GREEN}$PASSED_PHASES${NC}"
echo -e "Failed:        ${RED}$FAILED_PHASES${NC}"
echo ""

if [ $FAILED_PHASES -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ ALL VALIDATION TESTS PASSED${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
else
  echo "Failed phases:"
  for i in "${!PHASE_NAMES[@]}"; do
    if [ "${PHASE_RESULTS[$i]}" = "FAIL" ]; then
      echo -e "  ${RED}❌${NC} ${PHASE_NAMES[$i]} (exit code: ${PHASE_EXIT_CODES[$i]})"
    fi
  done
  echo ""
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ VALIDATION FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi
