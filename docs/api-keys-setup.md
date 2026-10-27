# API Keys Guide

API keys let a script or server act for your account, but only as far as you allow.
Each key holds the scopes you pick and the limits (caveats) you set; everything else is
refused. See [API.md](API.md#authentication) for the full scope and caveat tables.

## Setup

Keys are signed with `DOWNLOAD_TOKEN_SECRET` (the same secret the 256t.us Worker uses), so
it must be configured before keys can be created. No other secret is needed: HashBin
stores only each key's SHA-256 hash and never keeps a recoverable copy.

## Creating a key

Sign in, open **API Keys → Create**, then:

1. Pick what the key may do. Presets cover the common jobs ("Publish only", "Publish +
   read balance", "Downloads only"); nothing is checked by default.
2. Optionally set limits: monthly spending limit, largest upload, longest retention per
   upload or extension, allowed content types, and the only CIDs it may act on.
3. Pick an expiry: 90 days by default, at most a year.

Copy the key when it is shown. It cannot be shown again; if it is lost, revoke it and
create another.

Or with the API, using your signed-in session:

```bash
curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Authorization: Bearer <clerk-jwt>" -H "Content-Type: application/json" \
  -d '{
    "name": "CI publisher",
    "scopes": ["content:write"],
    "caveats": { "max_upload_bytes": 10485760, "max_retention_months": 12, "monthly_spend_limit_cents": 500 },
    "expires_at": "2027-01-31T00:00:00Z"
  }'
```

## Using a key

```bash
curl -X POST "https://hashbin.org/api/content?retention_months=12" \
  -H "Authorization: ApiKey hbk_..." -H "Content-Type: text/plain" --data-binary @notes.txt
```

`X-API-Key: hbk_...` works too. A key never reaches account management (keys, apps,
settings, deposits); those always need your sign-in.

## Narrowing or revoking

On the key's page, uncheck scopes it no longer needs. With the API,
`PATCH /api/auth/apikeys/{key_id}` takes `{ "scopes"?, "caveats"?, "name"? }`; scopes can
only be removed and caveats only tightened. `DELETE /api/auth/apikeys/{key_id}` revokes a
key immediately.

## Errors

| Response | Meaning |
|---|---|
| `401` | Missing, malformed, revoked or expired key |
| `403 insufficient_scope` | The key lacks the scope for this route |
| `403 session_required` | The route is for your own sign-in only |
| `403 caveat_violation` | The request is outside one of the key's limits (the `caveat` field says which) |
| `400 spending_limit_exceeded` | The key's monthly spending limit would be passed |

## Older keys

Keys created before scopes existed (`hb_…`, `hb_live_…`, `hb_test_…`, `hb2_…`) are no
longer accepted and show as revoked. Changing `DOWNLOAD_TOKEN_SECRET` invalidates every
key, signed download link and download session.
