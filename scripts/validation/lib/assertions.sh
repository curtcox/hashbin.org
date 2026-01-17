#!/bin/bash
# Common assertion functions for validation tests
# This library provides reusable assertion functions for test scripts

# Assert that HTTP status code matches expected value
# Usage: assert_http_status <actual> <expected> <test_id> <description>
assert_http_status() {
  local actual="$1"
  local expected="$2"
  local test_id="$3"
  local description="$4"
  
  if [ "$actual" = "$expected" ]; then
    log_pass "$test_id" "$description" "HTTP $actual"
    return 0
  else
    log_fail "$test_id" "$description" "Expected HTTP $expected, got HTTP $actual"
    return 1
  fi
}

# Assert that response contains a string
# Usage: assert_contains <response> <pattern> <test_id> <description>
assert_contains() {
  local response="$1"
  local pattern="$2"
  local test_id="$3"
  local description="$4"
  
  if echo "$response" | grep -q "$pattern"; then
    log_pass "$test_id" "$description" "Pattern found"
    return 0
  else
    log_fail "$test_id" "$description" "Pattern '$pattern' not found in response"
    return 1
  fi
}

# Assert that JSON field exists and has expected value
# Usage: assert_json_field <json> <field_path> <expected_value> <test_id> <description>
assert_json_field() {
  local json="$1"
  local field_path="$2"
  local expected_value="$3"
  local test_id="$4"
  local description="$5"
  
  if ! command -v jq &> /dev/null; then
    log_fail "$test_id" "$description" "jq not installed"
    return 1
  fi
  
  local actual_value
  actual_value=$(echo "$json" | jq -r "$field_path" 2>/dev/null)
  
  if [ $? -ne 0 ]; then
    log_fail "$test_id" "$description" "Failed to parse JSON or field not found: $field_path"
    return 1
  fi
  
  if [ "$actual_value" = "$expected_value" ]; then
    log_pass "$test_id" "$description" "$field_path = $actual_value"
    return 0
  else
    log_fail "$test_id" "$description" "Expected $field_path = '$expected_value', got '$actual_value'"
    return 1
  fi
}

# Assert that JSON field exists
# Usage: assert_json_field_exists <json> <field_path> <test_id> <description>
assert_json_field_exists() {
  local json="$1"
  local field_path="$2"
  local test_id="$3"
  local description="$4"
  
  if ! command -v jq &> /dev/null; then
    log_fail "$test_id" "$description" "jq not installed"
    return 1
  fi
  
  if echo "$json" | jq -e "$field_path" > /dev/null 2>&1; then
    log_pass "$test_id" "$description" "Field exists: $field_path"
    return 0
  else
    log_fail "$test_id" "$description" "Field not found: $field_path"
    return 1
  fi
}

# Assert that response time is below threshold
# Usage: assert_response_time <time_ms> <threshold_ms> <test_id> <description>
assert_response_time() {
  local time_ms="$1"
  local threshold_ms="$2"
  local test_id="$3"
  local description="$4"
  
  # Convert to integer comparison (remove decimals if present)
  # If no decimal point, the value remains unchanged
  local time_int
  local threshold_int
  
  if echo "$time_ms" | grep -q '\.'; then
    time_int=${time_ms%.*}
  else
    time_int=$time_ms
  fi
  
  if echo "$threshold_ms" | grep -q '\.'; then
    threshold_int=${threshold_ms%.*}
  else
    threshold_int=$threshold_ms
  fi
  
  if [ "$time_int" -le "$threshold_int" ]; then
    log_pass "$test_id" "$description" "${time_ms}ms < ${threshold_ms}ms"
    return 0
  else
    log_fail "$test_id" "$description" "Response time ${time_ms}ms exceeds threshold ${threshold_ms}ms"
    return 1
  fi
}

# Assert that header exists
# Usage: assert_header_exists <headers> <header_name> <test_id> <description>
assert_header_exists() {
  local headers="$1"
  local header_name="$2"
  local test_id="$3"
  local description="$4"
  
  if echo "$headers" | grep -qi "^$header_name:"; then
    log_pass "$test_id" "$description" "Header present: $header_name"
    return 0
  else
    log_fail "$test_id" "$description" "Header not found: $header_name"
    return 1
  fi
}

# Assert that header has expected value
# Usage: assert_header_value <headers> <header_name> <expected_value> <test_id> <description>
assert_header_value() {
  local headers="$1"
  local header_name="$2"
  local expected_value="$3"
  local test_id="$4"
  local description="$5"
  
  local actual_value
  actual_value=$(echo "$headers" | grep -i "^$header_name:" | cut -d':' -f2- | xargs)
  
  if [ -z "$actual_value" ]; then
    log_fail "$test_id" "$description" "Header not found: $header_name"
    return 1
  fi
  
  if echo "$actual_value" | grep -qi "$expected_value"; then
    log_pass "$test_id" "$description" "$header_name contains '$expected_value'"
    return 0
  else
    log_fail "$test_id" "$description" "Expected $header_name to contain '$expected_value', got '$actual_value'"
    return 1
  fi
}

# Assert that value matches regex pattern
# Usage: assert_matches_pattern <value> <pattern> <test_id> <description>
assert_matches_pattern() {
  local value="$1"
  local pattern="$2"
  local test_id="$3"
  local description="$4"
  
  if echo "$value" | grep -qE "$pattern"; then
    log_pass "$test_id" "$description" "Value matches pattern"
    return 0
  else
    log_fail "$test_id" "$description" "Value '$value' does not match pattern '$pattern'"
    return 1
  fi
}

# Assert that two values are equal
# Usage: assert_equal <actual> <expected> <test_id> <description>
assert_equal() {
  local actual="$1"
  local expected="$2"
  local test_id="$3"
  local description="$4"
  
  if [ "$actual" = "$expected" ]; then
    log_pass "$test_id" "$description" "Values match"
    return 0
  else
    log_fail "$test_id" "$description" "Expected '$expected', got '$actual'"
    return 1
  fi
}

# Assert that value is not empty
# Usage: assert_not_empty <value> <test_id> <description>
assert_not_empty() {
  local value="$1"
  local test_id="$2"
  local description="$3"
  
  if [ -n "$value" ]; then
    log_pass "$test_id" "$description" "Value present"
    return 0
  else
    log_fail "$test_id" "$description" "Value is empty"
    return 1
  fi
}
