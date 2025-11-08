# Recoder.xyz Authentication Integration

## Overview

This document describes the authentication integration between the `recoder-code` CLI and the `recoder.xyz` backend service.

## Features

✅ **Multiple Authentication Methods**
- Web OAuth (recommended for desktop)
- Device Flow (for SSH/headless environments)
- API Key Authentication (for automation)

✅ **User Tier Management**
- Free Tier: Requires user's own OpenRouter API key
- Pro/Enterprise Tier: Platform-provided API keys

✅ **Session Management**
- Automatic token refresh
- Secure local storage (`~/.recoder/auth.json`)
- Cross-platform session sync

✅ **Quota Tracking**
- Request counting
- Usage limits enforcement
- Quota status display

## Installation

The authentication service is built into the CLI. No additional installation required.

## Usage

### 1. Login

#### Web OAuth (Recommended)
```bash
recoder auth login
# or explicitly
recoder auth login --web
```

This will:
1. Open your browser to recoder.xyz
2. Prompt you to sign in
3. Redirect back to CLI with authentication
4. Save session locally

#### Device Flow (For SSH/Remote)
```bash
recoder auth login --device
```

This will:
1. Display a code (e.g., ABCD-1234)
2. Show a URL to visit
3. Wait for you to authorize on another device
4. Complete authentication when approved

#### API Key Authentication
```bash
recoder auth login --api-key rcli_xxxxxx
```

### 2. Check Status

```bash
recoder auth status
```

Output:
```
✅ Authenticated
📧 Email: user@example.com
👤 Name: John Doe
📋 Plan: FREE

📊 Quota:
  • Requests: 850/1000
  • Resets: 12/1/2024
  • Usage: 15.0%

⚠️  OpenRouter API key: Not configured
💡 Free tier requires your own API key
💡 Get one at: https://openrouter.ai
💡 Then run: recoder auth set-api-key <your-key>
```

### 3. Set API Key (Free Tier Only)

Free tier users must provide their own OpenRouter API key:

```bash
recoder auth set-api-key sk-or-v1-xxxxxx
```

This will:
1. Validate the key format
2. Send it to recoder.xyz (encrypted)
3. Enable AI features

### 4. View Quota

```bash
recoder auth quota
```

Output:
```
📊 Quota Information
──────────────────────────────────────────────────
Plan: FREE

Requests:
  • Used: 150
  • Remaining: 850
  • Limit: 1000
  • Usage: 15.0%

Reset Date: 2/1/2024, 12:00:00 AM

[████████████████████░░░░░░░░░░] 15.0%
```

### 5. Logout

```bash
recoder auth logout
```

## API Integration

### RecoderAuthService

The main service class that handles all authentication operations.

```typescript
import { RecoderAuthService } from './services/RecoderAuthService';

const authService = new RecoderAuthService();

// Check authentication
const isAuth = await authService.isAuthenticated();

// Get access token
const token = await authService.getAccessToken();

// Get user info
const user = await authService.getUser();

// Check quota
const quotaCheck = await authService.checkQuota();
if (!quotaCheck.allowed) {
  console.error(quotaCheck.reason);
}
```

### Using in Commands

```typescript
import { RecoderAuthService } from '../services/RecoderAuthService';

export async function myCommand() {
  const authService = new RecoderAuthService();
  
  // Ensure user is authenticated
  const isAuth = await authService.isAuthenticated();
  if (!isAuth) {
    console.error('Please login first: recoder auth login');
    return;
  }

  // Check quota
  const quotaCheck = await authService.checkQuota();
  if (!quotaCheck.allowed) {
    console.error(quotaCheck.reason);
    return;
  }

  // Get access token for API calls
  const token = await authService.getAccessToken();
  
  // Make authenticated request...
}
```

## Backend API Endpoints

The CLI expects these endpoints to be available on `recoder.xyz`:

### Authentication

```
POST /api/auth/cli
```

Actions:
- `exchange_code` - Exchange OAuth code for tokens
- `device_flow` - Initiate device flow
- `device_token` - Poll for device authorization
- `validate_token` - Validate API key
- `refresh_token` - Refresh access token
- `revoke_token` - Logout

### User Management

```
GET /api/user/profile
GET /api/user/quota
POST /api/user/openrouter
```

## Environment Variables

```bash
# Optional: Override API URL (for development)
export RECODER_API_URL=http://localhost:3000

# The CLI will use https://recoder.xyz by default
```

## Session Storage

Sessions are stored at: `~/.recoder/auth.json`

Format:
```json
{
  "user_id": "usr_xxx",
  "access_token": "rct_xxx",
  "refresh_token": "rcr_xxx",
  "expires_at": "2024-12-31T23:59:59.000Z",
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "free",
    "has_own_api_key": false,
    "quota": {
      "requests_remaining": 1000,
      "requests_limit": 1000,
      "reset_date": "2024-02-01T00:00:00.000Z"
    }
  }
}
```

**Security:**
- File permissions: `0600` (read/write owner only)
- Tokens automatically refresh before expiry
- Never logged or exposed in error messages

## User Flows

### New Free User

1. Run `recoder auth login`
2. Authenticate via browser
3. Account created on recoder.xyz
4. Prompted for OpenRouter API key
5. Run `recoder auth set-api-key sk-or-v1-xxx`
6. Ready to use!

### New Premium User

1. Run `recoder auth login`
2. Authenticate via browser
3. Account created on recoder.xyz
4. No API key needed (skipped automatically)
5. Ready to use immediately!

### Existing User

1. Run `recoder auth login`
2. Authenticate via browser
3. Session restored
4. Continue working

## Error Handling

### Not Authenticated
```
❌ Not authenticated
💡 Run: recoder auth login
```

### Quota Exceeded
```
❌ Monthly quota exceeded
💡 Upgrade your plan at: https://recoder.xyz/pricing
```

### API Key Missing (Free Tier)
```
⚠️  Free tier requires your own OpenRouter API key
💡 Get one at: https://openrouter.ai
💡 Then run: recoder auth set-api-key <your-key>
```

### Token Expired
The CLI automatically refreshes expired tokens. If refresh fails:
```
❌ Session expired
💡 Please login again: recoder auth login
```

## Testing

### Test Authentication Flow

```bash
# 1. Login
recoder auth login --web

# 2. Check status
recoder auth status

# 3. Set API key (if free tier)
recoder auth set-api-key sk-or-v1-xxx

# 4. Check quota
recoder auth quota

# 5. Test logout
recoder auth logout

# 6. Verify logged out
recoder auth status
```

### Test Device Flow

```bash
# On SSH server
recoder auth login --device

# Follow the prompts, authorize on another device
# Should complete successfully
```

### Test API Key Auth

```bash
# Get API key from https://recoder.xyz/settings/api-keys
recoder auth login --api-key rcli_xxx

# Should authenticate without browser
```

## Security Considerations

1. **Token Storage**: Tokens stored with `0600` permissions (owner-only)
2. **HTTPS Only**: All API calls use HTTPS in production
3. **State Parameter**: OAuth flow uses CSRF protection
4. **Token Refresh**: Automatic refresh before expiry
5. **API Key Encryption**: User API keys encrypted on server (AES-256-GCM)
6. **No Logging**: Tokens never logged or included in error messages

## Troubleshooting

### Authentication fails
```bash
# Check internet connection
curl https://recoder.xyz/api/health

# Try device flow instead
recoder auth login --device

# Check for firewall blocking port 8080
```

### Can't set API key
```bash
# Ensure you're authenticated first
recoder auth status

# Verify key format
echo "sk-or-v1-xxxxx" | grep "^sk-or-"
```

### Session expired
```bash
# Simply login again
recoder auth login
```

## Future Enhancements

- [ ] Multi-account support
- [ ] Team/organization accounts
- [ ] API key rotation automation
- [ ] Offline mode with cached credentials
- [ ] Biometric authentication
- [ ] Hardware security key support

## Support

For issues or questions:
- Documentation: https://recoder.xyz/docs
- Support: support@recoder.xyz
- Discord: https://discord.gg/recoder
- GitHub Issues: https://github.com/your-org/recoder-code/issues
