# Key Management UI - Visual Guide

## Page Layouts

### 1. API Keys List Page (`/api-keys.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ HashBin    Upload  Retrieve  Docs                   [User Menu] │
└─────────────────────────────────────────────────────────────────┘

  API Keys (5/25)                           [Create New Key]
  Manage your API credentials for programmatic access

  ┌───────────────────────────────────────────────────────────────┐
  │ ⚠️ Approaching API Key Limit                                  │
  │ You have 23 of 25 keys. Consider revoking unused keys        │
  │ before creating new ones.                                     │
  └───────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────┐
  │ Name              | Prefix        | Status | Usage  | Last Used | Expires      │
  │───────────────────|───────────────|────────|────────|───────────|──────────────│
  │ Production API    | hb_live_abc.. | 🟢 Act | 1.2K   | 2 hrs ago | ⚠️ 15 days   │
  │                  | 📋            |        | req    |           |              │
  │───────────────────|───────────────|────────|────────|───────────|──────────────│
  │ Backup API        | hb_live_def.. | 🟢 Act | 42     | Never     | Jan 15, 2027 │
  │                  | 📋            |        | req    |           |              │
  │───────────────────|───────────────|────────|────────|───────────|──────────────│
  │ Old Key           | hb_live_ghi.. | 🔴 Exp | 3.4M   | 3 days    | Expired      │
  │ LIVE             | 📋            |        | req    | ago       |              │
  └───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────────

Empty State (when no keys exist):

  ┌───────────────────────────────────────────────────────────────┐
  │                              🔑                                │
  │                                                                │
  │                       No API Keys Yet                          │
  │                                                                │
  │   Create your first API key to start using the HashBin API    │
  │                    programmatically.                           │
  │                                                                │
  │                     [Create API Key]                           │
  └───────────────────────────────────────────────────────────────┘
```

### 2. Create API Key Page (`/api-keys-create.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ HashBin    Upload  Retrieve  Docs                   [User Menu] │
└─────────────────────────────────────────────────────────────────┘

  Dashboard › API Keys › Create

  Create API Key
  Generate a new API key for programmatic access to HashBin

  ┌───────────────────────────────────────────────────────────────┐
  │                                                                │
  │  Key Name *                                                    │
  │  [My API Key_______________________________________________]   │
  │  A descriptive name to help you identify this key (1-100)     │
  │                                                                │
  │  Expiration Date *                                             │
  │  [01/16/2027______]                                           │
  │  Maximum 5 years from today. Default is 1 year.               │
  │                                                                │
  │  [Create API Key]  [Cancel]                                    │
  │                                                                │
  └───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────────

One-Time Key Display Modal (after successful creation):

  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║  API Key Created Successfully                                  ║
  ║                                                                ║
  ║  Your API key has been created. Save it now - you won't be    ║
  ║  able to see it again!                                         ║
  ║                                                                ║
  ║  ┌────────────────────────────────────────────────────────┐  ║
  ║  │ hb_live_abc123def456ghi789jkl012mno345pqr678stu901vwx │  ║
  ║  └────────────────────────────────────────────────────────┘  ║
  ║                                                                ║
  ║  [📋 Copy to Clipboard]                                        ║
  ║                                                                ║
  ║  ┌────────────────────────────────────────────────────────┐  ║
  ║  │ ⚠️  Important: This is the only time you'll see this  │  ║
  ║  │     key. Make sure to copy it and store it securely   │  ║
  ║  │     before closing this window.                        │  ║
  ║  └────────────────────────────────────────────────────────┘  ║
  ║                                                                ║
  ║  ☐ I have saved this key securely                             ║
  ║                                                                ║
  ║                                          [Close] (disabled)    ║
  ╚═══════════════════════════════════════════════════════════════╝
```

### 3. API Key Detail Page (`/api-keys-detail.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ HashBin    Upload  Retrieve  Docs                   [User Menu] │
└─────────────────────────────────────────────────────────────────┘

  Dashboard › API Keys › Production API

  ┌───────────────────────────────────────────────────────────────┐
  │ ⚠️ Expiration Warning                                         │
  │ This API key will expire in 15 days on January 31, 2026.     │
  │ Consider creating a replacement key before expiration.        │
  └───────────────────────────────────────────────────────────────┘

  Production API ✏️

  ┌───────────────────────────────────────────────────────────────┐
  │                                                                │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐│
  │  │ Key ID           │  │ Status           │  │ Created      ││
  │  │ hb_live_abc... 📋│  │ 🟢 Active        │  │ Jan 16, 2025 ││
  │  └──────────────────┘  └──────────────────┘  └──────────────┘│
  │                                                                │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐│
  │  │ Total Requests   │  │ Last Used        │  │ Expires      ││
  │  │ 1.2K requests    │  │ 2 hours ago      │  │ Jan 16, 2027 ││
  │  └──────────────────┘  └──────────────────┘  └──────────────┘│
  │                                                                │
  │  ┌──────────────────┐                                         │
  │  │ Expires          │                                         │
  │  │ Jan 31, 2026     │                                         │
  │  └──────────────────┘                                         │
  │                                                                │
  │  [🔓 Reveal Key]  [🗑️ Revoke Key]                            │
  │                                                                │
  └───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────────

Edit Name Inline (when clicking ✏️):

  [Production API_______________] ✓ ✕

───────────────────────────────────────────────────────────────────

Reveal Key Modal (after clicking 🔓 Reveal Key):

  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║  API Key Revealed                                              ║
  ║                                                                ║
  ║  Here is your full API key:                                    ║
  ║                                                                ║
  ║  ┌────────────────────────────────────────────────────────┐  ║
  ║  │ hb_live_abc123def456ghi789jkl012mno345pqr678stu901vwx │  ║
  ║  └────────────────────────────────────────────────────────┘  ║
  ║                                                                ║
  ║  [📋 Copy to Clipboard]                                        ║
  ║                                                                ║
  ║                                                     [Close]    ║
  ╚═══════════════════════════════════════════════════════════════╝

───────────────────────────────────────────────────────────────────

Revoke Confirmation Modal (after clicking 🗑️ Revoke Key):

  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║  Revoke API Key?                                               ║
  ║                                                                ║
  ║  Are you sure you want to revoke "Production API"             ║
  ║  (hb_live_abc...)?                                            ║
  ║                                                                ║
  ║  This action cannot be undone. Any applications using this     ║
  ║  key will immediately lose access.                             ║
  ║                                                                ║
  ║                              [Cancel]  [Revoke Key]           ║
  ╚═══════════════════════════════════════════════════════════════╝
```

### 4. Dashboard Integration (`/dashboard.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ HashBin    Upload  Retrieve  Docs                   [User Menu] │
└─────────────────────────────────────────────────────────────────┘

  Dashboard

  ┌───────────────────────────────────────────────────────────────┐
  │ Account Balance                                                │
  │                                                                │
  │                         $12.50                                 │
  │                   Current account balance                      │
  └───────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────┐
  │ Quick Actions                                                  │
  │                                                                │
  │ [Upload Content] [Retrieve Content] [Add Funds]                │
  └───────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────┐
  │ 🔑 API Keys                                                    │
  │                                                                │
  │ Manage your API credentials for programmatic access           │
  │                                                                │
  │ 5 / 25 keys                                                    │
  │ 20 slots available                        [Manage Keys]        │
  └───────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Status Indicators
- **Active (Green)**: `#10b981` (emerald-500)
- **Expired (Red)**: `#ef4444` (red-500)
- **Warning (Yellow)**: `#f59e0b` (amber-500)

### Alerts
- **Info**: Blue border and background
- **Success**: Green border and background
- **Warning**: Yellow border and background
- **Error**: Red border and background

## Interaction States

### Copy Button Feedback
```
Initial:    📋
Copying:    📋 (pulsing)
Success:    ✓ (green, 3 seconds)
After 3s:   📋 (back to initial)
```

### Button Loading States
```
Initial:    [Create API Key]
Loading:    [●●●] (spinner)
Success:    [✓ Created]
Error:      [✕ Failed]
```

### Form Validation
```
Valid:      [Input text________________] (blue border on focus)
Invalid:    [Input text________________] (red border)
            ✕ Error message in red below
```

## Toast Notifications

```
┌────────────────────────────────┐
│ ✓ Copied to clipboard          │
└────────────────────────────────┘
  (Appears bottom-right, auto-dismiss after 3s)

┌────────────────────────────────┐
│ ✓ API key created successfully │
└────────────────────────────────┘
  (Green toast)

┌────────────────────────────────┐
│ ✕ Failed to create API key     │
└────────────────────────────────┘
  (Red toast)

┌────────────────────────────────────────────────────────┐
│ ⚠️ Please re-authenticate to reveal keys              │
│    (session must be less than 5 minutes old)          │
└────────────────────────────────────────────────────────┘
  (Yellow toast, 5 second duration)
```

## Responsive Breakpoints

### Desktop (1024px+)
- Full table layout
- All columns visible
- Side-by-side forms
- Wide modals

### Tablet (768-1023px)
- Slightly condensed table
- Stacked form groups
- Medium modals

### Mobile (<768px)
- Horizontal scrolling table
- Fully stacked layout
- Full-width modals
- Simplified navigation

## Accessibility Features

### Keyboard Navigation
- **Tab**: Move between interactive elements
- **Enter**: Activate buttons, submit forms
- **Escape**: Close modals, cancel edits
- **Arrow Keys**: Navigate select dropdowns

### Screen Reader Support
- All interactive elements have ARIA labels
- Status announcements for create/revoke/edit
- Focus management in modals
- Descriptive alt text for icons

### Visual Indicators
- Focus rings on all interactive elements
- High contrast mode support
- Color + icon for status (not color alone)
- Loading spinners have aria-label="Loading"

## Animation Timing

- **Modal Open/Close**: 300ms ease-out
- **Toast Slide In**: 300ms ease-out
- **Toast Slide Out**: 300ms ease-out
- **Copy Feedback**: 3000ms (3 seconds)
- **Spinner Rotation**: 600ms linear infinite
- **Button Hover**: 200ms ease

## Loading States

### List Page
```
┌───────────────────────────────────┐
│ ●   Loading API keys...           │
└───────────────────────────────────┘
```

### Detail Page
```
┌───────────────────────────────────┐
│ ●   Loading API key details...    │
└───────────────────────────────────┘
```

### Button States
```
[Create API Key]        → Initial
[●●● Loading...]        → Loading
[✓ Created]            → Success
```

## Error States

### Network Error
```
┌───────────────────────────────────────────────┐
│ ✕ Failed to load API keys                     │
│   Network error. Please try again.            │
│   [Retry]                                      │
└───────────────────────────────────────────────┘
```

### 404 Not Found
```
┌───────────────────────────────────────────────┐
│ ✕ API key not found                           │
│   [Back to API Keys]                           │
└───────────────────────────────────────────────┘
```

### Fresh Auth Required
```
┌────────────────────────────────────────────────────┐
│ ⚠️ Please re-authenticate to reveal keys          │
│    Your session must be less than 5 minutes old   │
│    [Re-authenticate]                               │
└────────────────────────────────────────────────────┘
```

### Rate Limited
```
┌────────────────────────────────────────────────────┐
│ ⚠️ Rate limit exceeded                             │
│    Maximum 3 reveals per hour. Try again in 45m   │
└────────────────────────────────────────────────────┘
```

This visual guide provides a complete overview of what each page looks like and how users interact with the Key Management UI.
