# Authentication Quick Reference

## TL;DR

**YES** - All `recoder-code auth` commands communicate with **https://recoder.xyz** for verification and authentication.

## How It Works

```bash
recoder-code auth login
     ↓
Opens browser → https://recoder.xyz/api/auth/cli
     ↓
User logs in at recoder.xyz
     ↓
Returns authentication tokens
     ↓
Stored locally in ~/.recoder/auth.json
```

## Key Points

1. **Backend API**: `https://recoder.xyz` (default)
   - Can be changed via `RECODER_API_URL` environment variable

2. **Authentication Methods**:
   - **Web OAuth**: Opens browser, user logs in at recoder.xyz
   - **Device Flow**: User visits recoder.xyz and enters code
   - **API Key**: Validates key with recoder.xyz

3. **All operations verify with recoder.xyz**:
   - Login → Verifies credentials
   - Status → Fetches quota from server
   - Quota → Gets usage data from server
   - Set API Key → Updates on server
   - Logout → Revokes session on server

4. **Local Storage**: `~/.recoder/auth.json`
   - Only stores tokens and cached user info
   - Tokens verified and refreshed with server

## Test It

```bash
# See where it connects
grep "RECODER_API" packages/cli/src/services/RecoderAuthService.ts

# Result:
# const RECODER_API_BASE = process.env['RECODER_API_URL'] || 'https://recoder.xyz';
```

## API Endpoints

All authentication uses these recoder.xyz endpoints:

- `GET /api/auth/cli` - Start OAuth flow
- `POST /api/auth/cli` - Exchange codes, validate tokens, refresh
- `GET /api/user/quota` - Get usage information  
- `POST /api/user/openrouter` - Set API key for free tier
- `DELETE /api/auth/cli/sessions/current` - Revoke session

**Client Identifier**: `recoder-code` (tells recoder.xyz this is the CLI client)
