# AI Copilot - Authentication Summary

**Quick Reference for Implementing recoder.xyz Auth in recoder-code**

---

## 📄 Documentation Files Created

1. **RECODER_CODE_AUTH_INTEGRATION_GUIDE.md** (Main Guide - 1,000+ lines)
   - Complete implementation guide
   - All API endpoints documented
   - Full code examples
   - Error handling patterns
   - Testing strategies

2. **CLI_AUTH_FLOWS_VISUAL.md** (Visual Reference - 600+ lines)
   - ASCII flow diagrams
   - User journey maps
   - Step-by-step breakdowns
   - Quick reference tables

3. **AI_COPILOT_AUTH_SUMMARY.md** (This File)
   - Quick summary
   - Key points
   - Implementation order

---

## 🎯 The Goal

Integrate **recoder.xyz** authentication into **recoder-code** VS Code extension to:

1. ✅ Authenticate users on first install
2. ✅ Save users to PostgreSQL database
3. ✅ Collect OpenRouter API keys from free users
4. ✅ Track usage and enforce quotas
5. ✅ Support both free and premium tiers

---

## 🏗️ Architecture in 3 Lines

```
recoder-code (VS Code) → recoder.xyz (Auth) → Database (PostgreSQL)
                       ↓
                  Track usage & quotas
```

---

## 🔑 Key Concepts

### User Tiers

| Tier | Monthly Limit | API Key Required? | Cost |
|------|---------------|-------------------|------|
| Free | 1,000 requests | ✅ YES (user provides OpenRouter key) | $0 |
| Pro | 50,000 requests | ❌ NO (platform provides keys) | $29.99 |
| Enterprise | 1M requests | ❌ NO (dedicated keys) | $299.99 |

### Authentication Methods

1. **Web OAuth** (Recommended) - Opens browser, user logs in, callback to extension
2. **Device Flow** (Headless) - Shows code, user enters on phone/other device
3. **API Key** (Legacy) - Direct API key from dashboard

---

## 📝 Implementation Order

### Phase 1: Basic Authentication (2-3 hours)

```typescript
// 1. Create AuthManager class
class AuthManager {
  async isAuthenticated(): Promise<boolean>
  async getAccessToken(): Promise<string>
  async getUser(): Promise<User>
  async logout(): Promise<void>
}

// 2. Implement Web OAuth Flow
class WebOAuthFlow {
  async authenticate(): Promise<AuthData>
}

// 3. Implement Device Flow
class DeviceFlow {
  async authenticate(): Promise<AuthData>
}

// 4. Add login command
vscode.commands.registerCommand('recoder.login', async () => {
  // Choose method → Authenticate → Store tokens
});
```

### Phase 2: API Key Collection (1 hour)

```typescript
// 5. Create ApiKeyManager
class ApiKeyManager {
  async needsApiKey(user: User): Promise<boolean>
  async promptForApiKey(token: string): Promise<void>
  async getApiKey(token: string): Promise<string>
}

// 6. After login, check if free user needs key
if (user.subscription_plan === 'free' && !user.has_own_api_key) {
  await apiKeyManager.promptForApiKey(accessToken);
}
```

### Phase 3: Usage Tracking (1 hour)

```typescript
// 7. Create UsageTracker
class UsageTracker {
  async trackRequest(token: string, data: UsageData): Promise<void>
  async getQuota(token: string): Promise<Quota>
  async hasExceededQuota(token: string): Promise<boolean>
}

// 8. Before each AI request
const quota = await usageTracker.getQuota(token);
if (quota.requests_remaining <= 0) {
  showUpgradePrompt();
  return;
}

// 9. After each request
await usageTracker.trackRequest(token, {
  tokensUsed: 1234,
  modelUsed: 'gpt-4',
  success: true
});
```

### Phase 4: Token Management (30 min)

```typescript
// 10. Auto-refresh tokens
async function ensureValidToken(): Promise<string> {
  const token = await context.secrets.get('accessToken');
  const expiresAt = await context.secrets.get('expiresAt');
  
  if (Date.now() >= new Date(expiresAt).getTime() - 5*60*1000) {
    // Refresh token
    const newToken = await refreshToken();
    await context.secrets.store('accessToken', newToken);
    return newToken;
  }
  
  return token;
}
```

### Phase 5: Error Handling (30 min)

```typescript
// 11. Handle common errors
try {
  await makeAIRequest();
} catch (error) {
  if (error.status === 401) {
    // Token expired
    vscode.commands.executeCommand('recoder.login');
  } else if (error.status === 429) {
    // Quota exceeded
    showUpgradePrompt();
  } else if (error.data?.error === 'api_key_missing') {
    // Free user needs API key
    await apiKeyManager.promptForApiKey(token);
  }
}
```

---

## 🔌 Essential API Endpoints

### Authentication

```typescript
// Web OAuth - Step 1: Get auth page
GET https://recoder.xyz/api/auth/cli
  ?response_type=code
  &client_id=recoder-code
  &redirect_uri=http://localhost:8080/callback
  &state=xxx

// Web OAuth - Step 2: Exchange code for tokens
POST https://recoder.xyz/api/auth/cli
{
  "action": "exchange_code",
  "grant_type": "authorization_code",
  "client_id": "recoder-code",
  "code": "AUTH_CODE",
  "redirect_uri": "http://localhost:8080/callback"
}

// Device Flow - Step 1: Get device code
POST https://recoder.xyz/api/auth/cli
{
  "action": "device_flow",
  "client_id": "recoder-code"
}

// Device Flow - Step 2: Poll for authorization
POST https://recoder.xyz/api/auth/cli
{
  "action": "device_token",
  "device_code": "xxx",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}

// Validate Token
POST https://recoder.xyz/api/auth/cli
{
  "action": "validate_token",
  "token": "rct_xxx"
}

// Refresh Token
POST https://recoder.xyz/api/auth/cli
{
  "action": "refresh_token",
  "refresh_token": "rcr_xxx",
  "client_id": "recoder-code"
}
```

### User Management

```typescript
// Get User Profile
GET https://recoder.xyz/api/user/profile
Authorization: Bearer rct_xxx

// Get User Quota
GET https://recoder.xyz/api/user/quota
Authorization: Bearer rct_xxx

// Get User Subscription
GET https://recoder.xyz/api/user/subscription
Authorization: Bearer rct_xxx
```

### API Key Management (Free Users)

```typescript
// Save OpenRouter API Key
POST https://recoder.xyz/api/user/openrouter
Authorization: Bearer rct_xxx
{
  "openRouterApiKey": "sk-or-v1-xxx"
}

// Get OpenRouter API Key (for making requests)
GET https://recoder.xyz/api/user/openrouter
Authorization: Bearer rct_xxx

// Validate OpenRouter API Key
GET https://recoder.xyz/api/user/openrouter/validate
Authorization: Bearer rct_xxx
```

### Usage Tracking

```typescript
// Track Usage
POST https://recoder.xyz/api/usage/track
Authorization: Bearer rct_xxx
{
  "requestType": "chat_completion",
  "modelUsed": "gpt-4",
  "tokensUsed": 1234,
  "cost": 0.05,
  "success": true,
  "duration": 2500
}
```

---

## 💾 Data Storage

### VS Code Secrets API (Client Side)

```typescript
// Store (encrypted by VS Code)
await context.secrets.store('recoder.accessToken', 'rct_xxx');
await context.secrets.store('recoder.refreshToken', 'rcr_xxx');
await context.secrets.store('recoder.expiresAt', '2024-02-01...');
await context.secrets.store('recoder.user', JSON.stringify(user));

// Retrieve
const token = await context.secrets.get('recoder.accessToken');

// Delete (logout)
await context.secrets.delete('recoder.accessToken');
```

### Database Schema (Server Side)

```typescript
// User table
{
  id: string
  email: string
  name: string
  subscriptionPlan: 'free' | 'pro' | 'enterprise'
  openRouterApiKey?: string  // Encrypted, only for free users
  hasOwnApiKey: boolean
  onboardingStep?: string
}

// CLISession table
{
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: DateTime
  isActive: boolean
}

// UserQuota table
{
  id: string
  userId: string
  requestsLimit: number
  requestsUsed: number
  tokensUsed: BigInt
  periodStart: DateTime
  periodEnd: DateTime
}

// UsageRecord table
{
  id: string
  userId: string
  requestType: string
  tokensUsed: number
  modelUsed: string
  createdAt: DateTime
}
```

---

## 🎨 User Experience Flow

### First Install

```
1. Extension activates
2. Check if authenticated → NO
3. Show prompt: "Sign in to Recoder"
4. User clicks "Sign In"
5. Choose: Web OAuth or Device Flow
6. Complete authentication
7. User added to database
8. Check subscription tier
9. If free: Prompt for OpenRouter API key
10. Store tokens in VS Code secrets
11. Show success message
12. Extension ready to use
```

### Making AI Requests

```
1. User triggers AI feature
2. Get access token (auto-refresh if needed)
3. Check quota
4. If quota exceeded → Show upgrade prompt
5. Get appropriate API key:
   - Free: User's OpenRouter key from server
   - Premium: Platform key (server manages)
6. Make AI request to OpenRouter
7. Track usage with server
8. Update quota
9. Show response to user
```

### Session Management

```
1. Tokens auto-refresh before expiry
2. On startup: Validate token with server
3. If invalid: Prompt re-login
4. Store last used time
5. Handle offline mode gracefully
```

---

## ⚠️ Critical Implementation Notes

### Security

1. **Never store tokens in plain text** - Use VS Code secrets API
2. **Never log tokens** - Sanitize logs
3. **Validate state parameter** - CSRF protection for OAuth
4. **Use HTTPS only** - Production uses https://recoder.xyz
5. **Encrypt API keys** - Server encrypts with AES-256-GCM

### Free vs Premium

```typescript
// Always check tier before requests
const user = await getUser();

if (user.subscription_plan === 'free') {
  // 1. Check if has API key
  if (!user.has_own_api_key) {
    await promptForApiKey();
    return;
  }
  
  // 2. Use user's OpenRouter key
  const apiKey = await getOpenRouterKey(token);
  
  // 3. User pays for their usage
  // 4. 1,000 requests/month limit
  
} else {
  // Premium/Enterprise
  // 1. Use platform API keys
  // 2. Server rotates keys
  // 3. Higher limits (50K or 1M)
  // 4. No API key prompt
}
```

### Error Recovery

```typescript
// Token expired
if (error.status === 401) {
  try {
    await refreshToken();
    // Retry request
  } catch {
    await logout();
    vscode.commands.executeCommand('recoder.login');
  }
}

// Quota exceeded
if (error.status === 429) {
  const choice = await vscode.window.showErrorMessage(
    'Monthly quota exceeded',
    'Upgrade Plan',
    'View Usage'
  );
  if (choice === 'Upgrade Plan') {
    vscode.env.openExternal(vscode.Uri.parse('https://recoder.xyz/pricing'));
  }
}

// API key missing (free user)
if (error.data?.error === 'api_key_missing') {
  await promptForApiKey(token);
  // Retry after key added
}
```

---

## 🚀 Testing Checklist

```
Authentication:
  ☐ Web OAuth completes successfully
  ☐ Device flow completes successfully
  ☐ Tokens stored correctly
  ☐ Token validation works
  ☐ Token refresh works
  ☐ Logout clears all data

API Key (Free Users):
  ☐ Prompt appears for free users
  ☐ API key validation works
  ☐ API key stored on server
  ☐ API key retrieved for requests
  ☐ Premium users not prompted

Usage Tracking:
  ☐ Quota checked before requests
  ☐ Usage tracked after requests
  ☐ Quota updates correctly
  ☐ Quota exceeded handled
  ☐ Monthly reset works

Error Handling:
  ☐ Network errors handled
  ☐ Auth errors trigger re-login
  ☐ Quota errors show upgrade
  ☐ API key errors prompt user

User Experience:
  ☐ First install flow works
  ☐ Status bar shows quota
  ☐ Notifications are clear
  ☐ Upgrade prompts work
  ☐ Settings panel works
```

---

## 📚 Code Examples Repository

All code examples are in:
- **RECODER_CODE_AUTH_INTEGRATION_GUIDE.md** (Lines 300-800)

Key classes:
1. `AuthManager` - Main authentication controller
2. `WebOAuthFlow` - Browser-based OAuth
3. `DeviceFlow` - Headless authentication
4. `ApiKeyManager` - OpenRouter key management
5. `UsageTracker` - Usage tracking and quota
6. `TokenRefresh` - Auto token refresh
7. `AuthErrorHandler` - Error handling

---

## 🎯 Next Steps for AI Copilot

1. **Read Main Guide**: Open `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
2. **Study Flows**: Review `CLI_AUTH_FLOWS_VISUAL.md`
3. **Start Implementing**: Follow Phase 1-5 above
4. **Test Each Phase**: Use the testing checklist
5. **Handle Errors**: Implement all error cases
6. **Polish UX**: Add status bar, notifications, settings

---

## 💡 Pro Tips

1. **Start with Web OAuth** - Easiest to test and debug
2. **Mock the API first** - Test UI flow before backend integration
3. **Use VS Code secrets** - Never use workspace storage for tokens
4. **Auto-refresh tokens** - Don't wait for 401 errors
5. **Show quota in UI** - Keep users informed
6. **Handle offline mode** - Cache last known state
7. **Test free tier thoroughly** - Most users will be free
8. **Make upgrade prompts subtle** - Don't be annoying

---

## 🔗 Quick Links

- Main Guide: `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md`
- Visual Flows: `CLI_AUTH_FLOWS_VISUAL.md`
- API Base URL: `https://recoder.xyz`
- OpenRouter: `https://openrouter.ai`
- VS Code Auth API: https://code.visualstudio.com/api/references/vscode-api#authentication

---

## 📦 Payment Integration Note

**DODO Pay**: Standard payment SDK (NOT crypto-only)
- Supports credit/debit cards
- Bank transfers
- Multiple currencies
- International payments
- Subscription billing
- Use alongside Paddle for comprehensive coverage

**Paddle**: Primary payment processor
- Credit/debit cards
- PayPal
- Subscription management
- Invoicing
- Tax handling

Both are fully integrated in the backend (`/api/billing/checkout/*`).

---

**Total Implementation Time**: 5-6 hours

**Priority**: HIGH - Required for extension to function

**Complexity**: MEDIUM - Well-documented APIs, standard OAuth flows

---

**End of Summary** ✅

Start with `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md` for complete implementation details!
