import { describe, expect, it } from 'vitest';
import { checkDeploymentSecrets } from './check-deployment-secrets.mjs';

function secrets() {
  return Object.fromEntries([
    'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ZONE_ID',
    'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_WEBHOOK_SECRET',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'OAUTH_SIGNING_KEY',
    'DOWNLOAD_TOKEN_SECRET', 'ADMIN_USER_ID', 'CLOUDFLARE_ANALYTICS_TOKEN',
  ].map(name => [name, name === 'CLERK_PUBLISHABLE_KEY' ? 'pk_live_private-value' : 'sk_live_private-value']));
}

describe('deployment secret preflight', () => {
  it('accepts live configuration without optional alert and workers.dev settings', () => {
    expect(checkDeploymentSecrets(secrets())).toEqual([]);
  });

  it.each(Object.keys(secrets()))('requires %s', name => {
    expect(checkDeploymentSecrets({ ...secrets(), [name]: '  ' })).toContain(`Missing ${name}`);
  });

  it.each(['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'])('rejects non-live %s without exposing its value', name => {
    const problems = checkDeploymentSecrets({ ...secrets(), [name]: 'sk_test_private-value' });
    expect(problems).toEqual([`${name} must be a production live key`]);
    expect(JSON.stringify(problems)).not.toContain('private-value');
  });

  it('reports all missing names without throwing on an empty environment', () => {
    expect(checkDeploymentSecrets({})).toHaveLength(12);
  });
});
