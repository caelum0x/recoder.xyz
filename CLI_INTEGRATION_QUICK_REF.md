# 🚀 CLI Integration Quick Reference

## User Experience (What Users See)

```bash
$ npm install -g recoder-code
$ recoder

🚀 Recoder CLI v1.0.0

👋 Welcome! Run /login to authenticate.

> /login
🔐 Opening browser for authentication...

# Browser opens → User authorizes → Browser shows success

✅ Authenticated as user@example.com
   Plan: free
   Requests: 1000/month

> /generate "build a React app"
🚀 Generating...
✅ Done! (999 requests remaining)
```

---

## Integration in 5 Steps

### 1. Install Dependencies (recoder-code package)
```bash
npm install open nanoid node-fetch@2 fs-extra
```

### 2. Copy Authentication Module
Copy `src/auth/index.ts` from `RECODER_CODE_CLI_INTEGRATION.md`

### 3. Add Commands to Interactive Chat
```typescript
import { handleLoginCommand, checkQuota, trackUsage } from './auth';

// In your command handler:
case '/login':
  await handleLoginCommand();
  break;
```

### 4. Add Quota Check Before Requests
```typescript
// Before generating code:
const quota = await checkQuota();
if (!quota.allowed) {
  console.log('❌ Quota exceeded. Upgrade at recoder.xyz/pricing');
  return;
}
```

### 5. Track Usage After Requests
```typescript
// After generating code:
await trackUsage({
  modelUsed: 'claude-3-sonnet',
  tokensUsed: 1500,
  cost: 0.045,
  success: true
});
```

---

## API Endpoints Used

```
POST /api/auth/cli
  - Action: exchange_code (get tokens from auth code)
  - Action: refresh_token (refresh expired token)

GET /api/user/quota?userId=xxx
  - Check if user can make requests
  - Returns: allowed, remaining, limit

POST /api/usage/track
  - Track CLI usage
  - Body: userId, requestType, modelUsed, tokensUsed, cost
```

---

## Session Storage

```bash
# Saved to:
~/.recoder/auth.json

# Contains:
{
  "userId": "user_xxx",
  "accessToken": "rct_...",
  "refreshToken": "rcr_...",
  "email": "user@example.com",
  "plan": "free",
  "expiresAt": "2024-12-31T...",
  "needsApiKey": true
}
```

---

## OAuth Flow

```
CLI → Opens browser → recoder.xyz/api/auth/cli?...
                     ↓
                User authorizes
                     ↓
Browser → localhost:8181/callback?code=xxx
                     ↓
CLI → Exchange code for tokens → Save session
```

---

## Available Commands

```
/login    - Authenticate with recoder.xyz
/logout   - Sign out
/status   - Show authentication status
/quota    - Check usage quota
/help     - Show help
```

---

## Testing Locally

```bash
# Terminal 1: Start recoder.xyz
cd /Users/arhansubasi/recoder.xyz/app
npm run dev

# Terminal 2: Test CLI
cd recoder-code
npm run dev
> /login
```

---

## Environment Variables

```bash
# Development (optional)
RECODER_AUTH_URL=http://localhost:3002

# Production (default)
RECODER_AUTH_URL=https://recoder.xyz
```

---

## Error Handling

```typescript
// Authentication required
if (!await isAuthenticated()) {
  console.log('❌ Run /login to authenticate');
  return;
}

// Quota exceeded
if (!quota.allowed) {
  console.log('❌ Quota exceeded');
  console.log('   Upgrade: recoder.xyz/pricing');
  return;
}

// Needs API key (free users)
if (session.needsApiKey) {
  console.log('⚠️  Add your OpenRouter API key');
  console.log('   Visit: recoder.xyz/auth/onboarding');
}
```

---

## Publishing

```bash
# Build
npm run build

# Test locally
npm link
recoder

# Publish
npm publish

# Users install
npm install -g recoder-code
```

---

## Complete Flow

```
User installs: npm install -g recoder-code
User runs: recoder
CLI shows: "Run /login to authenticate"
User types: /login
CLI: Opens browser to recoder.xyz
Browser: User authorizes
CLI: Receives callback, saves session
CLI: "✅ Authenticated!"
User types: /generate "app"
CLI: Checks quota → Generates → Tracks usage
CLI: "✅ Done! (999 remaining)"
```

---

**That's it!** Copy the auth module, integrate the 3 functions, and your CLI has full authentication with usage tracking.

See `RECODER_CODE_CLI_INTEGRATION.md` for complete code.
