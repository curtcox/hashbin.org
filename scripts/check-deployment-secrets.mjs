// Check names and key modes only. Never print secret values.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Return production configuration problems without disclosing credential values. */
export function checkDeploymentSecrets(env) {
  const required = [
    'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ZONE_ID',
    'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_WEBHOOK_SECRET',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'OAUTH_SIGNING_KEY',
    'DOWNLOAD_TOKEN_SECRET', 'ADMIN_USER_ID', 'CLOUDFLARE_ANALYTICS_TOKEN',
  ];
  const problems = required.filter(name => !env[name]?.trim()).map(name => `Missing ${name}`);
  // Stripe live keys may be standard (sk_live_) or restricted (rk_live_), as /health accepts
  for (const [name, prefixes] of [
    ['CLERK_SECRET_KEY', ['sk_live_']], ['CLERK_PUBLISHABLE_KEY', ['pk_live_']],
    ['STRIPE_SECRET_KEY', ['sk_live_', 'rk_live_']],
  ]) {
    if (env[name]?.trim() && !prefixes.some(prefix => env[name].startsWith(prefix))) problems.push(`${name} must be a production live key`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkDeploymentSecrets(process.env);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log('Required production secrets and live key modes verified');
}
