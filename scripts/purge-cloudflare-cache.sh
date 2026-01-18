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
            if echo "$BODY" | grep -q '"success":true'; then
                return 0
            fi
        fi

        # Check for rate limiting
        if [ "$HTTP_CODE" = "429" ]; then
            echo -e "${YELLOW}Rate limited. Waiting before retry...${NC}"
            sleep $((RETRY_DELAY * attempt * 2))
        else
            sleep $((RETRY_DELAY * attempt))
        fi

        attempt=$((attempt + 1))
    done

    echo -e "${RED}Failed after $MAX_RETRIES attempts${NC}"
    echo "HTTP Status: $HTTP_CODE"
    echo "Response: $BODY"
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
        echo -e "${GREEN}Successfully purged specified URLs${NC}"
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
        echo -e "${GREEN}Successfully purged entire cache${NC}"
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
