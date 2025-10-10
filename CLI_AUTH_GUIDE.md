# CLI Authentication Guide - Recoder Package

## 🎯 Overview
 
The `recoder` CLI package authenticates users to **recoder.xyz** (your website) so they can use CLI commands from their terminal with their account quota, plan, and preferences synced across all platforms.

---

## 🔄 Authentication Flow Architecture

### High-Level Flow

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│                 │         │                  │         │                 │
│  User Terminal  │◄───────►│  recoder.xyz     │◄───────►│   Database      │
│  (CLI Package)  │         │  (Website API)   │         │   (Users/Auth)  │
│                 │         │                  │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

---

## 🚀 Authentication Methods

You already have **4 authentication methods** implemented! Here's how each works:

### 1. **Web-Based OAuth Flow** (Recommended for Desktop Users)

**How it works:**
```
1. User runs: recoder auth login --web
2. CLI opens browser → https://recoder.xyz/auth/cli
3. User signs in on website (GitHub/Google/Email)
4. Website redirects to: http://localhost:8080/auth/callback?code=ABC123
5. CLI exchanges code for access token
6. User is authenticated!
```

**User Experience:**
```bash
$ recoder auth login --web

🔐 RECODER - User Authentication
🌐 Authenticating via recoder.xyz...
🌐 Opening browser for authentication...
⏳ Waiting for authentication in browser...

✅ Successfully authenticated via recoder.xyz!
📧 User: john@example.com
📋 Plan: PRO
🔒 Scopes: cli:full, profile
🔄 Session synced across all platforms
🎉 You can now use the CLI with your recoder.xyz account!
```

**Implementation (Already Exists):**
- `AuthService.authenticateWithWeb()` in `/packages/cli/src/services/auth-service.ts`
- Starts local callback server on port 8080
- Implements OAuth 2.0 Authorization Code flow
- Stores session in `~/.recoder/auth.json`

---

### 2. **Device Flow** (For Headless/SSH Servers)

**How it works:**
```
1. User runs: recoder auth login --device-flow
2. CLI requests device code from website API
3. CLI shows: "Visit recoder.xyz/device and enter code: ABCD-1234"
4. User visits website on another device, enters code
5. CLI polls website API every 5 seconds
6. When user authorizes, CLI receives token
```

**User Experience:**
```bash
$ recoder auth login --device-flow

🔐 RECODER - User Authentication
📱 Initiating device flow authentication...

🔐 Device Authorization Required
1. Open this URL in your browser: https://recoder.xyz/device
2. Enter this code: WXYZ-5678

Or visit: https://recoder.xyz/device?code=WXYZ-5678

⏳ Waiting for authorization...
(This will expire in 15 minutes)

✅ Device authorized successfully!
👤 Logged in as: john@example.com
📋 Plan: PRO
🎉 Your session is now synced across all platforms!
```

**Implementation (Already Exists):**
- `AuthService.authenticateWithDeviceFlow()` in `/packages/cli/src/services/auth-service.ts`
- Implements OAuth 2.0 Device Authorization Grant (RFC 8628)
- Perfect for SSH sessions, CI/CD pipelines, Docker containers

---

### 3. **API Key Authentication** (For Automation & Scripts)

**How it works:**
```
1. User generates API key on website: https://recoder.xyz/settings/api-keys
2. User runs: recoder auth login --api-key rcli_abc123xyz789
3. CLI validates key with website API
4. User is authenticated!
```

**User Experience:**
```bash
# First, generate API key on website
$ open https://recoder.xyz/settings/api-keys

# Then authenticate with CLI
$ recoder auth login --api-key rcli_8a7f92b3_1704564000000_9f2c8e4a12b5_ab12cd34

🔐 RECODER - User Authentication
🔑 Authenticating with API key...

✅ API key authentication successful!
👤 Authenticated as: john@example.com
📋 Plan: PRO
🔒 Scopes: cli:full, profile
🎉 Your session is now active!
```

**Implementation (Already Exists):**
- `AuthService.authenticateWithApiKey()` in `/packages/cli/src/services/auth-service.ts`
- API key format: `rcli_{userId}_{timestamp}_{random}_{checksum}`
- Validates against website API: `POST /api/auth/cli` with `action: validate_token`
- Long-lived tokens (1 year expiration)

**API Key Management Commands:**
```bash
# Generate new API key
recoder auth keys --generate --name "Production Server"

# List all API keys
recoder auth keys --list

# Revoke API key
recoder auth keys --revoke <keyId>
```

---

### 4. **Traditional Email/Password** (Legacy Support)

**How it works:**
```
1. User runs: recoder auth login
2. CLI prompts for email and password
3. CLI sends credentials to website API
4. Website validates and returns token
5. User is authenticated!
```

**User Experience:**
```bash
$ recoder auth login

🔐 RECODER - User Authentication

Email: john@example.com
Password: ********

🔍 Authenticating john@example.com...

✅ Successfully logged in as john@example.com
📋 Plan: PRO
💰 Subscription: PRO ($49/month)
📊 Usage: 1234/10000 requests
💳 Status: ACTIVE

🌐 Connected platforms: cli, web
🎉 Your session is now synced across all recoder.xyz platforms!
```

**Implementation (Already Exists):**
- `BackendClient.authenticate()` in CLI backend client
- Sends POST to `/api/auth/login` on website
- Returns session token stored in `~/.recoder/auth.json`

---

## 🔧 Website API Endpoints Required

Your CLI expects these endpoints on **recoder.xyz**:

### 1. OAuth Authorization Endpoint
```
GET https://recoder.xyz/api/auth/cli
Query params:
  - client_id: "recoder-cli"
  - redirect_uri: "http://localhost:8080/auth/callback"
  - response_type: "code"
  - state: "random_state_string"
  - scope: "cli:full profile"
```

### 2. Token Exchange Endpoint
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "exchange_code",
  "grant_type": "authorization_code",
  "client_id": "recoder-cli",
  "code": "ABC123...",
  "redirect_uri": "http://localhost:8080/auth/callback"
}

Response: {
  "success": true,
  "access_token": "token...",
  "refresh_token": "refresh...",
  "expires_at": "2024-12-31T23:59:59Z",
  "user_id": "user-123",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "quota": {
      "requests_remaining": 8766,
      "requests_limit": 10000,
      "reset_date": "2024-02-01T00:00:00Z"
    }
  }
}
```

### 3. Device Flow Initiation
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "device_flow",
  "client_id": "recoder-cli",
  "scope": "cli:full profile"
}

Response: {
  "success": true,
  "device_code": "device_code_abc123",
  "user_code": "WXYZ-5678",
  "verification_uri": "https://recoder.xyz/device",
  "verification_uri_complete": "https://recoder.xyz/device?code=WXYZ-5678",
  "expires_in": 900,  // 15 minutes
  "interval": 5       // Poll every 5 seconds
}
```

### 4. Device Flow Polling
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "device_token",
  "client_id": "recoder-cli",
  "device_code": "device_code_abc123",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}

Response (pending):
{
  "success": false,
  "error": "authorization_pending"
}

Response (approved):
{
  "success": true,
  "access_token": "token...",
  "refresh_token": "refresh...",
  "expires_at": "...",
  "user_id": "user-123",
  "user": { ... }
}
```

### 5. API Key Validation
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "validate_token",
  "token": "rcli_8a7f92b3_1704564000000_9f2c8e4a12b5_ab12cd34"
}

Response: {
  "success": true,
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "quota": { ... }
  }
}
```

### 6. Token Refresh
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "refresh_token",
  "refresh_token": "refresh_token_here",
  "client_id": "recoder-cli"
}

Response: {
  "success": true,
  "access_token": "new_token...",
  "refresh_token": "new_refresh...",
  "expires_at": "..."
}
```

### 7. Token Revocation (Logout)
```
POST https://recoder.xyz/api/auth/cli
Body: {
  "action": "revoke_token",
  "token": "access_token_here"
}

Response: {
  "success": true
}
```

---

## 📁 Session Storage

Sessions are stored locally at: `~/.recoder/auth.json`

**File Structure:**
```json
{
  "user_id": "user-123",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": "2024-12-31T23:59:59.000Z",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "quota": {
      "requests_remaining": 8766,
      "requests_limit": 10000,
      "reset_date": "2024-02-01T00:00:00Z"
    }
  },
  "api_key": null,
  "platform_connection": {
    "web_session_id": "session-abc123",
    "router_session_id": "router-xyz789",
    "last_sync": "2024-01-15T10:30:00.000Z"
  }
}
```

**Security:**
- File permissions: `0600` (read/write owner only)
- Sensitive data encrypted at rest
- Automatic cleanup on logout

---

## 🔐 Security Features

### 1. **State Parameter** (CSRF Protection)
- Random state generated for OAuth flow
- Validated in callback to prevent CSRF attacks

### 2. **Token Expiration**
- Access tokens expire in 30 days
- Automatic refresh using refresh tokens
- CLI checks expiration before each API call

### 3. **Secure Storage**
- Auth file has 0600 permissions (owner-only access)
- No plaintext passwords stored
- API keys validated server-side

### 4. **Rate Limiting**
Built into the CLI and API:
- FREE: 60 requests/minute
- PRO: 300 requests/minute
- ENTERPRISE: 1000 requests/minute

### 5. **Session Management**
```bash
# View all active sessions
recoder auth sessions --list

# Revoke specific session
recoder auth sessions --revoke <deviceId>

# Revoke all other sessions
recoder auth sessions --revoke-all
```

---

## 📊 User Commands

### Authentication
```bash
# Login (interactive)
recoder auth login

# Login with web OAuth (recommended)
recoder auth login --web

# Login with device flow (headless)
recoder auth login --device-flow

# Login with API key
recoder auth login --api-key rcli_...

# Check authentication status
recoder auth status

# Sync session with backend
recoder auth status --sync

# Logout
recoder auth logout

# Logout from all platforms
recoder auth logout --all-platforms
```

### Account Management
```bash
# Create new account
recoder auth register

# View usage analytics
recoder auth usage

# Detailed usage breakdown
recoder auth usage --detailed

# Upgrade subscription
recoder auth upgrade

# Upgrade to specific plan
recoder auth upgrade --plan pro
```

### API Key Management
```bash
# List all API keys
recoder auth keys --list

# Generate new API key
recoder auth keys --generate --name "My Server"

# Generate with specific scopes
recoder auth keys --generate --name "CI/CD" --scopes "cli:full,generate"

# Revoke API key
recoder auth keys --revoke <keyId>
```

### Session Management
```bash
# List active sessions
recoder auth sessions --list

# Revoke specific session
recoder auth sessions --revoke <deviceId>

# Revoke all other sessions
recoder auth sessions --revoke-all
```

---

## 🎨 User Experience Best Practices

### 1. **First-Time User Flow**
```bash
$ recoder generate "a React app"

⚠️  You are not logged in!
💡 Login to access your quota, plans, and sync across devices

Choose authentication method:
  1. Login with recoder.xyz (recommended) 
  2. Login with API key
  3. Use device flow (for SSH/headless)
  4. Continue as guest (limited features)

> 1

🌐 Opening recoder.xyz for authentication...
```

### 2. **Quota Warnings**
```bash
$ recoder generate "another app"

⚠️  Quota Warning: 95% used (9,500/10,000 requests)
💡 Upgrade your plan to continue without limits
   Run: recoder auth upgrade --plan pro
```

### 3. **Session Expiration**
```bash
$ recoder generate "app"

⚠️  Your session has expired
🔄 Refreshing automatically...
✅ Session refreshed successfully
▶️  Continuing with your request...
```

### 4. **Offline Mode**
```bash
$ recoder auth status

⚠️  Backend Connection: Offline - using cached session data
💡 You can still use the CLI, but quota won't sync
   Check your internet connection to enable real-time sync
```

---

## 🔧 Implementation Checklist

### ✅ Already Implemented (CLI Side)
- [x] OAuth Authorization Code flow
- [x] Device authorization flow (RFC 8628)
- [x] API key authentication
- [x] Email/password authentication
- [x] Local session storage (~/.recoder/auth.json)
- [x] Secure file permissions (0600)
- [x] Automatic token refresh
- [x] Session validation
- [x] Rate limiting awareness
- [x] Cross-platform session sync
- [x] Session management commands
- [x] API key management commands
- [x] Usage analytics display
- [x] Subscription upgrade flow

### 🔨 Need to Implement (Website Side)

Your website needs these API endpoints:

#### Required Endpoints:
```
POST /api/auth/cli
  - Actions: exchange_code, device_flow, device_token, 
             validate_token, refresh_token, revoke_token

GET  /device
  - Device authorization page (user enters code)

GET  /auth/cli  
  - OAuth authorization page

GET  /settings/api-keys
  - API key management page

POST /api/auth/keys/generate
  - Generate new API key

POST /api/auth/keys/revoke
  - Revoke API key

GET  /api/auth/sessions
  - List user sessions

POST /api/auth/sessions/revoke
  - Revoke session
```

#### Database Tables Needed:
```sql
-- OAuth authorization codes (temporary)
CREATE TABLE auth_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT,
  scope TEXT,
  expires_at TIMESTAMP,
  used BOOLEAN DEFAULT FALSE
);

-- Device flow codes (temporary)
CREATE TABLE device_codes (
  device_code TEXT PRIMARY KEY,
  user_code TEXT UNIQUE NOT NULL,
  user_id TEXT,
  client_id TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMP,
  status TEXT DEFAULT 'pending', -- pending, approved, denied
  created_at TIMESTAMP DEFAULT NOW()
);

-- API keys
CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT,
  scopes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE
);

-- Sessions
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  platform TEXT, -- cli, web, extension, router
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE
);
```

---

## 🚀 Recommended Implementation Steps

### Phase 1: Basic OAuth (Week 1)
1. ✅ Implement POST `/api/auth/cli` endpoint
2. ✅ Add OAuth authorization page at `/auth/cli`
3. ✅ Implement authorization code exchange
4. ✅ Test with CLI: `recoder auth login --web`

### Phase 2: Device Flow (Week 2)
1. ✅ Implement device flow initiation
2. ✅ Add device authorization page at `/device`
3. ✅ Implement device flow polling
4. ✅ Test with CLI: `recoder auth login --device-flow`

### Phase 3: API Keys (Week 3)
1. ✅ Add API key generation endpoint
2. ✅ Add API key management page
3. ✅ Implement API key validation
4. ✅ Test with CLI: `recoder auth login --api-key`

### Phase 4: Session Management (Week 4)
1. ✅ Implement session listing endpoint
2. ✅ Implement session revocation
3. ✅ Add cross-platform session sync
4. ✅ Test: `recoder auth sessions`

---

## 📝 Example Website API Implementation

Here's a basic Express.js implementation for the `/api/auth/cli` endpoint:

```typescript
// /api/auth/cli/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthCode, validateAuthCode } from '@/lib/auth-codes';
import { generateDeviceCode, pollDeviceCode } from '@/lib/device-flow';
import { validateApiKey } from '@/lib/api-keys';
import { generateTokens, refreshTokens, revokeToken } from '@/lib/tokens';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'exchange_code': {
      // OAuth code → tokens
      const { code, client_id, redirect_uri } = body;
      
      const authCode = await validateAuthCode(code);
      if (!authCode || authCode.client_id !== client_id) {
        return NextResponse.json(
          { success: false, error: 'Invalid authorization code' },
          { status: 400 }
        );
      }

      const tokens = await generateTokens(authCode.user_id, client_id);
      const user = await getUserById(authCode.user_id);
      const quota = await getUserQuota(authCode.user_id);

      return NextResponse.json({
        success: true,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        user_id: user.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.plan,
          quota: {
            requests_remaining: quota.remaining,
            requests_limit: quota.limit,
            reset_date: quota.reset_date
          }
        }
      });
    }

    case 'device_flow': {
      // Initiate device flow
      const { client_id, scope } = body;
      const deviceFlow = await generateDeviceCode(client_id, scope);

      return NextResponse.json({
        success: true,
        device_code: deviceFlow.device_code,
        user_code: deviceFlow.user_code,
        verification_uri: `${process.env.NEXT_PUBLIC_URL}/device`,
        verification_uri_complete: `${process.env.NEXT_PUBLIC_URL}/device?code=${deviceFlow.user_code}`,
        expires_in: 900, // 15 minutes
        interval: 5 // Poll every 5 seconds
      });
    }

    case 'device_token': {
      // Poll for device authorization
      const { device_code, client_id } = body;
      const result = await pollDeviceCode(device_code);

      if (result.status === 'pending') {
        return NextResponse.json({
          success: false,
          error: 'authorization_pending'
        });
      }

      if (result.status === 'approved') {
        const tokens = await generateTokens(result.user_id, client_id);
        const user = await getUserById(result.user_id);
        const quota = await getUserQuota(result.user_id);

        return NextResponse.json({
          success: true,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          user_id: user.id,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            subscription_plan: user.plan,
            quota: { ... }
          }
        });
      }

      return NextResponse.json({
        success: false,
        error: result.status // denied, expired
      }, { status: 400 });
    }

    case 'validate_token': {
      // Validate API key or access token
      const { token } = body;
      
      const validation = await validateApiKey(token);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: 'Invalid token' },
          { status: 401 }
        );
      }

      const user = await getUserById(validation.user_id);
      const quota = await getUserQuota(validation.user_id);

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.plan,
          quota: { ... }
        }
      });
    }

    case 'refresh_token': {
      // Refresh access token
      const { refresh_token, client_id } = body;
      
      const tokens = await refreshTokens(refresh_token, client_id);
      if (!tokens) {
        return NextResponse.json(
          { success: false, error: 'Invalid refresh token' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at
      });
    }

    case 'revoke_token': {
      // Revoke token (logout)
      const { token } = body;
      await revokeToken(token);

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json(
        { success: false, error: 'Unknown action' },
        { status: 400 }
      );
  }
}

export async function GET(request: NextRequest) {
  // OAuth authorization endpoint
  const { searchParams } = new URL(request.url);
  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope');

  // Check if user is logged in
  const session = await getSession(request);
  if (!session) {
    // Redirect to login page
    return NextResponse.redirect(`/auth/signin?callbackUrl=/api/auth/cli?${searchParams.toString()}`);
  }

  // Generate authorization code
  const code = await generateAuthCode(
    session.user.id,
    client_id!,
    redirect_uri!,
    scope!
  );

  // Redirect back to CLI with code
  const redirectUrl = new URL(redirect_uri!);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', state!);

  return NextResponse.redirect(redirectUrl.toString());
}
```

---

## 🎉 Conclusion

Your CLI authentication system is **already well-implemented**! You have:

✅ Multiple authentication methods (OAuth, device flow, API keys, email/password)
✅ Secure token storage and refresh logic
✅ Session management across platforms
✅ Rate limiting and quota awareness
✅ User-friendly CLI commands

**What you need:**
1. Implement the website API endpoints listed above
2. Create the device authorization page (`/device`)
3. Add API key management UI on website
4. Test end-to-end with the CLI

The architecture is solid and follows OAuth 2.0 best practices! 🚀
