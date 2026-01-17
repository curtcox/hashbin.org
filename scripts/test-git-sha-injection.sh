#!/bin/bash
# Test the git SHA injection functionality

set -e

echo "=========================================="
echo "Testing Git SHA Injection"
echo "=========================================="

# Create a temporary directory for testing
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# Create test HTML files
mkdir -p "$TEST_DIR/frontend"
cat > "$TEST_DIR/frontend/test1.html" << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Test 1</title></head>
<body>Test content</body>
</html>
EOF

cat > "$TEST_DIR/frontend/test2.html" << 'EOF'
<html>
<head><title>Test 2</title></head>
<body>Test content</body>
</html>
EOF

# Copy the injection script
cp scripts/inject-git-sha.sh "$TEST_DIR/"

# Test 1: Inject with a test SHA
echo ""
echo "=========================================="
echo "TEST: Inject SHA into HTML files"
echo "=========================================="
cd "$TEST_DIR"
TEST_SHA="1234567890abcdef1234567890abcdef12345678"
bash inject-git-sha.sh "$TEST_SHA" > /dev/null

# Verify test1.html has SHA after DOCTYPE
if grep -q "<!DOCTYPE html>" frontend/test1.html && \
   grep -q "<!-- git-sha: $TEST_SHA -->" frontend/test1.html; then
  LINE_NUM=$(grep -n "git-sha:" frontend/test1.html | cut -d: -f1)
  if [ "$LINE_NUM" == "2" ]; then
    echo "✅ PASS: SHA injected after DOCTYPE in test1.html"
  else
    echo "❌ FAIL: SHA not on line 2 in test1.html (found on line $LINE_NUM)"
    exit 1
  fi
else
  echo "❌ FAIL: SHA not found in test1.html"
  exit 1
fi

# Verify test2.html has SHA at beginning (no DOCTYPE)
if grep -q "<!-- git-sha: $TEST_SHA -->" frontend/test2.html; then
  LINE_NUM=$(grep -n "git-sha:" frontend/test2.html | cut -d: -f1)
  if [ "$LINE_NUM" == "1" ]; then
    echo "✅ PASS: SHA injected at beginning in test2.html (no DOCTYPE)"
  else
    echo "❌ FAIL: SHA not on line 1 in test2.html (found on line $LINE_NUM)"
    exit 1
  fi
else
  echo "❌ FAIL: SHA not found in test2.html"
  exit 1
fi

# Test 2: Update existing SHA
echo ""
echo "=========================================="
echo "TEST: Update existing SHA"
echo "=========================================="
NEW_SHA="fedcba0987654321fedcba0987654321fedcba09"
bash inject-git-sha.sh "$NEW_SHA" > /dev/null

# Verify test1.html has new SHA
if grep -q "<!-- git-sha: $NEW_SHA -->" frontend/test1.html; then
  # Make sure old SHA is not present
  if grep -q "<!-- git-sha: $TEST_SHA -->" frontend/test1.html; then
    echo "❌ FAIL: Old SHA still present in test1.html"
    exit 1
  else
    echo "✅ PASS: SHA updated successfully in test1.html"
  fi
else
  echo "❌ FAIL: New SHA not found in test1.html"
  exit 1
fi

# Verify test2.html has new SHA
if grep -q "<!-- git-sha: $NEW_SHA -->" frontend/test2.html; then
  echo "✅ PASS: SHA updated successfully in test2.html"
else
  echo "❌ FAIL: New SHA not found in test2.html"
  exit 1
fi

# Test 3: No duplicate SHAs
echo ""
echo "=========================================="
echo "TEST: No duplicate SHA comments"
echo "=========================================="
SHA_COUNT=$(grep -c "git-sha:" frontend/test1.html)
if [ "$SHA_COUNT" == "1" ]; then
  echo "✅ PASS: Only one SHA comment in test1.html"
else
  echo "❌ FAIL: Found $SHA_COUNT SHA comments in test1.html (expected 1)"
  exit 1
fi

SHA_COUNT=$(grep -c "git-sha:" frontend/test2.html)
if [ "$SHA_COUNT" == "1" ]; then
  echo "✅ PASS: Only one SHA comment in test2.html"
else
  echo "❌ FAIL: Found $SHA_COUNT SHA comments in test2.html (expected 1)"
  exit 1
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total tests: 6"
echo "Passed: 6"
echo "Failed: 0"
echo ""
echo "✅ All git SHA injection tests passed!"
