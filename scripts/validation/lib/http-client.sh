#!/bin/bash
# HTTP request wrapper functions for validation tests
# This library provides curl-based HTTP client functions

# Make HTTP GET request
# Usage: http_get <url> [headers...]
# Returns: Response body
# Sets: HTTP_STATUS, HTTP_HEADERS, HTTP_TIME_MS
http_get() {
  local url="$1"
  shift
  local headers=("$@")
  
  local temp_file=$(mktemp)
  local header_file=$(mktemp)
  local status_file=$(mktemp)
  
  local header_args=()
  for header in "${headers[@]}"; do
    header_args+=(-H "$header")
  done
  
  curl -s --max-time 15 -w "%{http_code} %{time_total}" -o "$temp_file" -D "$header_file" \
    "${header_args[@]}" "$url" > "$status_file" 2>/dev/null || echo "000 0" > "$status_file"
  
  HTTP_TIME_MS=$(awk '{printf "%.0f", $2 * 1000}' "$status_file")
  
  HTTP_STATUS=$(awk '{print $1}' "$status_file")
  HTTP_BODY=$(cat "$temp_file")
  HTTP_HEADERS=$(cat "$header_file")
  
  rm -f "$temp_file" "$header_file" "$status_file"
  
  echo "$HTTP_BODY"
}

# Make HTTP POST request
# Usage: http_post <url> <data> [headers...]
# Returns: Response body
# Sets: HTTP_STATUS, HTTP_HEADERS, HTTP_TIME_MS
http_post() {
  local url="$1"
  local data="$2"
  shift 2
  local headers=("$@")
  
  local temp_file=$(mktemp)
  local header_file=$(mktemp)
  local status_file=$(mktemp)
  
  local header_args=()
  for header in "${headers[@]}"; do
    header_args+=(-H "$header")
  done
  
  curl -s --max-time 15 -w "%{http_code} %{time_total}" -o "$temp_file" -D "$header_file" \
    -X POST "${header_args[@]}" -d "$data" "$url" > "$status_file" 2>/dev/null || echo "000 0" > "$status_file"
  
  HTTP_TIME_MS=$(awk '{printf "%.0f", $2 * 1000}' "$status_file")
  
  HTTP_STATUS=$(awk '{print $1}' "$status_file")
  HTTP_BODY=$(cat "$temp_file")
  HTTP_HEADERS=$(cat "$header_file")
  
  rm -f "$temp_file" "$header_file" "$status_file"
  
  echo "$HTTP_BODY"
}

# Make HTTP HEAD request
# Usage: http_head <url> [headers...]
# Returns: Empty (HEAD has no body)
# Sets: HTTP_STATUS, HTTP_HEADERS, HTTP_TIME_MS
http_head() {
  local url="$1"
  shift
  local headers=("$@")
  
  local header_file=$(mktemp)
  local status_file=$(mktemp)
  
  local header_args=()
  for header in "${headers[@]}"; do
    header_args+=(-H "$header")
  done
  
  curl -s --max-time 15 -w "%{http_code} %{time_total}" -I -o /dev/null -D "$header_file" \
    "${header_args[@]}" "$url" > "$status_file" 2>/dev/null || echo "000 0" > "$status_file"
  
  HTTP_TIME_MS=$(awk '{printf "%.0f", $2 * 1000}' "$status_file")
  
  HTTP_STATUS=$(awk '{print $1}' "$status_file")
  HTTP_BODY=""
  HTTP_HEADERS=$(cat "$header_file")
  
  rm -f "$header_file" "$status_file"
}

# Make HTTP DELETE request
# Usage: http_delete <url> [headers...]
# Returns: Response body
# Sets: HTTP_STATUS, HTTP_HEADERS, HTTP_TIME_MS
http_delete() {
  local url="$1"
  shift
  local headers=("$@")
  
  local temp_file=$(mktemp)
  local header_file=$(mktemp)
  local status_file=$(mktemp)
  
  local header_args=()
  for header in "${headers[@]}"; do
    header_args+=(-H "$header")
  done
  
  curl -s --max-time 15 -w "%{http_code} %{time_total}" -o "$temp_file" -D "$header_file" \
    -X DELETE "${header_args[@]}" "$url" > "$status_file" 2>/dev/null || echo "000 0" > "$status_file"
  
  HTTP_TIME_MS=$(awk '{printf "%.0f", $2 * 1000}' "$status_file")
  
  HTTP_STATUS=$(awk '{print $1}' "$status_file")
  HTTP_BODY=$(cat "$temp_file")
  HTTP_HEADERS=$(cat "$header_file")
  
  rm -f "$temp_file" "$header_file" "$status_file"
  
  echo "$HTTP_BODY"
}

# Make HTTP PUT request
# Usage: http_put <url> <data> [headers...]
# Returns: Response body
# Sets: HTTP_STATUS, HTTP_HEADERS, HTTP_TIME_MS
http_put() {
  local url="$1"
  local data="$2"
  shift 2
  local headers=("$@")
  
  local temp_file=$(mktemp)
  local header_file=$(mktemp)
  local status_file=$(mktemp)
  
  local header_args=()
  for header in "${headers[@]}"; do
    header_args+=(-H "$header")
  done
  
  curl -s --max-time 15 -w "%{http_code} %{time_total}" -o "$temp_file" -D "$header_file" \
    -X PUT "${header_args[@]}" -d "$data" "$url" > "$status_file" 2>/dev/null || echo "000 0" > "$status_file"
  
  HTTP_TIME_MS=$(awk '{printf "%.0f", $2 * 1000}' "$status_file")
  
  HTTP_STATUS=$(awk '{print $1}' "$status_file")
  HTTP_BODY=$(cat "$temp_file")
  HTTP_HEADERS=$(cat "$header_file")
  
  rm -f "$temp_file" "$header_file" "$status_file"
  
  echo "$HTTP_BODY"
}

# Check if URL is accessible (simple connectivity test)
# Usage: http_check <url>
# Returns: 0 if accessible, 1 otherwise
http_check() {
  local url="$1"
  
  if curl -s --max-time 15 -f -o /dev/null -w "%{http_code}" "$url" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Follow redirect and get final URL
# Usage: http_follow_redirect <url>
# Returns: Final URL after redirects
# Sets: HTTP_STATUS of final response
http_follow_redirect() {
  local url="$1"
  
  local final_url
  final_url=$(curl -s --max-time 15 --max-redirs 5 -L -w "%{url_effective}" -o /dev/null "$url" 2>/dev/null)
  
  echo "$final_url"
}

# Check if response is valid JSON
# Usage: is_json <response>
# Returns: 0 if valid JSON, 1 otherwise
is_json() {
  local response="$1"
  
  if command -v jq &> /dev/null; then
    echo "$response" | jq empty > /dev/null 2>&1
    return $?
  else
    # Fallback: Basic JSON structure check
    if echo "$response" | grep -qE '^\s*(\{.*\}|\[.*\])\s*$'; then
      return 0
    else
      return 1
    fi
  fi
}

# Extract header value
# Usage: get_header <header_name>
# Uses: HTTP_HEADERS global variable
# Returns: Header value
get_header() {
  local header_name="$1"
  
  echo "$HTTP_HEADERS" | grep -i "^$header_name:" | cut -d':' -f2- | tr -d '\r' | xargs
}

# Match actual JavaScript stack frames, not ordinary wording such as "at most".
has_stack_trace() {
  printf '%s' "$1" | jq -e 'has("stack") or has("trace")' > /dev/null 2>&1 ||
    printf '%s' "$1" | jq -r '.. | strings' 2>/dev/null |
    grep -qE '^[[:space:]]+at[[:space:]]|\.js:[0-9]+:[0-9]+'
}
