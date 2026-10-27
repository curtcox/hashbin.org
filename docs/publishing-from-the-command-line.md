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
  use; it expires after 30 days without one.
- **Retention:** OAuth uploads use your account's default retention, set on the Account page,
  held to the grant's retention cap if it has one (`--max-retention 12`).
- **Your choice:** the approval page lets you uncheck either scope, lower the limit, cap
  retention and make the grant expire after 30, 90 or 365 days. Each approval is a separate grant.

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
- To cut off the whole grant, including tokens on other machines, revoke **Claude Code publisher**
  under authorized apps on your Account page. You can also uncheck a scope or lower the limit there.
- If publishing reports `invalid_grant`, the token expired or was revoked; run `authorize` again.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `HASHBIN_URL` | `https://hashbin.org` | Server to publish to, e.g. `http://localhost:8787` |
| `HASHBIN_CLIENT_ID` | the registered app's ID in the script | Use another registered app |
| `HASHBIN_NO_OPEN` | unset | Print the approval URL without opening a browser |

The production app is registered with the single redirect URI `http://127.0.0.1:8765/callback`.
For local testing, see [Local OAuth](local-development.md#local-oauth).
