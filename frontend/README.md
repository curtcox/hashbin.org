# HashBin.org Frontend

This directory contains the frontend web interface for HashBin.org.

## Overview

The frontend is built using vanilla HTML, CSS, and JavaScript (ES6+ modules) with no build step required. It integrates with:

- **Clerk JavaScript SDK** for OAuth authentication (Google, Apple, Microsoft, GitHub)
- **HashBin.org API** (Cloudflare Workers backend) for balance, content operations, and user management

## Structure

```
frontend/
├── index.html              # Landing page
├── upload.html             # Content upload (protected)
├── dashboard.html          # User dashboard (protected)
├── retrieve.html           # Content retrieval (public)
├── deposit.html            # Add funds (protected)
├── css/
│   ├── base.css           # CSS variables, reset, typography
│   ├── layout.css         # Grid, flexbox, responsive layouts
│   ├── components.css     # Buttons, forms, cards, alerts
│   └── auth.css           # Authentication UI components
└── js/
    ├── app.js             # Main application entry point
    ├── auth.js            # Clerk SDK integration
    ├── auth-gate.js       # Protected page middleware
    └── utils.js           # Utility functions
```

## Configuration

### Clerk Publishable Key

The Clerk publishable key must be configured in each HTML file. Replace the placeholder:

```javascript
window.CLERK_PUBLISHABLE_KEY = 'YOUR_CLERK_PUBLISHABLE_KEY';
```

With your actual Clerk publishable key:
- Development: `pk_test_...`
- Production: `pk_live_...`

### Backend API

The frontend expects the backend API to be accessible at the same origin. For development:

- Backend Worker: `http://localhost:8787` (via `wrangler dev`)
- Frontend: Served via the same Worker or via a local server

## Features

### Implemented

- ✅ **Authentication UI**
  - Sign In button for unauthenticated users
  - User info display (avatar, name, OAuth provider icon)
  - Balance display in header
  - Sign Out button
  - Auth state management with Clerk SDK

- ✅ **Protected Pages**
  - Auth gate for upload, dashboard, and deposit pages
  - Automatic redirect to landing page if not authenticated
  - Session persistence across page refreshes

- ✅ **Balance Display**
  - Real-time balance fetching from `/api/balance`
  - Formatted as dollars (e.g., "$12.50")
  - Special handling for $0.00 balance with "Add funds" link
  - Error handling with retry

- ✅ **Responsive Design**
  - Mobile-friendly navigation
  - Responsive grid layouts
  - Touch-friendly buttons and forms

### Not Yet Implemented

- ⏳ **Content Upload** (Phase 2)
  - 256t hash generation
  - File upload to R2
  - Retention duration selection

- ⏳ **Content Retrieval** (Phase 2)
  - Hash-based content download
  - Content verification

- ⏳ **Payment Integration** (Phase 4)
  - Stripe checkout for deposits
  - Payment history display

## Usage

### Protected Pages

Pages that require authentication use the auth gate:

```html
<script type="module">
  import { requireAuth } from './js/auth-gate.js';
  
  // Protect this page
  requireAuth();
</script>
```

### Balance Display

To fetch and display balance:

```javascript
import { authenticatedFetch, formatBalance } from './js/utils.js';

const response = await authenticatedFetch('/api/balance');
const data = await response.json();
const formatted = formatBalance(data.balance_cents);
```

### Auth State

To check current auth state:

```javascript
import { getAuthState } from './js/auth.js';

const authState = await getAuthState();
if (authState.authenticated) {
  console.log('User:', authState.user);
}
```

## Development

### Local Development

1. Start the backend worker:
   ```bash
   npm run dev
   ```

2. Access the frontend at `http://localhost:8787`

### Testing

Manual testing checklist:
- [ ] Sign in with Google/Apple/Microsoft
- [ ] View balance in header
- [ ] Navigate between pages
- [ ] Sign out
- [ ] Try accessing protected pages without auth
- [ ] Verify session persists across page refresh

## Deployment

The frontend is designed to be deployed via:

1. **Cloudflare Pages** (recommended)
   - Automatic deployment from `frontend/` directory
   - Environment variables for Clerk key injection
   - Connected to same domain as API

2. **Cloudflare Workers Assets** (alternative)
   - Serve static files from Worker
   - Configured via `wrangler.toml`

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

ES6 modules and modern JavaScript features are used without transpilation.

## Accessibility

- Semantic HTML5 elements
- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly
- Focus visible states

## Security

- Clerk publishable key is safe to expose (not a secret)
- Session tokens sent via Authorization header only
- No sensitive data in localStorage or sessionStorage
- HTTPS enforced in production
- CSRF protection via Clerk

## Next Steps

See `todo/login.md` for the complete login implementation plan and `todo/frontend_ui.md` for future frontend features.
