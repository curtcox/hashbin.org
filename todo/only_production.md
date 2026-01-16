# Plan: Collapse to Single Production Environment

**Goal**: Remove the test/development environment distinction and use only a single production environment.

**Current State**:
- Two key types: `hb_live_*` (production) and `hb_test_*` (development)
- Environment validation prevents wrong key type in wrong environment
- Separate deployment configurations for dev and prod

**Target State**:
- Single key type: `hb_live_*` (or simplified to `hb_*`)
- No environment validation
- Single deployment configuration

---

## Phase 1: Backend Core Changes

### 1.1 Authentication Utilities (`src/auth/utils.js`)

**Changes:**
- [ ] Remove `TEST_PREFIX` constant (line 11)
- [ ] Update `generateApiKey()` function:
  - Remove `environment` parameter
  - Always use `LIVE_PREFIX` (or rename to `API_KEY_PREFIX`)
  - Signature: `generateApiKey()` instead of `generateApiKey(environment)`
- [ ] Simplify `validateApiKeyFormat()` function:
  - Remove `environment` parameter
  - Remove test prefix check (line 82: `const hasTestPrefix = apiKey.startsWith(TEST_PREFIX)`)
  - Remove environment mismatch validation (lines 92-107)
  - Only validate single prefix format
  - Signature: `validateApiKeyFormat(apiKey)` instead of `validateApiKeyFormat(apiKey, environment)`

**Impact**: Core authentication logic simplified, ~40 lines removed

---

### 1.2 Authentication Middleware (`src/auth/middleware.js`)

**Changes:**
- [ ] Remove `AUTH_ENV_MISMATCH` error code constant (line 16)
- [ ] Update `validateApiKeyFormat` call (line 115):
  - From: `validateApiKeyFormat(apiKey, env.ENVIRONMENT)`
  - To: `validateApiKeyFormat(apiKey)`
- [ ] Remove any handling of `AUTH_ENV_MISMATCH` errors

**Impact**: Middleware simplified, environment checks removed

---

### 1.3 API Key Creation Endpoint (`src/api/auth.js`)

**Changes:**
- [ ] Update key generation call (line 312):
  - From: `const apiKey = generateApiKey(env.ENVIRONMENT);`
  - To: `const apiKey = generateApiKey();`
- [ ] Remove `environment` parameter from API request body validation
- [ ] Update API response documentation

**Impact**: API no longer accepts or uses environment parameter

---

### 1.4 Application Entry Point (`src/index.js`)

**Changes:**
- [ ] Review all uses of `env.ENVIRONMENT` (lines 53, 301, 364, etc.)
- [ ] Option A: Remove environment checks entirely
- [ ] Option B: Keep `env.ENVIRONMENT` for logging only (non-functional)
- [ ] Remove `VALID_ENVIRONMENTS` constant (line 53) if not needed
- [ ] Update health check logic if environment validation removed (lines 410-437)

**Impact**: Application no longer distinguishes environments functionally

---

## Phase 2: Frontend Changes

### 2.1 API Key Creation Form (`frontend/api-keys-create.html`)

**Changes:**
- [ ] Remove environment selector field (lines 192-202):
  ```html
  <label for="key-environment" class="form-label">Environment *</label>
  <select id="key-environment" name="environment" class="form-select" required>
    <option value="live">Live (hb_live_*)</option>
    <option value="test">Test (hb_test_*)</option>
  </select>
  <span class="form-help">...</span>
  ```
- [ ] Remove `environment` parameter from form submission JavaScript (line 362)
- [ ] Update form validation to not require environment field

**Impact**: Users no longer select environment when creating keys

---

### 2.2 API Key List Page (`frontend/api-keys.html`)

**Changes:**
- [ ] Remove environment detection logic (line 370):
  ```javascript
  const environment = key.key_id.startsWith('hb_live_') ? 'live' : 'test';
  ```
- [ ] Remove environment badge display (lines 88-102, 390)
- [ ] Simplify key prefix display (no environment color coding)

**Impact**: Keys displayed without environment badges

---

### 2.3 API Key Detail Page (`frontend/api-keys-detail.html`)

**Changes:**
- [ ] Remove environment detection logic (line 479)
- [ ] Remove environment badge from UI
- [ ] Simplify key information display

**Impact**: Detail view shows keys without environment distinction

---

### 2.4 API Client (`frontend/js/api-keys.js`)

**Changes:**
- [ ] Remove `environment` from JSDoc (line 22):
  ```javascript
  * @param {string} data.environment 'live' or 'test'
  ```
- [ ] Update `createApiKey` function to not expect/send environment parameter
- [ ] Update function signature and implementation

**Impact**: JavaScript API client simplified

---

## Phase 3: Configuration Changes

### 3.1 Cloudflare Configuration (`wrangler.toml`)

**Changes:**
- [ ] Remove `[env.development]` section (lines 10-20)
- [ ] Remove `[env.production]` section (lines 22-71)
- [ ] Move production configuration to top-level
- [ ] Options for `ENVIRONMENT` variable:
  - Option A: Remove entirely
  - Option B: Keep as `ENVIRONMENT = "production"` for logging
- [ ] Consolidate Durable Objects bindings (currently duplicated)
- [ ] Consolidate R2 bucket bindings:
  - Currently: separate `hashbin-data-dev` and `hashbin-data-prod`
  - After: single `hashbin-data` bucket

**Impact**: Single deployment configuration

---

### 3.2 Package Scripts (`package.json`)

**Changes:**
- [ ] Replace separate deploy scripts (lines 9-10):
  - From: `deploy:dev` and `deploy:prod`
  - To: single `deploy` script
- [ ] Options:
  - Option A: Keep both scripts pointing to same deployment (backward compatibility)
  - Option B: Remove old scripts entirely
- [ ] Update verification scripts similarly

**Impact**: Simplified deployment commands

---

## Phase 4: Testing Changes

### 4.1 Authentication System Tests (`scripts/test-auth-system.sh`)

**Changes:**
- [ ] Remove Test 6: Test key in production environment (lines 164-186)
- [ ] Remove Test 7: Live key in development environment (lines 188-218)
- [ ] Update remaining tests to use single key prefix
- [ ] Update expected responses

**Impact**: ~60 lines removed from tests

---

### 4.2 API Key Tests (`scripts/test-api-keys.sh`)

**Changes:**
- [ ] Update format validation tests (lines 58-68)
- [ ] Remove environment parameter from test requests
- [ ] Update expected responses

**Impact**: Tests simplified

---

### 4.3 Deployment Verification (`scripts/verify-deployment.sh`)

**Changes:**
- [ ] Remove environment parameter
- [ ] Simplify to verify single deployment
- [ ] Update verification logic

**Impact**: Single verification script

---

### 4.4 Test Documentation (`scripts/README.md`)

**Changes:**
- [ ] Update test examples
- [ ] Remove environment-specific test descriptions
- [ ] Update usage instructions

**Impact**: Documentation reflects single environment

---

## Phase 5: CI/CD Changes

### 5.1 GitHub Actions Workflow (`.github/workflows/deploy.yml`)

**Changes:**
- [ ] Remove `deploy-dev` job entirely (lines 34-100)
- [ ] Keep single deployment job
- [ ] Remove environment checks (lines 157, 277)
- [ ] Consolidate R2 bucket creation (currently separate for dev/prod)
- [ ] Simplify secrets configuration
- [ ] Update workflow triggers if needed

**Impact**: Single deployment pipeline

---

### 5.2 Copilot Instructions (`.github/copilot-instructions.md`)

**Changes:**
- [ ] Update deployment instructions
- [ ] Remove environment-specific guidance
- [ ] Update development workflow

**Impact**: Guidance reflects single environment

---

## Phase 6: Documentation Updates

### 6.1 API Keys Setup Guide (`docs/api-keys-setup.md`)

**Changes:**
- [ ] Remove separate dev/prod deployment instructions (lines 29-47)
- [ ] Remove "Environment Isolation" security feature (line 162)
- [ ] Update API endpoint examples to remove environment parameter
- [ ] Update example responses to show only single key prefix
- [ ] Update deployment instructions

**Impact**: Documentation simplified

---

### 6.2 Implementation Summary (`IMPLEMENTATION_SUMMARY.md`)

**Changes:**
- [ ] Remove references to test keys (lines 40-42)
- [ ] Update to show only single key prefix format
- [ ] Update feature descriptions

**Impact**: Accurate feature documentation

---

### 6.3 Visual Guide (`VISUAL_GUIDE.md`)

**Changes:**
- [ ] Remove environment selector from create form mockup (lines 67-70)
- [ ] Remove environment badge from list/detail views
- [ ] Simplify all UI mockups

**Impact**: UI documentation matches simplified interface

---

### 6.4 API Documentation (`docs/API.md`)

**Changes:**
- [ ] Remove environment field from API documentation
- [ ] Update example requests/responses
- [ ] Update error codes (remove `AUTH_ENV_MISMATCH`)

**Impact**: API documentation accurate

---

### 6.5 Deployment Guide (`docs/deployment.md`)

**Changes:**
- [ ] Remove separate dev/prod deployment instructions
- [ ] Consolidate to single deployment process
- [ ] Update environment setup steps

**Impact**: Simplified deployment process

---

### 6.6 Main README (`README.md`)

**Changes:**
- [ ] Update deployment commands (lines 109-110)
- [ ] Remove `deploy:dev` and `deploy:prod` distinction
- [ ] Simplify environment setup
- [ ] Update quick start guide

**Impact**: Accurate project documentation

---

## Phase 7: Historical Documentation Cleanup

### 7.1 Todo/Done Documentation Files

**Files to update:**
- [ ] `todo/api_keys.md` (lines 109, 116, 122)
- [ ] `todo/key_management_ui.md`
- [ ] `todo/key_management_backend.md`
- [ ] `todo/user_authorization.md` (line 474)
- [ ] `done/user_authorization_phases_3.1-3.5_complete.md` (lines 87-88, 276)
- [ ] `done/site_creation.md`
- [ ] `done/user_authorization_summary.md`

**Changes:**
- [ ] Update or remove environment-specific examples
- [ ] Update user stories to reflect single environment
- [ ] Add notes indicating these are historical

**Impact**: Historical documentation remains accurate

---

## Phase 8: Data Migration (if needed)

### 8.1 Existing API Keys

**Considerations:**
- [ ] Check if any existing `hb_test_*` keys exist in production database
- [ ] Decision: Keep existing test keys or migrate them?
- [ ] Options:
  - Option A: Keep test keys as-is, they'll work without environment checks
  - Option B: Migrate `hb_test_*` to `hb_live_*` prefix
  - Option C: Leave as-is but generate new keys as `hb_live_*` only

**Impact**: Depends on existing data

---

### 8.2 R2 Bucket Data

**Considerations:**
- [ ] Check if separate dev/prod R2 buckets exist
- [ ] If yes, decide: merge or keep prod only?
- [ ] Update bucket references in code

**Impact**: Data storage simplified

---

## Key Decisions to Make

### Decision 1: Key Prefix Format
**Options:**
- A. Keep `hb_live_*` as only prefix (maintains "production" connotation)
- B. Change to simple `hb_*` prefix (cleaner, less redundant)
- C. Keep both prefixes but remove validation (allows existing test keys)

**Recommendation:** Option A - Keep `hb_live_*` to maintain semantic meaning

---

### Decision 2: Environment Variable
**Options:**
- A. Remove `ENVIRONMENT` variable entirely
- B. Keep `ENVIRONMENT = "production"` for logging/debugging only

**Recommendation:** Option B - Keep for logging clarity

---

### Decision 3: Existing Test Keys
**Options:**
- A. Migrate `hb_test_*` → `hb_live_*` in database
- B. Leave existing keys as-is (they'll work without validation)
- C. Invalidate all test keys, require regeneration

**Recommendation:** Option B - Simplest, no breaking changes

---

### Decision 4: R2 Buckets
**Options:**
- A. Merge dev/prod buckets
- B. Keep prod bucket only, archive dev
- C. Keep separate buckets but don't distinguish in code

**Recommendation:** Option B - Keep prod, archive dev

---

## Implementation Order

**Suggested sequence:**

1. **Backend core** (Phase 1) - Foundation changes
2. **Frontend** (Phase 2) - UI updates
3. **Tests** (Phase 4) - Update tests to pass
4. **Configuration** (Phase 3) - Deploy configuration
5. **CI/CD** (Phase 5) - Deployment pipeline
6. **Documentation** (Phase 6-7) - Final documentation updates
7. **Data migration** (Phase 8) - If needed

---

## Testing Checklist

After implementation, verify:

- [ ] Can create API keys without environment parameter
- [ ] All keys have single prefix format
- [ ] Authentication works with keys
- [ ] No environment validation errors
- [ ] UI displays keys without environment badges
- [ ] Deployment works with single configuration
- [ ] CI/CD pipeline succeeds
- [ ] All tests pass
- [ ] Documentation is accurate

---

## Estimated Impact

**Lines removed:** ~400-500 lines
**Files modified:** ~25 files
**Complexity reduction:** Significant - removes entire validation layer
**Breaking changes:**
- API endpoint no longer accepts `environment` parameter (backward compatible if ignored)
- Frontend no longer shows environment selector (visual only)
- Deployment scripts consolidated

**Risks:**
- Minimal - mostly simplification
- No data loss if existing keys kept as-is
- Can be rolled back if needed

---

## Rollback Plan

If issues arise:

1. Revert backend changes to restore environment validation
2. Revert frontend to restore environment selector
3. Restore wrangler.toml environment sections
4. Restore CI/CD separate deployment jobs

Git history will preserve all previous versions.

---

## Questions to Resolve Before Starting

1. Should key prefix be `hb_live_*` or simplified to `hb_*`?
2. Keep or remove `ENVIRONMENT` variable?
3. What to do with existing `hb_test_*` keys in database?
4. Merge or keep separate R2 buckets?
5. Should deployment maintain backward-compatible `deploy:dev`/`deploy:prod` scripts?

---

## Notes

- This is a simplification that removes environment isolation as a security feature
- All keys will work in all environments (currently: live keys blocked in dev, test keys blocked in prod)
- Consider if this aligns with security requirements
- May want to keep environment logging for operational visibility even without functional differences
