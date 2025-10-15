# 🤖 FOR AI COPILOT: Start Here

**Welcome! This document is your entry point for implementing recoder.xyz authentication in recoder-code.**

---

## 📚 Documentation Structure

I've created **3 comprehensive documents** for you:

### 1. 📖 Main Implementation Guide (Read First)
**File**: `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
- **Size**: 1,000+ lines of detailed documentation
- **Contains**:
  - Complete architecture overview
  - All API endpoints with examples
  - Full TypeScript implementation code
  - Database schema documentation
  - Token management patterns
  - Error handling strategies
  - Testing guidelines
- **Read this first** for complete implementation details

### 2. 🎨 Visual Flow Diagrams (Reference)
**File**: `CLI_AUTH_FLOWS_VISUAL.md`
- **Size**: 600+ lines of visual documentation
- **Contains**:
  - ASCII flow diagrams for all auth methods
  - User journey maps
  - Step-by-step breakdowns
  - Quick reference tables
  - Business logic visualization
- **Use this** when you need to understand the flow

### 3. ⚡ Quick Summary (Overview)
**File**: `AI_COPILOT_AUTH_SUMMARY.md`
- **Size**: 400+ lines of summary
- **Contains**:
  - Quick reference guide
  - Implementation phases (5 phases)
  - Essential API endpoints
  - Critical notes and tips
  - Testing checklist
- **Use this** for quick lookups during coding

---

## 🎯 What You Need to Build

**Project**: Integrate recoder.xyz authentication into recoder-code (VS Code extension)

**Goal**: 
1. Authenticate users when they install the extension
2. Store users in PostgreSQL database
3. Collect OpenRouter API keys from free-tier users
4. Track usage and enforce quotas
5. Support premium users (no API key needed)

**Time Estimate**: 5-6 hours total

---

## 🚀 Quick Start (30 seconds)

### Step 1: Read Main Guide
```bash
open RECODER_CODE_AUTH_INTEGRATION_GUIDE.md
```
Start with the **"Overview"** section (lines 1-50)

### Step 2: Understand the Architecture
Look at the **"Architecture"** section (lines 50-200)

### Step 3: Follow Implementation Guide
Go to **"Implementation Guide"** section (lines 300-800)

### Step 4: Copy Code Examples
All working code is in the **"Code Examples"** section

---

## 📋 Implementation Checklist

Use this to track your progress:

```
Phase 1: Basic Authentication (2-3 hours)
  ☐ Create AuthManager class
  ☐ Implement Web OAuth flow
  ☐ Implement Device flow
  ☐ Add token storage (VS Code secrets API)
  ☐ Add login command

Phase 2: API Key Collection (1 hour)
  ☐ Create ApiKeyManager class
  ☐ Check user subscription tier
  ☐ Prompt free users for OpenRouter key
  ☐ Store API key on server (encrypted)
  ☐ Retrieve API key for requests

Phase 3: Usage Tracking (1 hour)
  ☐ Create UsageTracker class
  ☐ Check quota before requests
  ☐ Track usage after requests
  ☐ Show quota in status bar
  ☐ Handle quota exceeded

Phase 4: Token Management (30 min)
  ☐ Implement token refresh
  ☐ Auto-refresh before expiry
  ☐ Handle refresh failures
  ☐ Validate tokens on startup

Phase 5: Error Handling (30 min)
  ☐ Handle network errors
  ☐ Handle auth errors (401)
  ☐ Handle quota errors (429)
  ☐ Handle API key errors (403)
  ☐ Show user-friendly messages
```

---

## 🔑 Key Concepts (Must Understand)

### User Tiers
```
Free Tier:
- 1,000 requests/month
- REQUIRES user's own OpenRouter API key
- User pays for their usage via OpenRouter
- Must prompt for key after authentication

Pro Tier:
- 50,000 requests/month
- Uses PLATFORM API keys (no prompt)
- Platform pays for usage
- Higher quota

Enterprise Tier:
- 1,000,000 requests/month
- Dedicated API keys
- Highest quota
```

### Authentication Flow (Simplified)
```
1. User installs extension
2. Extension checks: authenticated?
3. If NO: Show "Sign in to Recoder" prompt
4. User chooses: Web OAuth or Device Flow
5. Browser opens → User logs in
6. User added to database (automatic)
7. Tokens returned to extension
8. Extension stores tokens (VS Code secrets)
9. Check: Is user free tier?
10. If YES: Prompt for OpenRouter API key
11. Store key on server (encrypted)
12. ✅ Ready to use!
```

### Making AI Requests
```
1. Get access token (auto-refresh if needed)
2. Check quota → If exceeded: Show upgrade
3. Get appropriate API key:
   - Free: User's OpenRouter key from server
   - Premium: Platform key (server manages)
4. Make request to OpenRouter/other AI provider
5. Track usage with server
6. Update quota
7. Return response
```

---

## 🔌 Essential Information

### API Base URL
```
Production:  https://recoder.xyz
Development: http://localhost:3000
```

### Authentication Endpoints
```typescript
// Web OAuth
GET /api/auth/cli?response_type=code&client_id=recoder-code&...

// Exchange code
POST /api/auth/cli { action: "exchange_code", ... }

// Device Flow
POST /api/auth/cli { action: "device_flow", ... }

// Validate Token
POST /api/auth/cli { action: "validate_token", token: "..." }

// Refresh Token
POST /api/auth/cli { action: "refresh_token", ... }
```

### User Management
```typescript
// Get profile
GET /api/user/profile
Authorization: Bearer rct_xxx

// Get quota
GET /api/user/quota
Authorization: Bearer rct_xxx

// Save OpenRouter key (free users)
POST /api/user/openrouter
Authorization: Bearer rct_xxx
{ "openRouterApiKey": "sk-or-v1-..." }
```

### Token Storage (Client)
```typescript
// Use VS Code Secrets API (encrypted)
await context.secrets.store('recoder.accessToken', 'rct_xxx');
await context.secrets.store('recoder.refreshToken', 'rcr_xxx');
await context.secrets.store('recoder.user', JSON.stringify(user));

// Retrieve
const token = await context.secrets.get('recoder.accessToken');

// Delete (logout)
await context.secrets.delete('recoder.accessToken');
```

---

## ⚠️ Critical Implementation Notes

### Security (MUST DO)
1. ✅ **Use VS Code Secrets API** for token storage (never plain text)
2. ✅ **Validate state parameter** in OAuth (CSRF protection)
3. ✅ **Use HTTPS only** in production
4. ✅ **Never log tokens** or API keys
5. ✅ **Auto-refresh tokens** before expiry

### Free vs Premium Logic (MUST UNDERSTAND)
```typescript
const user = await getUser();

if (user.subscription_plan === 'free') {
  // ✅ Check if user has provided API key
  if (!user.has_own_api_key) {
    // ❌ User MUST provide OpenRouter API key
    await promptForApiKey(accessToken);
    return;
  }
  
  // ✅ Get user's OpenRouter API key from server
  const apiKey = await getApiKey(accessToken);
  
  // ✅ Use their key for requests
  // ✅ They pay for their usage
  // ✅ 1,000 requests/month limit
  
} else {
  // ✅ Premium/Enterprise user
  // ✅ Server provides API keys (rotating)
  // ✅ No prompt needed
  // ✅ Higher limits (50K or 1M)
}
```

### Error Handling (MUST IMPLEMENT)
```typescript
try {
  await makeAIRequest();
} catch (error) {
  // Token expired
  if (error.status === 401) {
    await refreshToken();
    // OR
    vscode.commands.executeCommand('recoder.login');
  }
  
  // Quota exceeded
  if (error.status === 429) {
    vscode.window.showErrorMessage(
      'Monthly quota exceeded',
      'Upgrade Plan'
    );
  }
  
  // API key missing (free user)
  if (error.data?.error === 'api_key_missing') {
    await promptForApiKey(token);
  }
}
```

---

## 💻 Code Structure

### Recommended File Structure
```
src/
├── auth/
│   ├── AuthManager.ts          # Main auth controller
│   ├── WebOAuthFlow.ts         # Browser OAuth
│   ├── DeviceFlow.ts           # Headless auth
│   ├── ApiKeyManager.ts        # OpenRouter key management
│   └── TokenRefresh.ts         # Token refresh logic
├── usage/
│   ├── UsageTracker.ts         # Track requests
│   └── QuotaChecker.ts         # Check quotas
├── api/
│   └── RecoderClient.ts        # API wrapper
└── extension.ts                # Main entry point
```

### Key Classes to Implement

1. **AuthManager** - Main authentication controller
   ```typescript
   class AuthManager {
     async isAuthenticated(): Promise<boolean>
     async login(method: 'web' | 'device'): Promise<void>
     async getAccessToken(): Promise<string>
     async getUser(): Promise<User>
     async logout(): Promise<void>
   }
   ```

2. **WebOAuthFlow** - Browser-based OAuth
   ```typescript
   class WebOAuthFlow {
     async authenticate(): Promise<AuthData>
     private startLocalServer(): Promise<string>
   }
   ```

3. **ApiKeyManager** - OpenRouter key management
   ```typescript
   class ApiKeyManager {
     async needsApiKey(user: User): Promise<boolean>
     async promptForApiKey(token: string): Promise<void>
     async getApiKey(token: string): Promise<string>
   }
   ```

4. **UsageTracker** - Track and enforce quotas
   ```typescript
   class UsageTracker {
     async trackRequest(data: UsageData): Promise<void>
     async getQuota(): Promise<Quota>
     async hasExceededQuota(): Promise<boolean>
   }
   ```

---

## 🎨 User Experience Flow

### First Install
```
Extension activates
    ↓
Check authenticated? → NO
    ↓
Show notification:
"Sign in to Recoder to use AI features"
[Sign In] [Later]
    ↓
User clicks "Sign In"
    ↓
Show quick pick:
• Web Browser (Recommended)
• Device Code (Headless)
    ↓
Complete authentication
    ↓
User added to database
    ↓
Check subscription tier
    ↓
If FREE → Prompt for API key
If PREMIUM → Skip to ready
    ↓
Show success:
"✅ Logged in as John Doe!"
"Quota: 1000/1000 requests remaining"
    ↓
✅ Ready to use!
```

---

## 📊 Testing Your Implementation

### Manual Testing Checklist
```
Basic Auth:
  ☐ Can log in via Web OAuth
  ☐ Can log in via Device Flow
  ☐ Tokens stored securely
  ☐ Can logout

Free User Flow:
  ☐ Prompted for OpenRouter key after login
  ☐ Can enter valid API key
  ☐ Key saved on server
  ☐ Can make requests using their key
  ☐ Quota tracked correctly

Premium User Flow:
  ☐ NOT prompted for API key
  ☐ Can make requests immediately
  ☐ Higher quota shown
  ☐ Usage tracked

Error Cases:
  ☐ Token expired → Auto refresh works
  ☐ Quota exceeded → Upgrade prompt shows
  ☐ Network error → User-friendly message
  ☐ Invalid API key → Clear error message
```

---

## 🔗 Resources

### Documentation Files
- **Main Guide**: `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
- **Visual Flows**: `CLI_AUTH_FLOWS_VISUAL.md`
- **Quick Summary**: `AI_COPILOT_AUTH_SUMMARY.md`

### External Links
- VS Code Extension API: https://code.visualstudio.com/api
- VS Code Secrets API: https://code.visualstudio.com/api/references/vscode-api#secrets
- OpenRouter: https://openrouter.ai
- OAuth 2.0 Device Flow: https://oauth.net/2/device-flow/

---

## 💡 Tips for Success

1. **Start Simple**: Implement Web OAuth first, test it fully, then add Device Flow
2. **Mock First**: Test UI flows with mocked API responses before real integration
3. **Test Free Tier**: Most users will be free tier, so test that thoroughly
4. **Auto-Refresh**: Implement token refresh early to avoid auth interruptions
5. **Show Status**: Add quota to status bar so users always know their usage
6. **Handle Errors**: Every API call should have error handling with user-friendly messages
7. **Use TypeScript**: Strong typing will catch bugs early
8. **Secure Storage**: ALWAYS use VS Code Secrets API for tokens

---

## 🚨 Common Pitfalls to Avoid

1. ❌ Storing tokens in workspace storage (use secrets API)
2. ❌ Not validating OAuth state parameter (security risk)
3. ❌ Not checking quota before requests (bad UX)
4. ❌ Not handling token expiration (users get stuck)
5. ❌ Not prompting free users for API key (requests fail)
6. ❌ Logging tokens or API keys (security risk)
7. ❌ Not handling offline mode (extension crashes)
8. ❌ Annoying upgrade prompts (users get frustrated)

---

## 📞 Need Help?

If you encounter issues:

1. **Check the main guide**: 99% of questions answered in `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
2. **Review visual flows**: Understand the expected behavior in `CLI_AUTH_FLOWS_VISUAL.md`
3. **Check code examples**: Working TypeScript code provided in the guides
4. **Test step by step**: Follow the implementation phases one at a time

---

## ✅ Ready to Start?

1. **Read**: Open `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
2. **Understand**: Review the architecture and flows
3. **Code**: Follow Phase 1 implementation
4. **Test**: Verify authentication works
5. **Iterate**: Add phases 2-5

**Estimated Time**: 5-6 hours for complete implementation

**Difficulty**: Medium (standard OAuth + API integration)

---

## 🎯 Your Mission

Build a seamless authentication experience where:
- Users can easily sign in via browser or device code
- Free users are guided to add their OpenRouter key
- Premium users get instant access
- Usage is tracked and quotas enforced
- Errors are handled gracefully
- The experience feels native to VS Code

**You've got this!** The documentation is comprehensive, the code examples are complete, and the architecture is solid. Just follow the phases and test as you go.

---

**Start with**: `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`

**Good luck!** 🚀

---

*Documentation created: 2024-01-10*  
*Status: Production Ready*  
*Version: 1.0*
