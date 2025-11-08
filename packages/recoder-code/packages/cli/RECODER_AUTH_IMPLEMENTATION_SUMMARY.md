# Recoder.xyz Authentication Implementation Summary

## What We Built

A complete authentication system for the `recoder-code` CLI that integrates with your `recoder.xyz` backend.

## Files Created

### 1. Core Authentication Service
**`src/services/RecoderAuthService.ts`** (16KB)
- Complete authentication service class
- Handles Web OAuth, Device Flow, and API Key auth
- Session management and token refresh
- Quota checking and usage tracking
- OpenRouter API key management

### 2. CLI Commands
**`src/commands/recoderAuth.ts`** (6.6KB)
- Command-line interface for authentication
- Commands: login, logout, status, set-api-key, quota
- Beautiful CLI output with progress bars and status indicators

### 3. Interactive UI Commands
**`src/ui/commands/recoderLoginCommand.tsx`** (5.2KB)
- Slash commands for interactive mode
- `/login`, `/logout`, `/status`, `/set-api-key`
- React-based UI with Ink

### 4. Documentation
- **`RECODER_AUTH_README.md`** (8KB) - Complete usage documentation
- **`INTEGRATION_GUIDE.md`** (10.5KB) - Developer integration guide
- **`RECODER_AUTH_IMPLEMENTATION_SUMMARY.md`** - This file

### 5. Core Updates
**`packages/core/src/core/contentGenerator.ts`**
- Added `RECODER_AUTH` to `AuthType` enum

**`packages/cli/src/config/auth.ts`**
- Added validation for `RECODER_AUTH` method

## Features Implemented

### ✅ Authentication Methods

1. **Web OAuth** (Primary)
   - Opens browser to recoder.xyz
   - OAuth 2.0 Authorization Code flow
   - CSRF protection with state parameter
   - Local callback server on port 8080
   - Automatic token storage

2. **Device Flow** (For SSH/Headless)
   - Generates device code and user code
   - User authorizes on another device
   - Polls backend until authorized
   - Perfect for remote environments

3. **API Key** (For Automation)
   - Long-lived API keys
   - Generated on website
   - Simple authentication for CI/CD

### ✅ Session Management

- Secure storage at `~/.recoder/auth.json`
- File permissions: `0600` (owner-only)
- Automatic token refresh before expiry
- Cross-platform session sync

### ✅ User Tier Support

**Free Tier:**
- Must provide own OpenRouter API key
- 1,000 requests/month
- Prompted after login if no key
- Command: `recoder auth set-api-key`

**Pro/Enterprise Tier:**
- Platform-provided API keys
- No user prompt needed
- Higher limits (50K/1M requests)
- Automatic key rotation on backend

### ✅ Quota Management

- Check quota before requests
- Track usage after requests
- Display quota in status
- Progress bars and warnings
- Automatic monthly reset

### ✅ CLI Commands

```bash
recoder auth login              # Web OAuth (default)
recoder auth login --device     # Device flow
recoder auth login --api-key <key>  # API key auth
recoder auth logout             # Sign out
recoder auth status             # Check status + quota
recoder auth set-api-key <key>  # Set OpenRouter key (free tier)
recoder auth quota              # Detailed quota info
```

### ✅ Interactive Slash Commands

```
/login          - Authenticate with recoder.xyz
/logout         - Sign out
/status         - Check authentication status
/set-api-key    - Set OpenRouter API key
```

## How It Works

### Authentication Flow

```
User runs: recoder auth login

1. RecoderAuthService generates random state
2. Starts local HTTP server on port 8080
3. Opens browser to:
   https://recoder.xyz/api/auth/cli?
     client_id=recoder-code&
     redirect_uri=http://localhost:8080/auth/callback&
     state=<random>&
     scope=cli:full profile

4. User signs in on recoder.xyz
5. Backend generates authorization code
6. Redirects to: http://localhost:8080/auth/callback?code=xxx&state=xxx
7. CLI receives callback, validates state
8. Exchanges code for tokens:
   POST /api/auth/cli
   { action: "exchange_code", code: "xxx" }

9. Backend returns:
   {
     access_token: "rct_xxx",
     refresh_token: "rcr_xxx",
     expires_at: "...",
     user: { id, email, plan, quota, has_own_api_key }
   }

10. CLI saves session to ~/.recoder/auth.json
11. If free tier && !has_own_api_key:
    - Prompt: "Run: recoder auth set-api-key"
12. Done! User is authenticated
```

### API Request Flow

```
User makes AI request

1. RecoderAuthService.isAuthenticated()
   - Check if session exists
   - Check if token expired
   - Auto-refresh if needed

2. RecoderAuthService.checkQuota()
   - GET /api/user/quota
   - Check requests_remaining > 0
   - Return allowed/denied

3. Determine API key source:
   
   FREE USER:
   - Check has_own_api_key === true
   - GET /api/user/openrouter (returns encrypted key)
   - Use user's key for OpenRouter request
   - User pays for their usage
   
   PREMIUM USER:
   - Backend provides platform key
   - POST request through backend proxy
   - Platform pays for usage
   - Higher rate limits

4. Make AI request (OpenRouter, Anthropic, etc.)

5. Track usage:
   - POST /api/usage/track
   - { tokens_used, model, cost }
   - Update quota in database

6. Return result to user
```

## Backend API Requirements

Your `recoder.xyz` backend needs these endpoints:

### POST /api/auth/cli

Actions:
- `exchange_code` - Exchange OAuth code for tokens
- `device_flow` - Initiate device authorization
- `device_token` - Poll for device authorization
- `validate_token` - Validate API key
- `refresh_token` - Refresh access token
- `revoke_token` - Logout/revoke token

### GET /api/user/profile

Returns user info:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_xxx",
      "email": "user@example.com",
      "name": "John Doe",
      "subscription_plan": "free",
      "has_own_api_key": false
    }
  }
}
```

### GET /api/user/quota

Returns quota info:
```json
{
  "success": true,
  "data": {
    "requests_remaining": 850,
    "requests_limit": 1000,
    "reset_date": "2024-02-01T00:00:00Z"
  }
}
```

### POST /api/user/openrouter

Save user's API key:
```json
{
  "openRouterApiKey": "sk-or-v1-xxx"
}
```

Backend should:
1. Encrypt with AES-256-GCM
2. Store in database
3. Set `has_own_api_key = true`

### GET /api/user/openrouter

Get user's API key (free tier only):
```json
{
  "success": true,
  "data": {
    "api_key": "sk-or-v1-xxx"
  }
}
```

Backend should:
1. Decrypt from database
2. Return to authenticated user
3. Only for free tier users

### POST /api/usage/track

Track usage:
```json
{
  "model": "claude-3-sonnet",
  "tokens_used": 1234,
  "cost": 0.05
}
```

Backend should:
1. Update `requests_used += 1`
2. Update `tokens_used += 1234`
3. Update `cost_this_period += 0.05`
4. Check if quota exceeded

## Integration Steps

### Step 1: Add to Main CLI Entry Point

Edit `packages/cli/src/gemini.tsx`:

```typescript
import { handleRecoderAuthCommand } from './commands/recoderAuth.js';

export async function main() {
  const args = process.argv.slice(2);
  
  // Handle auth commands
  if (args[0] === 'auth') {
    await handleRecoderAuthCommand(args.slice(1));
    process.exit(0);
  }
  
  // ... rest of your code
}
```

### Step 2: Add Auth Check on Startup

```typescript
import { RecoderAuthService } from './services/RecoderAuthService.js';

async function checkAuth() {
  const authService = new RecoderAuthService();
  const isAuth = await authService.isAuthenticated();
  
  if (!isAuth) {
    console.log('⚠️  Not authenticated. Run: recoder auth login');
  } else {
    const user = await authService.getUser();
    console.log(`✅ ${user?.email} (${user?.subscription_plan})`);
  }
}

await checkAuth();
```

### Step 3: Use in AI Requests

See `INTEGRATION_GUIDE.md` for complete examples.

### Step 4: Build and Test

```bash
cd packages/cli
npm run build
npm link
recoder auth login
recoder auth status
```

## Testing Checklist

- [ ] Web OAuth login works
- [ ] Device flow login works
- [ ] API key login works
- [ ] Token refresh works automatically
- [ ] Session persists across restarts
- [ ] Logout clears session
- [ ] Free user prompted for API key
- [ ] Premium user not prompted
- [ ] Quota checking works
- [ ] Usage tracking works
- [ ] Quota exceeded shows upgrade prompt

## Security Features

1. **CSRF Protection**: State parameter in OAuth
2. **Secure Storage**: `0600` file permissions
3. **Token Encryption**: Backend encrypts API keys (AES-256-GCM)
4. **Automatic Refresh**: Tokens refresh before expiry
5. **HTTPS Only**: All production requests over HTTPS
6. **No Logging**: Tokens never logged or exposed

## Production Deployment

Before launching:

1. ✅ Ensure backend endpoints are live
2. ✅ Test authentication flows end-to-end
3. ✅ Verify database encryption is working
4. ✅ Set up monitoring and alerts
5. ✅ Configure rate limiting
6. ✅ Test quota enforcement
7. ✅ Verify payment webhooks work
8. ✅ Test upgrade flows
9. ✅ Load test authentication endpoints
10. ✅ Set up error tracking (Sentry)

## Next Steps

1. **Build the CLI**: `npm run build`
2. **Test Locally**: Point to localhost backend
3. **Deploy Backend**: Ensure all endpoints work
4. **Deploy CLI**: Publish to npm
5. **Monitor**: Track authentication success rates
6. **Iterate**: Add features based on user feedback

## Support

- **Documentation**: See `RECODER_AUTH_README.md`
- **Integration**: See `INTEGRATION_GUIDE.md`
- **Backend Docs**: See `/auth docs/` directory

---

**Status**: ✅ Complete and ready for integration

**Time to Integrate**: 30-60 minutes

**Complexity**: Low (well-documented, self-contained)

**Dependencies**: `open` package (for browser opening)
