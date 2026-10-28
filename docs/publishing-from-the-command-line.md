# Publishing from the command line

`scripts/publish.mjs` publishes files to HashBin through an OAuth grant you approve once in your
browser. It's how agents such as Claude Code publish for you without holding your password or an
all-powerful API key.

- **Scopes:** `content:write` and `balance:read` only. It can't delete content, change your
  account, create API keys, or manage apps.
- **Spending:** capped by the monthly limit you approve. HashBin refuses an upload that would pass
  it (`spending_limit_exceeded`) without charging.
- **Token storage:** the refresh token is kept in the macOS Keychain under the service
  `hashbin-publish:<host>`, never in the repo or in process arguments. HashBin rotates it on every
  use; newly issued refresh tokens expire after seven idle days, and a refresh family lasts at most
  90 days. Access tokens last 15 minutes; grant expiry can end access sooner.
- **Retention:** OAuth uploads use your account's default retention, set on the Account page,
  held to the grant's retention cap if it has one (`--max-retention 12`).
- **Your choice:** the approval page lets you uncheck either scope, lower the limit, cap
  retention and choose a grant expiry of 1, 7, 30, 90 or 365 days, or no grant expiry (refresh limits
  still apply). Each approval is a separate grant.

This script uses raw OAuth bearer tokens, not the hosted browser SDK's DPoP binding. The
Keychain protects storage but does not make a copied token unusable elsewhere. Browser apps
that only save on a click should prefer credential-free `publish()`; see
[browser client safety](browser-client-safety.md). All refreshes require `client_id`; run one
publisher at a time per grant because rotated-token reuse revokes the entire grant.

## Set up (once)

```bash
node scripts/publish.mjs authorize --limit 5 [--max-retention 12]
```

Your browser opens HashBin's approval page showing the scopes and the monthly limit (here $5).
Sign in if asked and approve. The script listens on `http://127.0.0.1:8765/callback`, exchanges the
code (PKCE, no client secret), and saves the refresh token.

## Use

```bash
node scripts/publish.mjs publish path/to/file.org      # prints cid, url, cost_cents, expires_at
node scripts/publish.mjs publish data.bin --type application/octet-stream
node scripts/publish.mjs balance
```

The content type comes from the file extension unless `--type` is given.

## Stop

- `node scripts/publish.mjs forget` revokes the stored refresh token and deletes it from the
  Keychain.
- `forget` also revokes the grant and its refresh family server-side. If the revocation request
  cannot reach HashBin, removing the Keychain entry alone cannot invalidate remote copies.
- From the Account page, revoke **Claude Code publisher**, revoke all app access, or tighten its
  scopes and monthly limit. Separately managed API keys are not affected by revoke-all app access.
- If publishing reports `invalid_grant`, the token expired or was revoked; run `authorize` again.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `HASHBIN_URL` | `https://hashbin.org` | Server to publish to, e.g. `http://localhost:8787` |
| `HASHBIN_CLIENT_ID` | the registered app's ID in the script | Use another registered app |
| `HASHBIN_NO_OPEN` | unset | Print the approval URL without opening a browser |

The production app is registered with the single redirect URI `http://127.0.0.1:8765/callback`.
For local testing, see [Local OAuth](local-development.md#local-oauth).
