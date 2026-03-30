# Third-Party Publishing API

## Goal

Allow third-party web apps to publish 256t content to hashbin.org on behalf of users who have hashbin.org accounts with adequate funds. Third-party apps can only publish — no deletion or other write operations are exposed.

## Background

hashbin.org currently supports programmatic access via API keys (`hb_<32-alphanumeric>`), but this requires users to manually create keys in the dashboard and paste them into third-party apps. For a seamless third-party integration experience, we need a proper OAuth 2.0 authorization flow.

## Decisions

- **Authorization protocol:** OAuth 2.0 Authorization Code Flow with PKCE (required for all clients since third-party web apps are public clients)
- **Consent screen authentication:** Uses existing Clerk session; redirects to Clerk sign-in if user is not authenticated
- **Authorization codes:** Stateless signed JWTs — no server-side storage needed; the code itself encodes grant details (app_id, user_id, scopes, spending_limit, code_challenge, redirect_uri) and is verified at the token endpoint
- **Token lifetimes:** Access tokens 1 hour, refresh tokens 30 days
- **App registration:** Open — any developer can register immediately, no approval required
- **Spending limits:** Optional — users may set a per-app monthly spending cap during authorization, or leave unlimited
- **Scopes:** `content:write`, `content:read`, `balance:read` — no finer granularity
- **Third-party capabilities:** Publish only. No deletion, no retention extension, no account management. Content is immutable once published.
- **Retention period:** User-configured default stored in their profile; third-party apps use this default when publishing
- **SDK distribution:** Both npm (`hashbin-sdk`) and served from `https://hashbin.org/sdk/hashbin.js`
- **Developer page:** `/developers`
- **JWT signing:** HS256 (symmetric, single shared secret across workers)
- **Refresh token rotation:** Yes — old refresh token is revoked when a new one is issued; network failure mid-refresh requires re-authorization
- **Platform default retention:** 1 month (when user hasn't configured a default)

## Proposed Approach: OAuth 2.0 Authorization Code Flow with PKCE

Third-party web apps register with hashbin.org, then redirect users through an authorization flow to get scoped access tokens.

### Phase 1: Application Registry

- New Durable Object: `ApplicationRegistry`
  - Stores registered third-party applications
  - Fields: `app_id`, `app_name`, `redirect_uris[]`, `client_secret_hash`, `owner_user_id`, `created_at`, `status`
- Developer registration page at `/developers`
  - Register an app, get `client_id` and `client_secret`
  - Configure allowed redirect URIs
  - View usage stats

### Phase 2: OAuth 2.0 Authorization Server

- **Authorization endpoint:** `GET /oauth/authorize`
  - Parameters: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method`
  - PKCE is required — requests without `code_challenge` are rejected
  - Uses existing Clerk session; redirects to sign-in if not authenticated
  - Shows consent screen: "App X wants to publish content using your balance"
  - User can optionally set a monthly spending limit
  - On approval, redirects back with a signed JWT authorization `code` (10-minute expiry)
- **Token endpoint:** `POST /oauth/token`
  - Verifies the signed JWT authorization code
  - Validates `code_verifier` against the `code_challenge` embedded in the JWT
  - Issues access token + refresh token
  - Grant type: `authorization_code` or `refresh_token`
- **Token revocation:** `POST /oauth/revoke`

### Phase 3: Scoped Permissions

Three scopes:
- `content:write` — publish content (deducting from user's balance, using user's default retention period)
- `content:read` — check content existence and metadata
- `balance:read` — view current balance (so app can check before uploading)

### Phase 4: Spending Controls

- Per-app spending limits optionally set by the user during authorization
  - e.g., "Allow App X to spend up to $5.00/month from my balance"
  - Users who skip this authorize unlimited spending
- Extension to `UserProfile` Durable Object:
  - New table for per-app authorization grants and spending tracking
  - Track per-app spending (monthly)
  - Enforce limits at upload time
  - Reset spending on monthly boundary
- Users can view and adjust app spending limits in dashboard

### Phase 5: Default Retention Period

- New field in `UserProfile`: `default_retention_months` (integer)
- Set via user settings in dashboard (e.g., 1, 3, 6, 12 months)
- When a third-party app publishes content via `content:write`, the user's default retention period is applied automatically
- If no default is configured, fall back to a platform default (e.g., 1 month)

### Phase 6: CORS & Browser Integration

- CORS headers for registered app origins (derived from redirect URIs)
- Token-based auth for browser-to-hashbin.org API calls from third-party domains
- Rate limiting per app + per user

### Phase 7: Developer Documentation & SDK

- OAuth integration guide
- JavaScript SDK (`hashbin-sdk`) published to both npm and `https://hashbin.org/sdk/hashbin.js`
  - `hashbin.authorize()` — initiate OAuth flow with PKCE (popup or redirect)
  - `hashbin.publish(content)` — upload content using user's default retention
  - `hashbin.getBalance()` — check balance
- Example integrations

## API Endpoints (New)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/developers/apps` | Register a new application |
| GET | `/api/developers/apps` | List your registered apps |
| PATCH | `/api/developers/apps/{app_id}` | Update app settings |
| DELETE | `/api/developers/apps/{app_id}` | Delete app registration |
| GET | `/oauth/authorize` | Authorization consent screen |
| POST | `/oauth/authorize` | User grants/denies consent |
| POST | `/oauth/token` | Exchange code for tokens |
| POST | `/oauth/revoke` | Revoke a token |
| GET | `/api/account/authorizations` | List apps user has authorized |
| DELETE | `/api/account/authorizations/{app_id}` | Revoke app access |
| GET | `/api/account/settings` | Get user settings (incl. default retention) |
| PATCH | `/api/account/settings` | Update user settings |

## Data Model

### Application (in ApplicationRegistry DO)
```
app_id              TEXT PRIMARY KEY
app_name            TEXT NOT NULL
owner_user_id       TEXT NOT NULL
client_secret_hash  TEXT NOT NULL
redirect_uris       TEXT NOT NULL  -- JSON array
logo_url            TEXT
website_url         TEXT
status              TEXT DEFAULT 'active'  -- active, suspended, deleted
created_at          TEXT NOT NULL
```

### Authorization Grant (in UserProfile DO)
```
grant_id        TEXT PRIMARY KEY
user_id         TEXT NOT NULL
app_id          TEXT NOT NULL
scopes          TEXT NOT NULL  -- JSON array
spending_limit  REAL           -- monthly limit in USD, NULL = unlimited
spending_used   REAL DEFAULT 0 -- current month spend
spending_reset  TEXT           -- next reset date (ISO 8601)
created_at      TEXT NOT NULL
revoked_at      TEXT
```

### Authorization Code (stateless signed JWT, not stored)

The authorization code is a signed JWT containing:
- `app_id` — the requesting application
- `user_id` — the authorizing user
- `redirect_uri` — the validated redirect URI
- `scopes` — granted scopes
- `code_challenge` — PKCE challenge from the client
- `code_challenge_method` — always `S256`
- `spending_limit` — user-specified limit or null
- `exp` — 10 minutes from creation
- `iat` — issued at

Signed with a server-side secret (new `OAUTH_SIGNING_KEY` secret in wrangler).

### Access Token (signed JWT, not stored)

Access tokens are also signed JWTs containing:
- `grant_id` — reference to the authorization grant
- `app_id` — the application
- `user_id` — the user
- `scopes` — granted scopes
- `exp` — 1 hour from creation
- `iat` — issued at
- `token_type` — `access`

Validated by verifying the signature and checking `exp`. No server-side lookup needed.

### Refresh Token (in UserProfile DO, alongside grants)
```
token_hash      TEXT PRIMARY KEY
grant_id        TEXT NOT NULL
app_id          TEXT NOT NULL
user_id         TEXT NOT NULL
expires_at      TEXT NOT NULL  -- 30 days from creation
created_at      TEXT NOT NULL
revoked_at      TEXT
```

Refresh tokens are stored server-side so they can be revoked. When used, the old refresh token is rotated (revoked and replaced with a new one).

### User Settings (in UserProfile DO)
```
default_retention_months  INTEGER  -- user's default retention period for third-party uploads
```

## Implementation Order

1. Application Registry (DO + API + developer UI at `/developers`)
2. OAuth authorization + token endpoints (signed JWT codes, PKCE)
3. Token validation in auth middleware (verify JWT access tokens)
4. Default retention period (user settings + upload integration)
5. Spending controls (per-app tracking in UserProfile)
6. CORS for registered apps
7. Dashboard: manage authorized apps + settings
8. JavaScript SDK (npm + hosted)
9. Developer documentation

## All Questions Resolved
