#!/usr/bin/env bash
# Common utilities for API tests
# This file should be sourced by test scripts

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_USER="${TEST_USER:-api_test_user_$(date +%s)_$$}"
AUTH_HEADER="Authorization: LocalDev $TEST_USER"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL=0
PASSED=0
FAILED=0

# Temp files for cleanup
declare -a TEMP_FILES

# Cleanup function
cleanup() {
  for temp_file in "${TEMP_FILES[@]}"; do
    if [ -f "$temp_file" ]; then
      rm -f "$temp_file"
    fi
  done
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Helper functions
pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((PASSED++))
  ((TOTAL++))
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  if [ -n "${2:-}" ]; then
    echo -e "  ${RED}Details${NC}: $2"
  fi
  ((FAILED++))
  ((TOTAL++))
}

info() {
  echo -e "${YELLOW}ℹ️  INFO${NC}: $1"
}

debug() {
  if [ "${DEBUG:-0}" = "1" ]; then
    echo -e "${BLUE}🐛 DEBUG${NC}: $1"
  fi
}

# HTTP request helpers
http_get() {
  local url="$1"
  local auth="${2:-}"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  
  if [ -n "$auth" ]; then
    curl -sf -w "\n%{http_code}" -H "$auth" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  else
    curl -sf -w "\n%{http_code}" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  fi
  
  cat "$temp_file"
}

http_post() {
  local url="$1"
  local data="$2"
  local auth="${3:-}"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  
  if [ -n "$auth" ]; then
    curl -sf -w "\n%{http_code}" -X POST -H "$auth" -H "Content-Type: application/json" -d "$data" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  else
    curl -sf -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  fi
  
  cat "$temp_file"
}

http_post_file() {
  local url="$1"
  local file="$2"
  local auth="${3:-}"
  local content_type="${4:-application/octet-stream}"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  
  if [ -n "$auth" ]; then
    curl -sf -w "\n%{http_code}" -X POST -H "$auth" -H "Content-Type: $content_type" --data-binary "@$file" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  else
    curl -sf -w "\n%{http_code}" -X POST -H "Content-Type: $content_type" --data-binary "@$file" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  fi
  
  cat "$temp_file"
}

http_delete() {
  local url="$1"
  local auth="${2:-}"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  
  if [ -n "$auth" ]; then
    curl -sf -w "\n%{http_code}" -X DELETE -H "$auth" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  else
    curl -sf -w "\n%{http_code}" -X DELETE "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  fi
  
  cat "$temp_file"
}

http_put() {
  local url="$1"
  local data="$2"
  local auth="${3:-}"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  
  if [ -n "$auth" ]; then
    curl -sf -w "\n%{http_code}" -X PUT -H "$auth" -H "Content-Type: application/json" -d "$data" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  else
    curl -sf -w "\n%{http_code}" -X PUT -H "Content-Type: application/json" -d "$data" "$BASE_URL$url" > "$temp_file" 2>&1 || echo -e "\n000" > "$temp_file"
  fi
  
  cat "$temp_file"
}

# Extract HTTP status code from response
get_status() {
  local response="$1"
  echo "$response" | tail -n1
}

# Extract body from response (all lines except last)
get_body() {
  local response="$1"
  echo "$response" | head -n-1
}

# JSON parsing helpers (using grep/sed for portability)
json_get() {
  local json="$1"
  local key="$2"
  echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[^,}]*" | sed 's/.*:[[:space:]]*//' | tr -d '"'
}

# Assertion helpers
assert_status() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"
  
  if [ "$actual" = "$expected" ]; then
    pass "$test_name (status: $actual)"
    return 0
  else
    fail "$test_name" "Expected status $expected, got $actual"
    return 1
  fi
}

assert_contains() {
  local text="$1"
  local substring="$2"
  local test_name="$3"
  
  if echo "$text" | grep -q "$substring"; then
    pass "$test_name"
    return 0
  else
    fail "$test_name" "Expected to contain: $substring"
    return 1
  fi
}

assert_not_contains() {
  local text="$1"
  local substring="$2"
  local test_name="$3"
  
  if ! echo "$text" | grep -q "$substring"; then
    pass "$test_name"
    return 0
  else
    fail "$test_name" "Should not contain: $substring"
    return 1
  fi
}

assert_json_field() {
  local json="$1"
  local field="$2"
  local test_name="$3"
  
  if echo "$json" | grep -q "\"$field\""; then
    pass "$test_name"
    return 0
  else
    fail "$test_name" "Missing JSON field: $field"
    return 1
  fi
}

assert_json_value() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local test_name="$4"
  
  local actual
  actual=$(json_get "$json" "$field")
  
  if [ "$actual" = "$expected" ]; then
    pass "$test_name"
    return 0
  else
    fail "$test_name" "Expected $field=$expected, got $actual"
    return 1
  fi
}

# Summary function
print_summary() {
  local suite_name="${1:-Test Suite}"
  
  echo ""
  echo "=========================================="
  echo "$suite_name Summary"
  echo "=========================================="
  echo "Total:  $TOTAL"
  echo "Passed: $PASSED"
  echo "Failed: $FAILED"
  echo "=========================================="
  
  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}❌ Some tests failed${NC}"
    return 1
  fi
}

# Wait for server to be ready
wait_for_server() {
  local max_attempts="${1:-30}"
  local attempt=0
  
  info "Waiting for server at $BASE_URL..."
  
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
      info "Server is ready!"
      return 0
    fi
    
    attempt=$((attempt + 1))
    echo -n "."
    sleep 1
  done
  
  echo ""
  echo -e "${RED}ERROR${NC}: Server failed to start after $max_attempts attempts"
  return 1
}

# Generate random test data
random_string() {
  local length="${1:-16}"
  LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$length"
}

# Create temp file with content
create_temp_file() {
  local content="$1"
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")
  echo -n "$content" > "$temp_file"
  echo "$temp_file"
}
