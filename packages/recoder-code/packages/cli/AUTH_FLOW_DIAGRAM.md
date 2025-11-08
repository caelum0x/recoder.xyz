# Recoder.xyz Authentication Flow

## Yes! All authentication goes through Recoder.xyz

When users run `recoder-code auth login`, the CLI communicates with **https://recoder.xyz** (or `RECODER_API_URL` if set) for verification.

## API Base URL

```typescript
const RECODER_API_BASE = process.env['RECODER_API_URL'] || 'https://recoder.xyz';
const CLIENT_ID = 'recoder-code';
```

## Authentication Methods & Flows

### 1. Web OAuth Flow (Default)

```
┌─────────────┐                                    ┌──────────────┐
│             │  1. Opens browser                  │              │
│  User runs  │────────────────────────────────────>│  Browser     │
│  auth login │                                    │              │
│             │                                    └──────────────┘
└─────────────┘                                            │
      │                                                    │
      │ 2. Starts local                                   │ 3. User logs in
      │    callback server                                │    at recoder.xyz
      │    on port 8080                                   │
      │                                                    ▼
      │                                    ┌───────────────────────────┐
      │                                    │  https://recoder.xyz      │
      │                                    │  /api/auth/cli            │
      │                                    │                           │
      │                                    │  • User authenticates     │
      │                                    │  • Verifies credentials   │
      │                                    │  • Generates auth code    │
      │                                    └───────────────────────────┘
      │                                                    │
      │ 4. Receives auth code                            │ 5. Redirects back
      │    via callback                                   │    with code
      ◀────────────────────────────────────────────────────
      │
      │ 6. Exchanges code for tokens
      │    POST https://recoder.xyz/api/auth/cli
      │    { action: 'exchange_code', code: '...' }
      │
      ▼
┌─────────────────────────────────────┐
│ Recoder.xyz returns:                │
│  • access_token                     │
│  • refresh_token                    │
│  • expires_at                       │
│  • user { id, email, name, plan }  │
└─────────────────────────────────────┘
      │
      │ 7. Stores credentials locally
      ▼
┌─────────────────────────────────────┐
│ ~/.recoder/auth.json                │
│ (permissions: 0600)                 │
└─────────────────────────────────────┘
```

**API Endpoints Used:**
- `GET https://recoder.xyz/api/auth/cli?response_type=code&client_id=recoder-code&redirect_uri=http://localhost:8080/auth/callback&state=...&scope=cli:full%20profile`
- `POST https://recoder.xyz/api/auth/cli` (exchange code for tokens)

### 2. Device Flow (for SSH/Headless)

```
┌─────────────┐
│             │  1. Request device code
│  User runs  │─────────────────────────────────────────────────────────┐
│  auth login │                                                         │
│  --device   │                                                         ▼
└─────────────┘                               ┌────────────────────────────────┐
      │                                       │  POST https://recoder.xyz      │
      │                                       │  /api/auth/cli                 │
      │                                       │                                │
      │                                       │  action: 'device_flow'         │
      │                                       │  client_id: 'recoder-code'     │
      │                                       │  scope: 'cli:full profile'     │
      │                                       └────────────────────────────────┘
      │                                                         │
      │ 2. Receives device code                                │
      │    & verification URL                                  ▼
      ◀────────────────────────────────────────────────────────
      │                                       Returns:
      │                                       • device_code
      │                                       • user_code (e.g., "ABC-123")
      │                                       • verification_uri
      │                                       • verification_uri_complete
      │                                       • interval (polling interval)
      │
      │ 3. Shows user:
      │    "Visit: https://recoder.xyz/device"
      │    "Enter code: ABC-123"
      │
      │ 4. User visits URL in browser
      │    and enters code
      │                                       ┌────────────────────────────────┐
      │                                       │  User at recoder.xyz:          │
      │                                       │  • Visits verification URL     │
      │                                       │  • Enters user_code            │
      │                                       │  • Authorizes CLI access       │
      │                                       └────────────────────────────────┘
      │
      │ 5. CLI polls for authorization
      │    (every 5 seconds)
      │
      ├─ POST https://recoder.xyz/api/auth/cli ──────────────────────────────┐
      │  { action: 'device_token',                                           │
      │    device_code: '...',                                               │
      │    grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }      │
      │                                                                       │
      │  Response: { error: 'authorization_pending' } (keep polling)         │
      │            or                                                         │
      │            { access_token, refresh_token, user, ... } (success!)     │
      └───────────────────────────────────────────────────────────────────────┘
      │
      │ 6. Once authorized, stores credentials
      ▼
┌─────────────────────────────────────┐
│ ~/.recoder/auth.json                │
└─────────────────────────────────────┘
```

**API Endpoints Used:**
- `POST https://recoder.xyz/api/auth/cli` (request device code)
- `POST https://recoder.xyz/api/auth/cli` (poll for authorization - repeatedly)

### 3. API Key Authentication

```
┌─────────────┐
│             │  1. Validates API key
│  User runs  │─────────────────────────────────────────────────────────┐
│  auth login │                                                         │
│  --api-key  │                                                         ▼
└─────────────┘                               ┌────────────────────────────────┐
      │                                       │  POST https://recoder.xyz      │
      │                                       │  /api/auth/cli                 │
      │                                       │                                │
      │                                       │  action: 'validate_token'      │
      │                                       │  token: 'rcli_xxxxx'           │
      │                                       └────────────────────────────────┘
      │                                                         │
      │ 2. Receives user info                                  │
      ◀────────────────────────────────────────────────────────
      │                                       Returns:
      │                                       • user { id, email, name, plan }
      │                                       • (API key is valid)
      │
      │ 3. Stores credentials with API key
      ▼
┌─────────────────────────────────────┐
│ ~/.recoder/auth.json                │
│ { access_token: 'rcli_xxxxx', ... } │
└─────────────────────────────────────┘
```

**API Endpoints Used:**
- `POST https://recoder.xyz/api/auth/cli` (validate API key)

## Other API Interactions

### Token Refresh

```
When token expires → POST https://recoder.xyz/api/auth/cli
                     { action: 'refresh_token',
                       refresh_token: '...',
                       client_id: 'recoder-code' }
                     
                     Returns: { access_token, refresh_token, expires_at }
```

### Logout

```
User logout → POST https://recoder.xyz/api/auth/cli
              { action: 'revoke_token', token: '...' }
              
              Also deletes: ~/.recoder/auth.json
```

### Check Status

```
recoder-code auth status → GET https://recoder.xyz/api/user/quota
                           (with Authorization: Bearer <token>)
                           
                           Returns: { requests_remaining, requests_limit, reset_date }
```

### Set API Key (Free Tier)

```
recoder-code auth set-api-key → POST https://recoder.xyz/api/user/openrouter
                                 (with Authorization: Bearer <token>)
                                 { openRouterApiKey: 'sk-or-v1-xxx' }
```

## Summary

**All authentication commands communicate with Recoder.xyz:**

| Command | API Endpoint(s) |
|---------|----------------|
| `auth login` (web) | `GET /api/auth/cli` → `POST /api/auth/cli` (exchange) |
| `auth login --device` | `POST /api/auth/cli` (device code) → `POST /api/auth/cli` (poll) |
| `auth login --api-key` | `POST /api/auth/cli` (validate) |
| `auth logout` | `POST /api/auth/cli` (revoke) |
| `auth status` | `GET /api/user/quota` |
| `auth quota` | `GET /api/user/quota` |
| `auth whoami` | (reads from local cache) |
| `auth set-api-key` | `POST /api/user/openrouter` |
| Token refresh | `POST /api/auth/cli` (refresh) |

**Base URL**: `https://recoder.xyz` (configurable via `RECODER_API_URL` environment variable)

**Client ID**: `recoder-code` (identifies this CLI client)

**Local Storage**: `~/.recoder/auth.json` (secure, 0600 permissions)

## Environment Variable Override

You can change the backend URL:

```bash
export RECODER_API_URL=https://staging.recoder.xyz
recoder-code auth login  # Will use staging.recoder.xyz instead
```

This is useful for:
- Testing against staging/development environments
- Self-hosted Recoder.xyz instances
- Local development of the backend
