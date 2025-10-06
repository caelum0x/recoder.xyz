# CLI Authentication Flows - Visual Guide

## 🌐 Method 1: Web-Based OAuth Flow (Recommended)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ USER TERMINAL                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘

$ recoder auth login --web

    │
    │ 1. Generate state & start local server
    ▼
┌─────────────────────────┐
│  CLI (AuthService)      │
│  - Port 8080 listening  │
│  - State: abc123...     │
└──────────┬──────────────┘
           │
           │ 2. Open browser
           │ https://recoder.xyz/api/auth/cli?
           │   client_id=recoder-cli
           │   redirect_uri=http://localhost:8080/auth/callback
           │   state=abc123...
           │   scope=cli:full profile
           ▼
┌─────────────────────────────────────┐
│  BROWSER → recoder.xyz              │
│  ┌───────────────────────────────┐  │
│  │ 🔐 Sign in to Recoder         │  │
│  │                               │  │
│  │ [GitHub] [Google] [Discord]   │  │
│  │                               │  │
│  │ Or use email/password:        │  │
│  │ Email: ___________________    │  │
│  │ Password: _______________     │  │
│  │                               │  │
│  │ [  Sign In  ]                 │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ 3. User signs in
               ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Verify user credentials          │
│  - Generate auth code               │
│  - Store: code → user_id mapping    │
└──────────────┬──────────────────────┘
               │
               │ 4. Redirect with code
               │ http://localhost:8080/auth/callback?
               │   code=XYZ789...
               │   state=abc123...
               ▼
┌─────────────────────────┐
│  CLI Callback Server    │
│  - Verify state matches │
│  - Extract code         │
│  - Close server         │
└──────────┬──────────────┘
           │
           │ 5. Exchange code for tokens
           │ POST https://recoder.xyz/api/auth/cli
           │ {
           │   action: "exchange_code",
           │   code: "XYZ789...",
           │   client_id: "recoder-cli"
           │ }
           ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Validate code                    │
│  - Generate access_token            │
│  - Generate refresh_token           │
│  - Fetch user data & quota          │
└──────────────┬──────────────────────┘
               │
               │ 6. Return tokens + user data
               │ {
               │   access_token: "eyJhb...",
               │   refresh_token: "eyJhb...",
               │   user: { id, email, plan, quota }
               │ }
               ▼
┌─────────────────────────┐
│  CLI (AuthService)      │
│  - Save to ~/.recoder/  │
│  - Set permissions 0600 │
└──────────┬──────────────┘
           │
           ▼
    ✅ Authenticated!
    📧 User: john@example.com
    📋 Plan: PRO
    🎉 Ready to use CLI
```

---

## 📱 Method 2: Device Flow (Headless/SSH)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SSH SERVER / HEADLESS ENVIRONMENT                                            │
└──────────────────────────────────────────────────────────────────────────────┘

$ recoder auth login --device-flow

    │
    │ 1. Request device code
    │ POST https://recoder.xyz/api/auth/cli
    │ { action: "device_flow", client_id: "recoder-cli" }
    ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Generate device_code             │
│  - Generate user_code (WXYZ-5678)   │
│  - Store in database (pending)      │
└──────────────┬──────────────────────┘
               │
               │ 2. Return codes
               │ {
               │   device_code: "abc123...",
               │   user_code: "WXYZ-5678",
               │   verification_uri: "recoder.xyz/device",
               │   expires_in: 900
               │ }
               ▼
┌─────────────────────────┐
│  CLI Shows Instructions │
│                         │
│  🔐 Visit:              │
│  recoder.xyz/device     │
│                         │
│  🔢 Enter code:         │
│  WXYZ-5678              │
│                         │
│  ⏳ Waiting...          │
└──────────┬──────────────┘
           │
           │ 3. Start polling (every 5 sec)
           │ POST https://recoder.xyz/api/auth/cli
           │ { action: "device_token", device_code: "abc123..." }
           │
           ├─────────────────────────────────────────────────┐
           │                                                 │
           ▼                                                 │
┌─────────────────────────────────────┐                     │
│  Meanwhile, user opens browser...   │                     │
└─────────────────────────────────────┘                     │
                                                             │
    🌐 https://recoder.xyz/device                           │
           │                                                 │
           ▼                                                 │
┌─────────────────────────────────────┐                     │
│  BROWSER → recoder.xyz/device       │                     │
│  ┌───────────────────────────────┐  │                     │
│  │ 🔐 Device Authorization       │  │                     │
│  │                               │  │                     │
│  │ Enter the code shown in       │  │                     │
│  │ your terminal:                │  │                     │
│  │                               │  │                     │
│  │ [W][X][Y][Z]-[5][6][7][8]     │  │                     │
│  │                               │  │                     │
│  │ [  Continue  ]                │  │                     │
│  └───────────────────────────────┘  │                     │
└──────────────┬──────────────────────┘                     │
               │                                             │
               │ 4. User enters code                         │
               ▼                                             │
┌─────────────────────────────────────┐                     │
│  recoder.xyz Backend                │                     │
│  - Verify user_code                 │                     │
│  - Show authorization screen        │                     │
└──────────────┬──────────────────────┘                     │
               │                                             │
               ▼                                             │
┌─────────────────────────────────────┐                     │
│  BROWSER                            │                     │
│  ┌───────────────────────────────┐  │                     │
│  │ Authorize CLI Access?         │  │                     │
│  │                               │  │                     │
│  │ Recoder CLI wants to:         │  │                     │
│  │ • Access your account         │  │                     │
│  │ • Generate code               │  │                     │
│  │ • Use your quota              │  │                     │
│  │                               │  │                     │
│  │ [Deny]  [Authorize]           │  │                     │
│  └───────────────────────────────┘  │                     │
└──────────────┬──────────────────────┘                     │
               │                                             │
               │ 5. User clicks Authorize                    │
               ▼                                             │
┌─────────────────────────────────────┐                     │
│  recoder.xyz Backend                │                     │
│  - Update device_code status        │                     │
│  - Status: "approved"               │                     │
│  - Link to user_id                  │                     │
└─────────────────────────────────────┘                     │
                                                             │
                                                             │
           ┌─────────────────────────────────────────────────┘
           │
           │ 6. Next poll succeeds!
           │ Response: {
           │   success: true,
           │   access_token: "eyJhb...",
           │   refresh_token: "eyJhb...",
           │   user: { ... }
           │ }
           ▼
┌─────────────────────────┐
│  CLI (AuthService)      │
│  - Save tokens          │
│  - Stop polling         │
└──────────┬──────────────┘
           │
           ▼
    ✅ Device authorized!
    📧 User: john@example.com
    📋 Plan: PRO
    🎉 Ready to use CLI
```

---

## 🔑 Method 3: API Key Authentication

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Generate API Key on Website                                         │
└──────────────────────────────────────────────────────────────────────────────┘

    🌐 https://recoder.xyz/settings/api-keys
           │
           ▼
┌─────────────────────────────────────┐
│  BROWSER → Settings Page            │
│  ┌───────────────────────────────┐  │
│  │ 🔑 API Keys                   │  │
│  │                               │  │
│  │ Create New API Key            │  │
│  │ Name: [Production Server]    │  │
│  │ Scopes: ☑ cli:full           │  │
│  │         ☑ profile             │  │
│  │                               │  │
│  │ [  Generate Key  ]            │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ User clicks Generate
               ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Generate secure API key          │
│  - Format: rcli_{userId}_{ts}_...   │
│  - Hash and store in database       │
└──────────────┬──────────────────────┘
               │
               │ Return API key (show once!)
               ▼
┌─────────────────────────────────────┐
│  BROWSER                            │
│  ┌───────────────────────────────┐  │
│  │ ⚠️ Save this key securely!    │  │
│  │                               │  │
│  │ rcli_8a7f92b3_1704564000_... │  │
│  │                               │  │
│  │ [Copy to Clipboard]           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Use API Key in CLI                                                  │
└──────────────────────────────────────────────────────────────────────────────┘

$ recoder auth login --api-key rcli_8a7f92b3_1704564000_...

    │
    │ 1. Validate API key
    │ POST https://recoder.xyz/api/auth/cli
    │ {
    │   action: "validate_token",
    │   token: "rcli_8a7f92b3_..."
    │ }
    ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Parse API key format             │
│  - Verify checksum                  │
│  - Check if revoked                 │
│  - Fetch user data                  │
└──────────────┬──────────────────────┘
               │
               │ 2. Return user data
               │ {
               │   success: true,
               │   user: { id, email, plan, quota }
               │ }
               ▼
┌─────────────────────────┐
│  CLI (AuthService)      │
│  - Save API key         │
│  - Store user data      │
└──────────┬──────────────┘
           │
           ▼
    ✅ Authenticated!
    📧 User: john@example.com
    📋 Plan: PRO
    🎉 Ready to use CLI
```

---

## 🔄 Token Refresh Flow (Automatic)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Happens automatically before token expires                                   │
└──────────────────────────────────────────────────────────────────────────────┘

    User runs any command
    │
    ▼
┌─────────────────────────┐
│  CLI Command            │
│  $ recoder generate ... │
└──────────┬──────────────┘
           │
           │ Check token expiration
           ▼
┌─────────────────────────┐
│  AuthService            │
│  if (token expires soon)│
│    refreshSession()     │
└──────────┬──────────────┘
           │
           │ POST https://recoder.xyz/api/auth/cli
           │ {
           │   action: "refresh_token",
           │   refresh_token: "eyJhb..."
           │ }
           ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Validate refresh_token           │
│  - Generate new access_token        │
│  - Generate new refresh_token       │
└──────────────┬──────────────────────┘
               │
               │ Return new tokens
               │ {
               │   access_token: "new...",
               │   refresh_token: "new...",
               │   expires_at: "..."
               │ }
               ▼
┌─────────────────────────┐
│  AuthService            │
│  - Update stored tokens │
│  - Continue with command│
└──────────┬──────────────┘
           │
           ▼
    Command executes normally
    (User doesn't notice refresh)
```

---

## 🔒 Session Validation Flow

```
Every API request to recoder.xyz:

┌─────────────────────────┐
│  CLI Command            │
└──────────┬──────────────┘
           │
           │ Include auth header
           │ Authorization: Bearer eyJhb...
           ▼
┌─────────────────────────────────────┐
│  recoder.xyz API Middleware         │
│  - Extract token from header        │
│  - Verify JWT signature             │
│  - Check expiration                 │
│  - Load user from database          │
│  - Check plan & quota               │
└──────────────┬──────────────────────┘
               │
               ├─────────► Valid: Continue to API handler
               │
               └─────────► Invalid: Return 401 Unauthorized
```

---

## 📊 Cross-Platform Session Sync

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ User logs in via CLI → Session syncs to all platforms                       │
└──────────────────────────────────────────────────────────────────────────────┘

$ recoder auth login --web

    │
    │ After successful login
    ▼
┌─────────────────────────────────────┐
│  CLI Session Created                │
│  - access_token                     │
│  - user_id                          │
│  - platform: "cli"                  │
└──────────────┬──────────────────────┘
               │
               │ Trigger session sync
               │ POST /api/session/sync
               ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Create unified session record    │
│  - Link to user account             │
│  - Enable cross-platform access     │
└──────────┬─────────┬─────────┬──────┘
           │         │         │
           ▼         ▼         ▼
    ┌───────┐  ┌─────────┐  ┌──────────┐
    │  CLI  │  │   Web   │  │Extension │
    │ ✅ ON │  │  🔄 ON  │  │  🔄 ON   │
    └───────┘  └─────────┘  └──────────┘

User can now:
• Use CLI with full access
• Visit recoder.xyz (already logged in)
• Use VS Code extension (synced session)
• Use mobile app (synced session)
```

---

## 🚪 Logout Flow

```
$ recoder auth logout

    │
    │ 1. Revoke tokens
    │ POST https://recoder.xyz/api/auth/cli
    │ { action: "revoke_token", token: "..." }
    ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Mark access_token as revoked     │
│  - Mark refresh_token as revoked    │
│  - Update session status            │
│  - Disconnect platform: "cli"       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────┐
│  CLI (AuthService)      │
│  - Delete ~/.recoder/   │
│  - Clear memory         │
└──────────┬──────────────┘
           │
           ▼
    ✅ Logged out
    Other platforms still active


$ recoder auth logout --all-platforms

    │
    │ 1. Revoke ALL sessions
    │ POST /api/session/revoke-all
    ▼
┌─────────────────────────────────────┐
│  recoder.xyz Backend                │
│  - Revoke all access_tokens         │
│  - Revoke all refresh_tokens        │
│  - Clear all platform connections   │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌───────┐  ┌─────────┐  ┌──────────┐
    │  CLI  │  │   Web   │  │Extension │
    │ ❌ OFF│  │ ❌ OFF  │  │ ❌ OFF   │
    └───────┘  └─────────┘  └──────────┘

    ✅ Logged out from all platforms
```

---

## 🎯 Summary: Choose Your Auth Method

### Web OAuth (`--web`) - BEST for Desktop
✅ Most secure (no password in terminal)
✅ Familiar (sign in via browser)
✅ Supports social logins (GitHub, Google)
❌ Requires browser access

### Device Flow (`--device-flow`) - BEST for SSH/Servers
✅ Works without browser on same machine
✅ Perfect for headless environments
✅ Secure (code shown on screen only)
❌ Requires manual code entry

### API Key (`--api-key`) - BEST for CI/CD/Automation
✅ Simple, no user interaction
✅ Long-lived (1 year)
✅ Can be revoked anytime
❌ Need to manage key securely
❌ Must generate on website first

### Email/Password - LEGACY
✅ Works everywhere
✅ No external dependencies
❌ Less secure (password in terminal)
❌ No social login support
