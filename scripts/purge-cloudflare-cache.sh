#!/bin/bash
#
# Purge Cloudflare cache for hashbin.org
#
# This script uses the Cloudflare API to purge the edge cache.
# It can be run manually or as part of the deployment pipeline.
#
# Required environment variables:
#   CLOUDFLARE_API_TOKEN - API token with Zone.Cache Purge permissions
#   CLOUDFLARE_ZONE_ID   - Zone ID for hashbin.org (found in Cloudflare dashboard)
#
# Usage:
#   ./scripts/purge-cloudflare-cache.sh [--urls "url1,url2,..."]
#
# Options:
#   --urls    Comma-separated list of specific URLs to purge (optional)
#             If not provided, purges the entire cache
#
# Examples:
#   # Purge everything
#   ./scripts/purge-cloudflare-cache.sh
#
#   # Purge specific URLs
#   ./scripts/purge-cloudflare-cache.sh --urls "https://hashbin.org/,https://hashbin.org/upload.html"
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=3
RETRY_DELAY=2

# Parse arguments
PURGE_URLS=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --urls)
            PURGE_URLS="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Validate required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "${RED}ERROR: CLOUDFLARE_API_TOKEN environment variable is not set${NC}"
    echo ""
    echo "To set this variable:"
    echo "  export CLOUDFLARE_API_TOKEN='your-api-token'"
    echo ""
    echo "Your API token needs 'Zone.Cache Purge' permissions."
    echo "Create one at: https://dash.cloudflare.com/profile/api-tokens"
    exit 1
fi

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo -e "${RED}ERROR: CLOUDFLARE_ZONE_ID environment variable is not set${NC}"
    echo ""
    echo "To find your Zone ID:"
    echo "  1. Go to https://dash.cloudflare.com"
    echo "  2. Select your domain (hashbin.org)"
    echo "  3. The Zone ID is shown on the right sidebar under 'API'"
    echo ""
    echo "Then set it:"
    echo "  export CLOUDFLARE_ZONE_ID='your-zone-id'"
    exit 1
fi

# Function to check if API response indicates success
# Handles both "success":true and "success": true (with/without space)
check_api_success() {
    local body="$1"
    # Use grep with regex to handle optional whitespace around the colon
    echo "$body" | grep -qE '"success"\s*:\s*true'
}

# Function to extract error messages from API response
extract_errors() {
    local body="$1"
    # Try to extract errors array content if jq is available
    if command -v jq &> /dev/null; then
        local errors=$(echo "$body" | jq -r '.errors[]?.message // empty' 2>/dev/null)
        if [ -n "$errors" ]; then
            echo "$errors"
            return
        fi
    fi
    # Fallback: show raw errors field
    echo "$body" | grep -oE '"errors"\s*:\s*\[[^]]*\]' || echo "Unable to extract errors"
}

# Function to make API request with retry logic
purge_cache() {
    local data="$1"
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Attempt $attempt of $MAX_RETRIES..."

        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
            -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "$data")

        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)

        if [ "$HTTP_CODE" = "200" ]; then
            # Check if the API returned success
            if check_api_success "$BODY"; then
                # Store response for success message
                LAST_RESPONSE_BODY="$BODY"
                return 0
            else
                echo -e "${YELLOW}HTTP 200 but API reported failure${NC}"
                echo "Errors: $(extract_errors "$BODY")"
            fi
        elif [ "$HTTP_CODE" = "429" ]; then
            # Rate limiting
            echo -e "${YELLOW}Rate limited (HTTP 429). Waiting before retry...${NC}"
            sleep $((RETRY_DELAY * attempt * 2))
            attempt=$((attempt + 1))
            continue
        else
            echo -e "${YELLOW}HTTP $HTTP_CODE - Request failed${NC}"
        fi

        # For non-rate-limit failures, add delay before retry
        if [ "$HTTP_CODE" != "429" ]; then
            sleep $((RETRY_DELAY * attempt))
        fi

        attempt=$((attempt + 1))
    done

    echo ""
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}Failed after $MAX_RETRIES attempts${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "Diagnostic Information:"
    echo "  HTTP Status: $HTTP_CODE"
    echo "  Expected: 200 with success:true"
    echo ""
    echo "API Response:"
    echo "$BODY"
    echo ""
    echo "Troubleshooting:"
    if [ "$HTTP_CODE" = "403" ]; then
        echo "  - Check that CLOUDFLARE_API_TOKEN has 'Zone.Cache Purge' permission"
        echo "  - Verify the token is not expired"
    elif [ "$HTTP_CODE" = "400" ]; then
        echo "  - Check that CLOUDFLARE_ZONE_ID is correct"
        echo "  - Verify the request payload format"
    elif [ "$HTTP_CODE" = "401" ]; then
        echo "  - Check that CLOUDFLARE_API_TOKEN is valid"
        echo "  - Token may have been revoked or expired"
    else
        echo "  - Review the API response above for error details"
        echo "  - Check Cloudflare API status: https://www.cloudflarestatus.com/"
    fi
    return 1
}

echo "=========================================="
echo "Cloudflare Cache Purge"
echo "=========================================="
echo ""

if [ -n "$PURGE_URLS" ]; then
    # Purge specific URLs
    echo "Mode: Selective URL purge"
    echo "URLs to purge:"

    # Convert comma-separated URLs to JSON array
    JSON_URLS=$(echo "$PURGE_URLS" | tr ',' '\n' | while read url; do
        echo "\"$url\""
    done | paste -sd ',' -)

    DATA="{\"files\":[$JSON_URLS]}"

    echo "$PURGE_URLS" | tr ',' '\n' | while read url; do
        echo "  - $url"
    done
    echo ""

    if purge_cache "$DATA"; then
        echo ""
        echo -e "${GREEN}✓ Successfully purged specified URLs${NC}"
        # Extract and display purge ID if jq is available
        if command -v jq &> /dev/null && [ -n "$LAST_RESPONSE_BODY" ]; then
            PURGE_ID=$(echo "$LAST_RESPONSE_BODY" | jq -r '.result.id // empty' 2>/dev/null)
            if [ -n "$PURGE_ID" ]; then
                echo "  Purge ID: $PURGE_ID"
            fi
        fi
    else
        echo -e "${RED}Failed to purge specified URLs${NC}"
        exit 1
    fi
else
    # Purge everything
    echo "Mode: Full cache purge"
    echo -e "${YELLOW}Warning: This will purge ALL cached content for the zone${NC}"
    echo ""

    DATA='{"purge_everything":true}'

    if purge_cache "$DATA"; then
        echo ""
        echo -e "${GREEN}✓ Successfully purged entire cache${NC}"
        # Extract and display purge ID if jq is available
        if command -v jq &> /dev/null && [ -n "$LAST_RESPONSE_BODY" ]; then
            PURGE_ID=$(echo "$LAST_RESPONSE_BODY" | jq -r '.result.id // empty' 2>/dev/null)
            if [ -n "$PURGE_ID" ]; then
                echo "  Purge ID: $PURGE_ID"
            fi
        fi
    else
        echo -e "${RED}Failed to purge cache${NC}"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Cache purge completed successfully${NC}"
echo "=========================================="
echo ""
echo "Note: It may take a few seconds for the purge to propagate"
echo "to all Cloudflare edge locations worldwide."
