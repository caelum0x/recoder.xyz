# Recoder.xyz Authentication Flows - Visual Guide

**Quick Reference for AI Copilot**

---

## 🎯 Business Logic Overview

### User Tiers & Requirements

```
┌──────────────┬────────────────────┬──────────────┬─────────────────┐
│  Tier        │  API Key Required? │  Usage Limit │  Cost           │
├──────────────┼────────────────────┼──────────────┼─────────────────┤
│  Free        │  ✅ YES (own key)  │  1K/month    │  $0             │
│  Pro         │  ❌ NO (platform)  │  50K/month   │  $29.99/month   │
│  Enterprise  │  ❌ NO (dedicated) │  1M/month    │  $299.99/month  │
└──────────────┴────────────────────┴──────────────┴─────────────────┘
```

### User Journey Map

```
User installs recoder-code
         │
         ↓
    First launch
         │
         ↓
   Not authenticated? ────────> Prompt: "Sign in to Recoder"
         │                              │
         │                              ↓
         │                       Choose auth method
         │                              │
         │                    ┌─────────┴─────────┐
         │                    │                   │
         │                    ↓                   ↓
         │              Web OAuth           Device Flow
         │                    │                   │
         │                    └─────────┬─────────┘
         │                              │
         ↓                              ↓
    Already authenticated        First-time user?
         │                              │
         │                              ↓
         │                       Create account
         │                       Save to database
         │                              │
         │                              ↓
         │                       Check subscription
         │                              │
         │                    ┌─────────┴─────────┐
         │                    │                   │
         │                    ↓                   ↓
         │              Free Tier          Premium Tier
         │                    │                   │
         │                    ↓                   │
         │          Prompt for API key            │
         │          (OpenRouter)                  │
         │                    │                   │
         │                    └─────────┬─────────┘
         │                              │
         ↓                              ↓
    Validate session              Session ready
         │                              │
         │                              ↓
         ↓                       Track usage
    Make AI requests            Check quota
         │                       Show limits
         ↓
    Track usage
    Enforce quotas
```

---

## 🔐 Authentication Flow 1: Web OAuth (Primary)

### Visual Flow

```
┌──────────────┐
│ recoder-code │ VS Code Extension
│   Extension  │
└──────┬───────┘
       │
       │ 1. User clicks "Sign In"
       │    or extension auto-prompts
       │
       ↓
┌──────────────────────────────────────────┐
│  Generate OAuth Request                  │
│  - client_id: "recoder-code"             │
│  - redirect_uri: "http://localhost:8080" │
│  - state: random_string (CSRF token)     │
│  - scope: "cli:full profile"             │
└──────┬───────────────────────────────────┘
       │
       │ 2. Start local HTTP server on :8080
       │    to receive callback
       │
       ↓
┌──────────────────────────────────────────┐
│  Build Authorization URL                 │
│  https://recoder.xyz/api/auth/cli        │
│  ?response_type=code                     │
│  &client_id=recoder-code                 │
│  &redirect_uri=http://localhost:8080     │
│  &state=xxx                              │
│  &scope=cli:full profile                 │
└──────┬───────────────────────────────────┘
       │
       │ 3. Open browser (vscode.env.openExternal)
       │
       ↓
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 4. User sees recoder.xyz login page
       │
       ↓
┌──────────────────────────────────────────┐
│  Login Options:                          │
│  • Email + Password                      │
│  • GitHub OAuth                          │
│  • Google OAuth                          │
│  • Discord OAuth                         │
└──────┬───────────────────────────────────┘
       │
       │ 5. User authenticates
       │
       ↓
┌──────────────────────────────────────────┐
│  recoder.xyz Backend                     │
│  • Find or create user in database       │
│  • Generate authorization code           │
│  • Store code with user_id               │
└──────┬───────────────────────────────────┘
       │
       │ 6. Redirect to callback URL
       │    http://localhost:8080/callback
       │    ?code=AUTH_CODE
       │    &state=xxx
       │
       ↓
┌──────────────┐
│ Local Server │ (running in extension)
└──────┬───────┘
       │
       │ 7. Receive callback
       │    • Validate state (CSRF check)
       │    • Extract authorization code
       │    • Close browser window
       │    • Shutdown local server
       │
       ↓
┌──────────────────────────────────────────┐
│  Exchange Code for Tokens                │
│  POST https://recoder.xyz/api/auth/cli   │
│  {                                        │
│    "action": "exchange_code",            │
│    "grant_type": "authorization_code",   │
│    "client_id": "recoder-code",          │
│    "code": "AUTH_CODE",                  │
│    "redirect_uri": "http://localhost..." │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 8. Receive tokens + user data
       │
       ↓
┌──────────────────────────────────────────┐
│  Response:                               │
│  {                                        │
│    "success": true,                      │
│    "access_token": "rct_xxx",            │
│    "refresh_token": "rcr_xxx",           │
│    "expires_at": "2024-02-01...",        │
│    "user": {                             │
│      "id": "usr_xxx",                    │
│      "email": "user@example.com",        │
│      "name": "John Doe",                 │
│      "subscription_plan": "free",        │
│      "has_own_api_key": false,           │
│      "quota": {                          │
│        "requests_remaining": 1000,       │
│        "requests_limit": 1000            │
│      }                                    │
│    }                                      │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 9. Store securely
       │
       ↓
┌──────────────────────────────────────────┐
│  VS Code Secrets API                     │
│  • secrets.store("accessToken", ...)     │
│  • secrets.store("refreshToken", ...)    │
│  • secrets.store("user", JSON.stringify) │
└──────┬───────────────────────────────────┘
       │
       │ 10. Check if API key needed
       │
       ↓
┌──────────────────────────────────────────┐
│  if (user.subscription_plan === "free"   │
│      && !user.has_own_api_key) {         │
│    // Prompt for OpenRouter API key      │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       ↓
    ✅ Ready to use!
```

### Code Flow

```typescript
// 1. Start authentication
async function startWebOAuth() {
  const state = nanoid(32);
  const redirectUri = 'http://localhost:8080/callback';
  
  // 2. Start local server
  const codePromise = startLocalServer(state);
  
  // 3. Open browser
  const authUrl = `https://recoder.xyz/api/auth/cli?` +
    `response_type=code&` +
    `client_id=recoder-code&` +
    `redirect_uri=${redirectUri}&` +
    `state=${state}&` +
    `scope=cli:full profile`;
  
  await vscode.env.openExternal(vscode.Uri.parse(authUrl));
  
  // 4. Wait for callback
  const code = await codePromise;
  
  // 5. Exchange code for tokens
  const response = await axios.post('https://recoder.xyz/api/auth/cli', {
    action: 'exchange_code',
    grant_type: 'authorization_code',
    client_id: 'recoder-code',
    code: code,
    redirect_uri: redirectUri
  });
  
  // 6. Save tokens
  await context.secrets.store('accessToken', response.data.access_token);
  await context.secrets.store('refreshToken', response.data.refresh_token);
  await context.secrets.store('user', JSON.stringify(response.data.user));
  
  // 7. Check if API key needed
  if (response.data.user.subscription_plan === 'free' && 
      !response.data.user.has_own_api_key) {
    await promptForApiKey(response.data.access_token);
  }
}
```

---

## 🔐 Authentication Flow 2: Device Flow (Headless)

### Visual Flow

```
┌──────────────┐
│ recoder-code │ VS Code Extension (SSH/Remote)
│   Extension  │
└──────┬───────┘
       │
       │ 1. User runs in SSH session
       │    (no local browser available)
       │
       ↓
┌──────────────────────────────────────────┐
│  Request Device Code                     │
│  POST https://recoder.xyz/api/auth/cli   │
│  {                                        │
│    "action": "device_flow",              │
│    "client_id": "recoder-code",          │
│    "scope": "cli:full profile"           │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 2. Receive device code
       │
       ↓
┌──────────────────────────────────────────┐
│  Response:                               │
│  {                                        │
│    "device_code": "long_random_string",  │
│    "user_code": "ABCD-1234",             │
│    "verification_uri":                   │
│      "https://recoder.xyz/auth/device",  │
│    "verification_uri_complete":          │
│      "https://recoder.xyz/auth/device    │
│       ?user_code=ABCD-1234",             │
│    "expires_in": 900,  // 15 minutes     │
│    "interval": 5       // poll every 5s  │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 3. Display to user
       │
       ↓
┌──────────────────────────────────────────┐
│  VS Code Notification:                   │
│                                           │
│  To authenticate:                        │
│  1. Visit: https://recoder.xyz/auth/device│
│  2. Enter code: ABCD-1234                │
│                                           │
│  [Open Browser]  [I'll do it manually]   │
└──────┬───────────────────────────────────┘
       │
       │ 4. Start polling (background)
       │    while user authorizes
       │
       ↓
┌──────────────────────────────────────────┐
│  Poll Loop (every 5 seconds):            │
│  POST https://recoder.xyz/api/auth/cli   │
│  {                                        │
│    "action": "device_token",             │
│    "device_code": "xxx",                 │
│    "grant_type": "urn:ietf:params:oauth: │
│                   grant-type:device_code"│
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 5. Response while pending:
       │    { "error": "authorization_pending" }
       │
       ↓
   Continue polling...
       │
       │ (Meanwhile, on user's phone/computer)
       │
       ↓
┌─────────────────┐
│  User's Browser │
└──────┬──────────┘
       │
       │ 6. User visits verification URL
       │
       ↓
┌──────────────────────────────────────────┐
│  https://recoder.xyz/auth/device         │
│                                           │
│  Enter your code:                        │
│  [A][B][C][D]-[1][2][3][4]               │
│                                           │
│  [Continue]                              │
└──────┬───────────────────────────────────┘
       │
       │ 7. User enters code
       │
       ↓
┌──────────────────────────────────────────┐
│  Validate Code                           │
│  • Find device_code by user_code         │
│  • Check expiration                      │
│  • Show authorization page               │
└──────┬───────────────────────────────────┘
       │
       │ 8. User authorizes
       │
       ↓
┌──────────────────────────────────────────┐
│  Update Device Code Status               │
│  • Mark as "authorized"                  │
│  • Link to user account                  │
│  • Generate tokens                       │
└──────┬───────────────────────────────────┘
       │
       │ 9. Next poll from extension
       │
       ↓
┌──────────────────────────────────────────┐
│  Poll Response (success!):               │
│  {                                        │
│    "success": true,                      │
│    "access_token": "rct_xxx",            │
│    "refresh_token": "rcr_xxx",           │
│    "user": { ... }                       │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ 10. Stop polling
       │     Store tokens
       │
       ↓
    ✅ Ready to use!
```

### Code Flow

```typescript
// 1. Request device code
async function startDeviceFlow() {
  const response = await axios.post('https://recoder.xyz/api/auth/cli', {
    action: 'device_flow',
    client_id: 'recoder-code'
  });
  
  const { 
    device_code, 
    user_code, 
    verification_uri,
    interval 
  } = response.data;
  
  // 2. Show instructions to user
  vscode.window.showInformationMessage(
    `Visit ${verification_uri} and enter code: ${user_code}`,
    'Open Browser'
  );
  
  // 3. Start polling
  const tokens = await pollForAuthorization(device_code, interval * 1000);
  
  // 4. Save tokens
  await context.secrets.store('accessToken', tokens.access_token);
  // ...
}

async function pollForAuthorization(deviceCode, interval) {
  while (true) {
    await sleep(interval);
    
    try {
      const response = await axios.post('https://recoder.xyz/api/auth/cli', {
        action: 'device_token',
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
      
      if (response.data.success) {
        return response.data; // Authorized!
      }
    } catch (error) {
      if (error.response?.data?.error === 'authorization_pending') {
        continue; // Keep polling
      }
      throw error; // Other error
    }
  }
}
```

---

## 🔑 API Key Collection Flow (Free Users Only)

### Visual Flow

```
After successful authentication
         │
         ↓
┌──────────────────────────────────────────┐
│  Check User Subscription                 │
│  if (user.subscription_plan === "free")  │
└──────┬───────────────────────────────────┘
       │
       │ YES: Free tier
       │
       ↓
┌──────────────────────────────────────────┐
│  Check if API Key Already Provided       │
│  if (!user.has_own_api_key)              │
└──────┬───────────────────────────────────┘
       │
       │ NO: Need API key
       │
       ↓
┌──────────────────────────────────────────┐
│  Show Explanation Modal                  │
│                                           │
│  Free tier requires your own             │
│  OpenRouter API key                      │
│                                           │
│  [Get API Key] [Enter Key] [Skip]        │
└──────┬───────────────────────────────────┘
       │
       │ User clicks "Get API Key"
       │
       ↓
┌──────────────────────────────────────────┐
│  Open Browser                            │
│  https://openrouter.ai/keys              │
│                                           │
│  User creates account & generates key    │
└──────┬───────────────────────────────────┘
       │
       │ User returns with key
       │
       ↓
┌──────────────────────────────────────────┐
│  Prompt for API Key                      │
│  vscode.window.showInputBox({            │
│    prompt: "Enter OpenRouter API key",   │
│    password: true,                       │
│    placeHolder: "sk-or-v1-..."           │
│  })                                       │
└──────┬───────────────────────────────────┘
       │
       │ User enters: sk-or-v1-xxx
       │
       ↓
┌──────────────────────────────────────────┐
│  Validate Format                         │
│  if (!key.startsWith("sk-or-")) {        │
│    return "Invalid key format"           │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ Valid format
       │
       ↓
┌──────────────────────────────────────────┐
│  Send to Server (Encrypted Storage)     │
│  POST https://recoder.xyz/api/user/      │
│       openrouter                         │
│  Authorization: Bearer rct_xxx           │
│  {                                        │
│    "openRouterApiKey": "sk-or-v1-xxx"    │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ Server encrypts & stores
       │
       ↓
┌──────────────────────────────────────────┐
│  Backend Process:                        │
│  1. Validate token                       │
│  2. Encrypt API key (AES-256-GCM)        │
│  3. Store in database:                   │
│     UPDATE users SET                     │
│       openRouterApiKey = encrypted_key,  │
│       hasOwnApiKey = true,               │
│       onboardingStep = 'completed'       │
│     WHERE id = user_id                   │
└──────┬───────────────────────────────────┘
       │
       │ Success response
       │
       ↓
┌──────────────────────────────────────────┐
│  Show Success Message                    │
│  ✅ API key saved successfully!          │
│                                           │
│  You can now use all AI features         │
└──────┬───────────────────────────────────┘
       │
       ↓
    ✅ Setup complete!
```

### Usage During AI Requests

```
User makes AI request in extension
         │
         ↓
┌──────────────────────────────────────────┐
│  Check User Tier                         │
│  const user = await getUser()            │
└──────┬───────────────────────────────────┘
       │
       ├─── FREE USER
       │    │
       │    ↓
       │ ┌──────────────────────────────────┐
       │ │ Get User's OpenRouter API Key    │
       │ │ GET /api/user/openrouter         │
       │ │ Authorization: Bearer rct_xxx    │
       │ └──────┬───────────────────────────┘
       │        │
       │        ↓
       │ ┌──────────────────────────────────┐
       │ │ Use User's API Key for Request   │
       │ │ POST https://openrouter.ai/api/  │
       │ │      v1/chat/completions         │
       │ │ Authorization: Bearer sk-or-...  │
       │ └──────┬───────────────────────────┘
       │        │
       │        └────────┐
       │                 │
       └─── PREMIUM USER │
            │            │
            ↓            │
       ┌────────────────────────────────────┐
       │ Use Platform API Key (Rotation)    │
       │ - Server picks key from pool       │
       │ - Round-robin or least-used        │
       │ - User never sees these keys       │
       └────────┬───────────────────────────┘
                │
                ↓
         ┌──────┴───────┐
         │              │
         ↓              ↓
    Track usage    Update quota
         │              │
         └──────┬───────┘
                │
                ↓
         Response to user
```

---

## 📊 Usage Tracking Flow

### Every Request Flow

```
User makes AI request
         │
         ↓
┌──────────────────────────────────────────┐
│  Before Request:                         │
│  1. Validate token                       │
│  2. Check quota                          │
│  3. Get appropriate API key              │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Check Quota                             │
│  GET /api/user/quota                     │
│  Authorization: Bearer rct_xxx           │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Quota Response:                         │
│  {                                        │
│    "requests_remaining": 850,            │
│    "requests_limit": 1000,               │
│    "tokens_used": 150000,                │
│    "reset_date": "2024-02-01..."         │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       ├─── requests_remaining > 0
       │    ↓
       │    ✅ Allow request
       │
       └─── requests_remaining <= 0
            ↓
            ❌ Show upgrade prompt
            
After successful request:
         │
         ↓
┌──────────────────────────────────────────┐
│  Track Usage                             │
│  POST /api/usage/track                   │
│  Authorization: Bearer rct_xxx           │
│  {                                        │
│    "requestType": "chat_completion",     │
│    "modelUsed": "gpt-4",                 │
│    "tokensUsed": 1234,                   │
│    "cost": 0.05,                         │
│    "success": true,                      │
│    "duration": 2500                      │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Backend Updates:                        │
│  UPDATE user_quotas SET                  │
│    requestsUsed = requestsUsed + 1,      │
│    tokensUsed = tokensUsed + 1234,       │
│    costThisPeriod = costThisPeriod + 0.05│
│  WHERE userId = xxx                      │
│                                           │
│  INSERT INTO usage_records (...)         │
└──────┬───────────────────────────────────┘
       │
       ↓
    ✅ Request complete
```

---

## 🔄 Token Refresh Flow

### Automatic Refresh

```
Extension makes API request
         │
         ↓
┌──────────────────────────────────────────┐
│  Get Access Token                        │
│  const token = await secrets.get(...)    │
│  const expiresAt = await secrets.get(..) │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Check Expiration                        │
│  if (Date.now() >= expiresAt - 5min) {   │
│    // Token expired or expires soon      │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       │ Token expiring soon
       │
       ↓
┌──────────────────────────────────────────┐
│  Refresh Token                           │
│  POST /api/auth/cli                      │
│  {                                        │
│    "action": "refresh_token",            │
│    "refresh_token": "rcr_xxx",           │
│    "client_id": "recoder-code"           │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Response:                               │
│  {                                        │
│    "success": true,                      │
│    "access_token": "rct_new_xxx",        │
│    "expires_at": "...",                  │
│    "user": { updated data }              │
│  }                                        │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Store New Token                         │
│  secrets.store("accessToken", ...)       │
│  secrets.store("expiresAt", ...)         │
└──────┬───────────────────────────────────┘
       │
       ↓
    Continue with request
```

---

## 🎯 Quick Reference: All Endpoints

```typescript
// Authentication
POST /api/auth/cli { action: "device_flow" }
POST /api/auth/cli { action: "exchange_code" }
POST /api/auth/cli { action: "validate_token" }
POST /api/auth/cli { action: "refresh_token" }
POST /api/auth/cli { action: "device_token" }

// User Management
GET  /api/user/profile
GET  /api/user/subscription
GET  /api/user/quota

// API Key Management (Free Users)
POST /api/user/openrouter { openRouterApiKey: "..." }
GET  /api/user/openrouter
GET  /api/user/openrouter/validate

// Usage Tracking
POST /api/usage/track { tokensUsed, modelUsed, ... }
GET  /api/usage/history?period=month

// Billing
GET  /api/billing/plans
POST /api/billing/checkout/paddle
POST /api/billing/checkout/dodo
```

---

## ✅ Implementation Checklist

```
Authentication:
  ☐ Web OAuth flow
  ☐ Device flow
  ☐ Token storage (secrets API)
  ☐ Token validation
  ☐ Token refresh
  ☐ Logout

User Management:
  ☐ Check subscription tier
  ☐ Prompt API key (free users)
  ☐ Validate API key
  ☐ Store API key (encrypted on server)
  ☐ Retrieve API key for requests

Usage Tracking:
  ☐ Check quota before requests
  ☐ Track each request
  ☐ Show quota in UI
  ☐ Handle quota exceeded
  ☐ Auto-reset monthly

Premium vs Free:
  ☐ Free: Use user's OpenRouter key
  ☐ Premium: Use platform keys
  ☐ Track usage differently
  ☐ Show upgrade prompts

Error Handling:
  ☐ Network errors
  ☐ Authentication failures
  ☐ Quota exceeded
  ☐ API key errors
  ☐ Token expiration
```

---

**End of Visual Guide** 🎉

Use this guide alongside `RECODER_CODE_AUTH_INTEGRATION_GUIDE.md` for complete implementation details.
