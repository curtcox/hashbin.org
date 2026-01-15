#!/bin/bash
# Generate a secure 256-bit AES encryption key for API key encryption
# This key should be added as a Cloudflare secret using wrangler

set -e

echo "Generating 256-bit AES encryption key..."
echo ""

# Generate 32 random bytes (256 bits) and encode as base64
# This is cryptographically secure using /dev/urandom
KEY=$(openssl rand -base64 32)

echo "Generated encryption key:"
echo "$KEY"
echo ""
echo "To add this key to your Cloudflare Worker:"
echo ""
echo "For development:"
echo "  echo '$KEY' | wrangler secret put API_KEY_ENCRYPTION_KEY --env development"
echo ""
echo "For production:"
echo "  echo '$KEY' | wrangler secret put API_KEY_ENCRYPTION_KEY --env production"
echo ""
echo "⚠️  IMPORTANT: Save this key securely! Without it, you cannot reveal API keys."
echo "⚠️  If you lose this key, existing API keys can still be used but cannot be revealed."
