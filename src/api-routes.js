/**
 * The API route table and its dispatcher. Every /api/*, /oauth/* and /health request
 * reaches handleApiRoutes from the fetch handler in src/index.js.
 */
import { handleDownloads } from './api/downloads.js';
import { handleAuthCallback, handleSessionInfo, handleLogout, handleLinkProvider, handleCreateApiKey, handleListApiKeys, handleRevokeApiKey, handleUpdateApiKey, handleDeleteAccount } from './api/auth.js';
import { handleGetBalance, handleGetBalanceHistory } from './api/balance.js';
import { handleUserAliases, handleResolveAlias, handleGlobalAlias } from './api/aliases.js';
import { handleCreateDeposit, handleCalculateRetention, handleCreateDonation } from './api/payments.js';
import { handleLocalDevDeposit } from './api/local-payments.js';
import { handleGetContent, handleCheckContentExists, handleExtendContent } from './api/content.js';
import { handleUploadContent } from './api/content-upload.js';
import { handlePurchaseRateLimit, handleGetRateLimit } from './api/rate-limit.js';
import { handleGetUserUploads } from './api/user.js';
import { handleCreateSupplier, handleListSuppliers, handleGetSupplier, handleDeleteSupplier, handleUpdateSupplier, handleRescanSupplier, handleGetCIDSuppliers } from './api/suppliers.js';
import { handleGetStats, handleGetFinancialStats, handleGetContentStats, handleGetUserStats, handleGetAdminHealth, handleGetAlerts, handleAcknowledgeAlert, handleGetAuditLog, handleExportData, handleCostSafety, handleGetCosts, handleGetCostsByService, handleGetProfitability, handleRecordCost, handleTestAlertWebhook } from './api/admin.js';
import { handleListDeletions, handleGetDeletion, handleGetDeletionStats } from './api/public-deletions.js';
import { handleCreateDispute, handleGetAliasDisputes, handleListDisputes, handleGetDispute, handleGetContentDisputes } from './api/disputes.js';
import { handleDeleteContent, handleAdminDeleteContent } from './api/content-deletion.js';
import { handleAdminListDisputes, handleAdminUpdateDispute, handleGetRepeatInfringers, handleGetAdminActions } from './api/admin-disputes.js';
import { handleGetBackupFile, handleGetBackupStatus, handleListBackupFiles, handleRestoreObject, handleRunBackup } from './api/admin-backups.js';
import { handleCreateDeveloperApp, handleListDeveloperApps, handleUpdateDeveloperApp, handleDeleteDeveloperApp, handleOAuthAuthorize, handleOAuthToken, handleDPoPNonce, handleOAuthRevoke, handleGetAccountSettings, handleUpdateAccountSettings, handleListAuthorizations, handleRevokeAllAuthorizations, handleRevokeAuthorization, handleUpdateAuthorization } from './api/oauth.js';
import { handleGetOAuthAuthorizePage } from './api/oauth-consent-page.js';
import { handleDeveloperAppSafety } from './api/app-safety.js';
import { handleDeveloperRun, handleAdminRun, handleRefreshRunCost } from './api/run-origin.js';
import { authenticate, requireAuth } from './auth/middleware.js';
import { handlePublish, handlePublishApp } from './api/publish.js';
import { ACCOUNT_SESSION, ADMIN_SESSION, PUBLIC, SESSION, checkAccess, isSessionAuth } from './auth/scopes.js';
import { authorizeDbaOnline } from './auth/dba-auth.js';
import { handleDbaEvent } from './api/dba-events.js';
import { handleCreateAdminKey, handleListAdminKeys, handleRevokeAdminKey } from './api/admin-keys.js';
import { handleMoveAccount } from './api/admin-accounts.js';
import { handleConfig, handleHealth } from './health.js';
import { handleFinishDbaLink, handleGetDbaLink, handleStartDbaLink, handleUnlinkDba } from './api/dba.js';

/**
 * API route table. Every route declares its access: PUBLIC, SESSION (a sign-in: the
 * account's own, or a devicebasedauth.org device session), ACCOUNT_SESSION (the account's own
 * sign-in only: minting credentials that outlive a device, or ending the account), or the
 * scope(s) a delegated credential needs, any one of which suffices. The dispatcher enforces it before the handler runs; a test fails for any
 * route without a valid declaration.
 */
const API_ROUTES = [
  { method: 'GET', path: /^\/api\/aliases\/([^/]+)\/disputes$/, access: PUBLIC, handler: handleGetAliasDisputes },
  { method: 'GET', path: /^\/api\/aliases\/([^/]+)$/, access: PUBLIC, handler: handleGlobalAlias },
  { method: 'POST', path: /^\/api\/aliases\/([^/]+)\/(claim|renew|buy)$/, access: 'aliases:purchase', handler: handleGlobalAlias },
  { method: 'PUT', path: /^\/api\/aliases\/([^/]+)\/value$/, access: 'aliases:write', handler: handleGlobalAlias },
  { method: 'PATCH', path: /^\/api\/aliases\/([^/]+)$/, access: 'aliases:write', handler: handleGlobalAlias },
  { method: ['PUT', 'DELETE'], path: /^\/api\/aliases\/([^/]+)\/listing$/, access: 'aliases:sell', handler: handleGlobalAlias },
  { method: 'GET', path: /^\/api\/aliases\/([^/]+)\/offers$/, access: 'aliases:sell', handler: handleGlobalAlias },
  { method: 'POST', path: /^\/api\/aliases\/([^/]+)\/offers$/, access: 'aliases:purchase', handler: handleGlobalAlias },
  { method: 'DELETE', path: /^\/api\/aliases\/([^/]+)\/offers\/([^/]+)$/, access: 'aliases:purchase', handler: handleGlobalAlias },
  { method: 'POST', path: /^\/api\/aliases\/([^/]+)\/offers\/([^/]+)\/(accept|decline)$/, access: 'aliases:sell', handler: handleGlobalAlias },
  { method: 'POST', path: /^\/api\/admin\/aliases\/([^/]+)\/(suspend|restore|reclaim|assign)$/, access: 'admin:takedown', handler: handleGlobalAlias },
  { method: 'GET', path: /^\/api\/aliases\/([^/]+)\/resolve$/, access: PUBLIC, handler: handleResolveAlias },
  { method: 'GET', path: '/api/user/aliases', access: 'aliases:read', handler: handleUserAliases },
  { method: 'POST', path: '/api/user/aliases/personal', access: 'aliases:purchase', handler: handleUserAliases },
  { method: 'POST', path: /^\/api\/user\/aliases\/personal\/([^/]+)\/renew$/, access: 'aliases:purchase', handler: handleUserAliases },
  { method: ['PUT', 'PATCH', 'DELETE'], path: /^\/api\/user\/aliases\/personal\/([^/]+)$/, access: 'aliases:write', handler: handleUserAliases },
  // Downloads (budgets and sessions belong to the account; signing spends)
  { method: ['GET', 'PUT'], path: '/api/downloads/budget', access: SESSION, handler: handleDownloads },
  { method: 'PUT', path: /^\/api\/(auth\/apikeys|oauth\/grants|auth\/dba\/credentials)\/[^/]+\/download-budget$/, access: ACCOUNT_SESSION, handler: handleDownloads },
  { method: ['GET', 'DELETE'], path: '/api/downloads/sessions', access: SESSION, handler: handleDownloads },
  { method: 'POST', path: '/api/downloads/session', access: ACCOUNT_SESSION, handler: handleDownloads },
  { method: 'POST', path: '/api/downloads/sign', access: 'downloads:spend', handler: handleDownloads },

  { method: ['GET', 'HEAD'], path: '/health', access: PUBLIC, handler: (request, env) => handleHealth(env) },
  { method: 'GET', path: '/api/config', access: PUBLIC, handler: (request, env) => handleConfig(env) },

  // Account and credentials
  { method: 'POST', path: '/api/auth/callback', access: PUBLIC, handler: handleAuthCallback },
  { method: 'GET', path: '/api/auth/session', access: SESSION, handler: handleSessionInfo },
  { method: 'POST', path: '/api/auth/logout', access: SESSION, handler: handleLogout },
  { method: 'POST', path: '/api/auth/link', access: ACCOUNT_SESSION, handler: handleLinkProvider },
  { method: 'POST', path: '/api/auth/apikeys', access: ACCOUNT_SESSION, handler: handleCreateApiKey },
  { method: 'GET', path: '/api/auth/apikeys', access: SESSION, handler: handleListApiKeys },
  { method: 'DELETE', path: /^\/api\/auth\/apikeys\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleRevokeApiKey(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/auth\/apikeys\/([^/]+)$/, access: ACCOUNT_SESSION, handler: (request, env, m) => handleUpdateApiKey(request, env, m[1]) },
  { method: 'DELETE', path: '/api/auth/account', access: ACCOUNT_SESSION, handler: handleDeleteAccount },
  // devicebasedauth.org account link (device credentials themselves are handled in src/auth/middleware.js)
  { method: 'GET', path: '/api/auth/dba/link', access: SESSION, handler: handleGetDbaLink },
  { method: 'DELETE', path: '/api/auth/dba/link', access: ACCOUNT_SESSION, handler: handleUnlinkDba },
  { method: 'POST', path: '/api/auth/dba/link/start', access: ACCOUNT_SESSION, handler: handleStartDbaLink },
  { method: 'POST', path: '/api/auth/dba/link/finish', access: ACCOUNT_SESSION, handler: handleFinishDbaLink },
  // devicebasedauth.org revocation webhook (signed by DBA's issuer key)
  { method: 'POST', path: '/api/dba/events', access: PUBLIC, handler: handleDbaEvent },
  { method: 'POST', path: '/api/developers/apps', access: ACCOUNT_SESSION, handler: handleCreateDeveloperApp },
  { method: 'GET', path: '/api/developers/apps', access: SESSION, handler: handleListDeveloperApps },
  { method: ['GET', 'PUT'], path: /^\/api\/developers\/apps\/([^/]+)\/run$/, access: ACCOUNT_SESSION, handler: (request, env, m) => handleDeveloperRun(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/admin\/apps\/([^/]+)\/run\/(suspend|restore)$/, access: 'admin:takedown', handler: (request, env, m) => handleAdminRun(request, env, m[1], m[2]) },
  { method: 'GET', path: /^\/api\/developers\/apps\/([^/]+)\/safety$/, access: SESSION, handler: (request, env, m) => handleDeveloperAppSafety(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/developers\/apps\/([^/]+)\/safety$/, access: SESSION, handler: (request, env, m) => handleDeveloperAppSafety(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/developers\/apps\/([^/]+)$/, access: ACCOUNT_SESSION, handler: (request, env, m) => handleUpdateDeveloperApp(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/developers\/apps\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleDeleteDeveloperApp(request, env, m[1]) },
  { method: 'GET', path: '/api/publish/app', access: PUBLIC, handler: handlePublishApp },
  { method: 'POST', path: '/api/publish', access: SESSION, handler: handlePublish },
  { method: 'POST', path: '/oauth/authorize', access: ACCOUNT_SESSION, handler: handleOAuthAuthorize },
  { method: 'GET', path: '/oauth/authorize', access: PUBLIC, handler: handleGetOAuthAuthorizePage },
  { method: 'GET', path: '/oauth/dpop-nonce', access: PUBLIC, handler: handleDPoPNonce },
  { method: 'POST', path: '/oauth/token', access: PUBLIC, handler: handleOAuthToken },
  { method: 'POST', path: '/oauth/revoke', access: PUBLIC, handler: handleOAuthRevoke },
  { method: 'GET', path: '/api/account/settings', access: SESSION, handler: handleGetAccountSettings },
  { method: 'PATCH', path: '/api/account/settings', access: SESSION, handler: handleUpdateAccountSettings },
  { method: 'DELETE', path: '/api/account/authorizations', access: SESSION, handler: handleRevokeAllAuthorizations },
  { method: 'GET', path: '/api/account/authorizations', access: SESSION, handler: handleListAuthorizations },
  { method: 'DELETE', path: /^\/api\/account\/authorizations\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleRevokeAuthorization(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/account\/authorizations\/([^/]+)$/, access: ACCOUNT_SESSION, handler: (request, env, m) => handleUpdateAuthorization(request, env, m[1]) },

  // Balance and payments
  { method: 'GET', path: '/api/balance', access: 'balance:read', handler: handleGetBalance },
  { method: 'GET', path: '/api/balance/history', access: 'transactions:read', handler: handleGetBalanceHistory },
  { method: 'POST', path: '/api/balance/deposit', access: SESSION, handler: handleCreateDeposit },
  { method: 'POST', path: '/api/balance/dev-deposit', access: SESSION, handler: handleLocalDevDeposit },
  { method: 'POST', path: '/api/payments/calculate', access: PUBLIC, handler: handleCalculateRetention },

  // Content
  { method: 'POST', path: '/api/content', access: 'content:write', handler: handleUploadContent },
  { method: 'POST', path: '/api/content/rate-limit/purchase', access: 'ratelimit:purchase', handler: handlePurchaseRateLimit },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/exists$/, access: PUBLIC, handler: (request, env, m) => handleCheckContentExists(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/rate-limit$/, access: PUBLIC, handler: (request, env, m) => handleGetRateLimit(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/disputes$/, access: PUBLIC, handler: (request, env, m) => handleGetContentDisputes(request, env, m[1], request.user?.userId || null) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/suppliers$/, access: PUBLIC, handler: (request, env, m) => handleGetCIDSuppliers(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetContent(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/content\/([^/]+)\/extend$/, access: 'content:extend', handler: (request, env, m) => handleExtendContent(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/content\/([^/]+)$/, access: ['content:delete', 'admin:takedown'], handler: (request, env, m) => handleDeleteContent(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/donate\/cid\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleCreateDonation(request, env, m[1]) },
  { method: 'GET', path: '/api/user/uploads', access: 'uploads:read', handler: handleGetUserUploads },

  // Disputes (public; signed-in users see contact details)
  { method: 'POST', path: '/api/disputes', access: PUBLIC, handler: handleCreateDispute },
  { method: 'GET', path: '/api/disputes', access: PUBLIC, handler: handleListDisputes },
  { method: 'GET', path: /^\/api\/disputes\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetDispute(request, env, m[1], request.user?.userId || null) },

  // Suppliers
  { method: 'POST', path: '/api/suppliers', access: 'suppliers:write', handler: handleCreateSupplier },
  { method: 'GET', path: '/api/suppliers', access: 'suppliers:read', handler: handleListSuppliers },
  { method: 'GET', path: /^\/api\/suppliers\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetSupplier(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/suppliers\/([^/]+)$/, access: 'suppliers:write', handler: (request, env, m) => handleDeleteSupplier(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/suppliers\/([^/]+)$/, access: 'suppliers:write', handler: (request, env, m) => handleUpdateSupplier(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/suppliers\/([^/]+)\/scan$/, access: 'suppliers:write', handler: (request, env, m) => handleRescanSupplier(request, env, m[1]) },

  // Admin
  { method: 'POST', path: '/api/admin/keys', access: ADMIN_SESSION, handler: handleCreateAdminKey },
  { method: 'GET', path: '/api/admin/keys', access: ADMIN_SESSION, handler: handleListAdminKeys },
  { method: 'DELETE', path: /^\/api\/admin\/keys\/([^/]+)$/, access: ADMIN_SESSION, handler: (request, env, m) => handleRevokeAdminKey(request, env, m[1]) },
  { method: 'GET', path: '/api/admin/disputes', access: 'admin:disputes', handler: handleAdminListDisputes },
  { method: 'PATCH', path: /^\/api\/admin\/disputes\/([^/]+)$/, access: 'admin:disputes', handler: (request, env, m) => handleAdminUpdateDispute(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/admin\/content\/([^/]+)\/delete$/, access: 'admin:takedown', handler: (request, env, m) => handleAdminDeleteContent(request, env, m[1]) },
  { method: 'GET', path: '/api/admin/repeat-infringers', access: 'admin:disputes', handler: handleGetRepeatInfringers },
  { method: 'GET', path: '/api/admin/actions', access: 'admin:disputes', handler: handleGetAdminActions },
  { method: 'GET', path: '/api/admin/stats', access: 'admin:stats', handler: handleGetStats },
  { method: 'GET', path: '/api/admin/stats/financial', access: 'admin:stats', handler: handleGetFinancialStats },
  { method: 'GET', path: '/api/admin/stats/content', access: 'admin:stats', handler: handleGetContentStats },
  { method: 'GET', path: '/api/admin/stats/users', access: 'admin:stats', handler: handleGetUserStats },
  { method: 'GET', path: '/api/admin/health', access: 'admin:stats', handler: handleGetAdminHealth },
  { method: 'POST', path: '/api/admin/alerts/test', access: 'admin:stats', handler: handleTestAlertWebhook },
  { method: 'GET', path: '/api/admin/alerts', access: 'admin:stats', handler: handleGetAlerts },
  { method: 'POST', path: /^\/api\/admin\/alerts\/([^/]+)\/acknowledge$/, access: 'admin:stats', handler: (request, env, m) => handleAcknowledgeAlert(request, env, m[1]) },
  { method: 'GET', path: '/api/admin/audit-log', access: 'admin:stats', handler: handleGetAuditLog },
  { method: 'GET', path: '/api/admin/export', access: 'admin:export', handler: handleExportData },
  { method: ['GET', 'POST'], path: '/api/admin/cost-safety', access: 'admin:costs', handler: handleCostSafety },
  { method: 'POST', path: '/api/admin/cost-safety/run/refresh', access: 'admin:costs', handler: handleRefreshRunCost },
  { method: 'GET', path: '/api/admin/cost-safety/history', access: 'admin:costs', handler: handleCostSafety },
  { method: 'GET', path: '/api/admin/costs', access: 'admin:costs', handler: handleGetCosts },
  { method: 'GET', path: '/api/admin/costs/by-service', access: 'admin:costs', handler: handleGetCostsByService },
  { method: 'POST', path: '/api/admin/costs/record', access: 'admin:costs', handler: handleRecordCost },
  { method: 'GET', path: '/api/admin/profitability', access: 'admin:costs', handler: handleGetProfitability },
  { method: 'GET', path: '/api/admin/backups', access: 'admin:backups', handler: handleGetBackupStatus },
  { method: 'POST', path: '/api/admin/backups/run', access: 'admin:backups', handler: handleRunBackup },
  { method: 'GET', path: '/api/admin/backups/file', access: 'admin:backups', handler: handleGetBackupFile },
  { method: 'GET', path: /^\/api\/admin\/backups\/([^/]+)\/files$/, access: 'admin:backups', handler: (request, env, m) => handleListBackupFiles(request, env, m[1]) },
  { method: 'POST', path: '/api/admin/restore', access: 'admin:restore', handler: handleRestoreObject },
  { method: 'POST', path: '/api/admin/accounts/move', access: 'admin:accounts', handler: handleMoveAccount },

  // Public deletion records (transparency)
  { method: 'GET', path: '/api/public/deletions/stats', access: PUBLIC, handler: handleGetDeletionStats },
  { method: 'GET', path: /^\/api\/public\/deletions\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetDeletion(request, env, m[1]) },
  { method: 'GET', path: '/api/public/deletions', access: PUBLIC, handler: handleListDeletions }
];

/**
 * The declared API routes, for tests that check every route's access.
 */
export function apiRoutes() {
  return API_ROUTES;
}

function matchRoute(route, method, pathname) {
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  if (!methods.includes(method)) return null;
  if (typeof route.path === 'string') return route.path === pathname ? [pathname] : null;
  return pathname.match(route.path);
}

/**
 * Handle API routes: find the declared route, enforce its access, then run it
 */
export async function handleApiRoutes(url, request, env) {
  for (const route of API_ROUTES) {
    const match = matchRoute(route, request.method, url.pathname);
    if (!match) continue;

    const authResult = await authenticate(request, env);
    // A devicebasedauth.org grant may allow this route's scope only online (src/auth/dba-auth.js)
    const online = await authorizeDbaOnline(request, env, authResult, route.access);
    if (online) return online;
    const denied = checkAccess(authResult, route.access, () => requireAuth(authResult));
    if (denied) return denied;

    // Handlers read the caller from request.user. On public routes only the account's
    // own session counts, so keys and app tokens never act as the user there.
    request.auth = authResult;
    if (authResult.authenticated && (route.access !== PUBLIC || isSessionAuth(authResult))) {
      request.user = authResult.user;
    }
    return route.handler(request, env, match);
  }

  return new Response(
    JSON.stringify({
      error: 'Not Found',
      message: 'API endpoint not found'
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' }
    }
  );
}
