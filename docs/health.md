# Health endpoint

`GET /health` on the main Worker checks its configuration and bindings and reports which
commit is deployed. The code is `handleHealth` in `src/health.js`. Deploy CI,
`npm run verify:production`, `scripts/verify-deployment.sh` and the scheduled smoke test all
call it.

```bash
curl -s https://hashbin.org/health | jq .
curl -s https://hashbin-worker-prod.<workers-subdomain>.workers.dev/health   # before routes
```

## Response

```json
{
  "status": "healthy",
  "timestamp": "2026-11-25T14:25:56.858Z",
  "environment": "production",
  "gitSha": "78d2c620568699765af125e2052ed1f67715c71b",
  "gitShaPresent": true,
  "checks": {
    "worker": { "status": "operational", "message": "Worker is responding", "details": { } },
    "environment": { },
    "durableObjects": { },
    "r2": { },
    "clerk": { },
    "stripe": { }
  },
  "summary": { "total": 6, "operational": 6, "degraded": 0, "down": 0 }
}
```

Each check has `status` (`operational`, `degraded` or `down`), `message`, `details` and, when
it failed, `error`. The overall `status` is `unhealthy` if any check is down (HTTP 503),
`degraded` if any is degraded (HTTP 200), and `healthy` otherwise (HTTP 200).

`gitSha` is the deployed commit (`BUNDLED_GIT_SHA` in the bundle, else the `GIT_SHA` secret);
`gitShaPresent` is false when neither is set. See [git-sha-verification.md](git-sha-verification.md).

## Checks

| Check | Operational when | Degraded / down when |
|-------|------------------|----------------------|
| `worker` | The Worker runs; `details` says whether `ENVIRONMENT` and `LOG_LEVEL` are set | Down only if the check itself throws |
| `environment` | `ENVIRONMENT` is `development`, `production` or `local`, `LOG_LEVEL` is `debug`, `info`, `warn` or `error`, and `OAUTH_SIGNING_KEY` is set (not required in local mode) | Degraded if any is invalid or missing |
| `durableObjects` | `CONTENT_METADATA`, `USER_PROFILES`, `PAYMENT_RECORDS`, `CONTEST_RECORDS` and `MESSAGE_THREADS` are bound and can create a stub | Degraded if some are, down if none are |
| `r2` | `CONTENT_BUCKET` and `BACKUP_BUCKET` answer a one-object `list` | Degraded if one does, down if neither does |
| `clerk` | `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` are set, and production isn't using test keys | Degraded if one is set or test keys are used in production, down if neither is set |
| `stripe` | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set, and production isn't using a test key | Same rule as `clerk` |

The checks do not read or write Durable Object storage, upload or download content, or run
cron jobs. DNS, TLS, routes on the other origins and dashboard settings are outside them; the
[production checklist](../todo/deployment_checklist.md) (`npm run verify:production`) covers
the three origins end to end.

## Alerts

When a check is down or degraded, `/health` records a `health_unhealthy` (critical) or
`health_degraded` (warning) alert in the AlertStore Durable Object, which operators read with `GET /api/admin/alerts` and,
if `ALERT_WEBHOOK_URL` is set, receive by webhook. A failure to record an
alert never fails the health check.

## Troubleshooting

- **A binding is not available:** check `wrangler.toml` and redeploy through the workflow.
- **Bound but not accessible:** for R2, confirm the bucket exists (the deploy workflow creates
  it); for Durable Objects, confirm the migrations in `wrangler.toml` were applied and the
  account is on Workers Paid.
- **`environment` degraded:** fix the variable in `wrangler.toml`, or push the missing
  `OAUTH_SIGNING_KEY` secret through the deploy workflow.
- **`clerk` or `stripe` degraded in production:** a test key (`sk_test_`/`pk_test_`) was
  deployed; replace it with the live key in GitHub secrets and redeploy.
