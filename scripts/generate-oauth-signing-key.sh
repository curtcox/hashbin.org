#!/bin/bash
# Generate a high-entropy OAuth signing secret for OAUTH_SIGNING_KEY.
# This key is used to sign and verify OAuth JWTs (authorization codes and access tokens).

set -euo pipefail

generate_with_openssl() {
  openssl rand -base64 48 | tr -d '\n'
}

generate_with_node() {
  node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))"
}

if command -v openssl >/dev/null 2>&1; then
  KEY="$(generate_with_openssl)"
elif command -v node >/dev/null 2>&1; then
  KEY="$(generate_with_node)"
else
  echo "Error: neither openssl nor node is available to generate a secure key." >&2
  exit 1
fi

echo "Generated OAUTH_SIGNING_KEY:"
echo "$KEY"
echo ""
echo "Set this in GitHub Actions repository secrets:"
echo "  Name:  OAUTH_SIGNING_KEY"
echo "  Value: (paste the generated value above)"
echo ""
echo "If you need to set it directly in Cloudflare Worker secrets:"
echo "  echo '$KEY' | npx wrangler secret put OAUTH_SIGNING_KEY"
echo ""
echo "Warning: rotating OAUTH_SIGNING_KEY invalidates existing OAuth tokens and authorization codes."
