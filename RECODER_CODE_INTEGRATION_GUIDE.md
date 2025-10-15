# Recoder Code - Authentication Integration Guide

## 🎯 Purpose
This document guides the AI Copilot in **recoder-code** workspace on how to integrate authentication with **recoder.xyz** backend.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RECODER ECOSYSTEM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐        │
│  │ recoder.xyz  │◄─────►│web.recoder.  │◄─────►│api.recoder.  │        │
│  │  (Landing)   │       │xyz (Bolt AI) │       │xyz (Backend) │        │
│  │              │       │              │       │              │        │
│  │ • Marketing  │       │ • IDE        │       │ • Auth       │        │
│  │ • Pricing    │       │ • Generator  │       │ • Billing    │        │
│  │ • Auth Pages │       │ • Deploy     │       │ • Usage      │        │
│  └──────┬───────┘       └──────┬───────┘       └──────┬───────┘        │
│         │                      │                       │                │
│         └──────────────────────┴───────────────────────┘                │
│                                │                                         │
│                         Authenticated Session                            │
│                                │                                         │
│                    ┌───────────▼───────────┐                            │
│                    │   recoder-code CLI    │                            │
│                    │ (VS Code Extension)   │                            │
│                    └───────────────────────┘                            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 User Flow - Complete Journey

### Phase 1: First Installation & Free Tier

```
Step 1: User installs recoder-code extension
   │
   ├─► Extension detects no auth session
   │
   ├─► Show onboarding: "Welcome! Connect to recoder.xyz"
   │
   └─► User clicks "Connect"
        │
        └─► Opens browser → https://recoder.xyz/auth/cli
             │
             ├─► New user? → Register (Email/GitHub/Google)
             ├─► Existing user? → Sign In
             │
             └─► After successful auth:
                  │
                  ├─► Create user record in database
                  ├─► Initialize FREE tier quota (1,000 requests/month)
                  ├─► Show API Key Collection Modal
                  │    │
                  │    ├─► User must add OpenRouter API key
                  │    ├─► Validate key with OpenRouter
                  │    ├─► Encrypt & store key in database
                  │    └─► Mark onboarding as complete
                  │
                  └─► Redirect back to CLI: http://localhost:8080/callback
                       │
                       └─► CLI receives auth code
                            │
                            ├─► Exchange code for access token
                            ├─► Store session in ~/.recoder/auth.json
                            ├─► Show: "✅ Connected as user@email.com"
                            └─► Ready to use!

✅ FREE User Can Now:
   • Generate code using THEIR OpenRouter API key
   • 1,000 requests/month limit
   • Usage tracked against their quota
   • Each request deducts from their limit
```

### Phase 2: Upgrade to Paid Subscription

```
Step 2: User wants more features or hits free limit
   │
   ├─► User visits https://recoder.xyz/pricing
   │
   ├─► Clicks "Upgrade to PRO" ($49/month)
   │
   └─► Payment page (Paddle or DODO Pay)
        │
        ├─► Enter payment details
        ├─► Process payment
        ├─► Webhook receives payment confirmation
        │
        └─► Backend updates user record:
             │
             ├─► subscriptionPlan: "pro"
             ├─► subscriptionStatus: "active"
             ├─► Remove OpenRouter API key requirement
             ├─► Update quota: 50,000 requests/month
             ├─► hasOwnApiKey: false (now uses platform keys)
             │
             └─► Sync session to CLI
                  │
                  └─► Next CLI request shows:
                       │
                       └─► "🎉 PRO Subscription Active!"
                           "Using platform AI without API key"
                           "50,000 requests/month available"

✅ PRO User Benefits:
   • No OpenRouter API key needed
   • Platform manages AI API keys (load balanced)
   • 50,000 requests/month
   • Priority support
   • Advanced features unlocked
```

### Phase 3: Premium User Experience

```
Step 3: PRO user uses recoder-code
   │
   ├─► User types: /generate "React app with auth"
   │
   └─► CLI checks authentication
        │
        ├─► Valid session? ✅
        ├─► Check subscription plan → "pro"
        ├─► Check quota: 45,234/50,000 remaining ✅
        │
        └─► Process request:
             │
             ├─► User has own key? NO (premium user)
             ├─► Select platform API key (load balanced)
             ├─► Route to OpenRouter with platform key
             ├─► Generate code with AI
             ├─► Track usage: tokens, cost, model used
             ├─► Update quota: 45,233/50,000 remaining
             │
             └─► Return generated code to user
                  │
                  └─► Show usage stats in status bar:
                       "45,233/50,000 requests remaining"
```

---

## 🔐 Authentication API Endpoints

All auth endpoints are at: **https://recoder.xyz/api/auth/**

### 1. Web OAuth Flow (Recommended)

**CLI Initiates:**
```typescript
// Step 1: Open browser to authorize
window.open('https://recoder.xyz/api/auth/cli?' + new URLSearchParams({
  client_id: 'recoder-cli',
  redirect_uri: 'http://localhost:8080/auth/callback',
  response_type: 'code',
  state: generateRandomState(),
  scope: 'cli:full profile'
}));

// Step 2: Start callback server on port 8080
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost:8080');
  
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    // Step 3: Exchange code for tokens
    const response = await fetch('https://recoder.xyz/api/auth/cli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'exchange_code',
        code,
        client_id: 'recoder-cli',
        redirect_uri: 'http://localhost:8080/auth/callback'
      })
    });
    
    const { access_token, refresh_token, user } = await response.json();
    
    // Step 4: Save session
    await saveSession({
      access_token,
      refresh_token,
      user,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    res.end('✅ Authentication successful! You can close this window.');
    server.close();
  }
});

server.listen(8080);
```

### 2. Device Flow (SSH/Headless)

```typescript
// Step 1: Request device code
const response = await fetch('https://recoder.xyz/api/auth/cli', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'device_flow',
    client_id: 'recoder-cli',
    scope: 'cli:full profile'
  })
});

const { device_code, user_code, verification_uri, interval } = await response.json();

// Step 2: Show user instructions
console.log(`
🔐 Device Authorization Required
1. Visit: ${verification_uri}
2. Enter code: ${user_code}
⏳ Waiting for authorization...
`);

// Step 3: Poll for authorization
const pollInterval = setInterval(async () => {
  const pollResponse = await fetch('https://recoder.xyz/api/auth/cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'device_token',
      device_code,
      client_id: 'recoder-cli'
    })
  });
  
  const result = await pollResponse.json();
  
  if (result.error === 'authorization_pending') {
    // Still waiting...
    return;
  }
  
  if (result.success) {
    clearInterval(pollInterval);
    
    // Save session
    await saveSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      user: result.user,
      expires_at: result.expires_at
    });
    
    console.log('✅ Device authorized successfully!');
  }
}, interval * 1000);
```

### 3. API Key Authentication

```typescript
// User generates API key on website: https://recoder.xyz/settings/api-keys
// Then uses it in CLI

const response = await fetch('https://recoder.xyz/api/auth/cli', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'validate_token',
    token: 'rcli_8a7f92b3_1704564000_9f2c8e4a12b5_ab12cd34'
  })
});

const { user } = await response.json();

await saveSession({
  api_key: 'rcli_8a7f92b3_1704564000_9f2c8e4a12b5_ab12cd34',
  user,
  expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
});
```

---

## 💾 Database Schema - What Gets Stored

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  avatar TEXT,
  
  -- Subscription
  subscription_plan TEXT DEFAULT 'free', -- free, pro, enterprise
  subscription_status TEXT DEFAULT 'active', -- active, canceled, past_due
  
  -- API Key Management (FREE USERS)
  open_router_api_key TEXT, -- Encrypted OpenRouter key
  has_own_api_key BOOLEAN DEFAULT false,
  api_key_encrypted BOOLEAN DEFAULT false,
  onboarding_step TEXT, -- 'completed', 'pending_api_key', etc.
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);
```

### User Quota Table
```sql
CREATE TABLE user_quotas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  
  -- Request Limits
  requests_limit INT DEFAULT 1000, -- Free: 1k, Pro: 50k
  requests_used INT DEFAULT 0,
  
  -- Token Limits
  tokens_limit BIGINT DEFAULT 1000000,
  tokens_used BIGINT DEFAULT 0,
  
  -- Billing Period
  period_start TIMESTAMP DEFAULT NOW(),
  period_end TIMESTAMP,
  last_reset_at TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Usage Records Table
```sql
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT,
  
  -- Request Details
  request_type TEXT, -- cli, api, web
  endpoint TEXT,
  method TEXT,
  status_code INT,
  
  -- AI Usage
  tokens_used INT,
  cost FLOAT,
  model_used TEXT, -- claude-3-sonnet, gpt-4, etc.
  provider_used TEXT, -- openrouter, anthropic, openai
  
  -- Metadata
  duration INT, -- milliseconds
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Request Flow with Usage Tracking

### Every API Request to recoder.xyz

```typescript
// 1. Attach auth header
const headers = {
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json'
};

// 2. Make request to generate code
const response = await fetch('https://api.recoder.xyz/v1/generate', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    prompt: 'Create a React login component',
    model: 'claude-3-sonnet',
    max_tokens: 2000
  })
});

// 3. Backend automatically:
//    a. Validates JWT token
//    b. Loads user from database
//    c. Checks subscription plan
//    d. Checks quota (requests_used < requests_limit)
//    e. If FREE user → Use user's OpenRouter key
//    f. If PRO user → Use platform key (load balanced)
//    g. Process AI request
//    h. Track usage in usage_records table
//    i. Update user_quotas (increment requests_used, tokens_used)
//    j. Return generated code

const data = await response.json();

// 4. Response includes usage info
console.log(`
✅ Code generated successfully!
📊 Usage: ${data.usage.tokens_used} tokens
💰 Cost: $${data.usage.cost.toFixed(4)}
📈 Quota: ${data.quota.requests_remaining}/${data.quota.requests_limit} remaining
`);
```

---

## 💳 Payment Integration

### Paddle (Primary Payment Provider)

```typescript
// 1. User clicks "Upgrade to PRO" on website
// Opens: https://recoder.xyz/pricing

// 2. User selects plan and clicks checkout
const checkout = await fetch('https://recoder.xyz/api/paddle/checkout', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plan: 'pro', // or 'enterprise'
    billing_cycle: 'monthly' // or 'annual'
  })
});

const { checkout_url } = await checkout.json();

// 3. Redirect to Paddle checkout
window.location.href = checkout_url;

// 4. After payment, Paddle sends webhook to:
// https://recoder.xyz/api/paddle/webhook

// 5. Webhook handler updates database:
await prisma.user.update({
  where: { id: userId },
  data: {
    subscription_plan: 'pro',
    subscription_status: 'active',
    open_router_api_key: null, // Remove API key
    has_own_api_key: false,
    onboarding_step: 'completed'
  }
});

await prisma.userQuota.update({
  where: { userId },
  data: {
    requests_limit: 50000,
    tokens_limit: 50000000,
    requests_used: 0, // Reset
    tokens_used: 0,
    period_start: new Date(),
    period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }
});

// 6. User's next CLI request automatically reflects new plan
```

### DODO Pay (Alternative Payment Provider)

```typescript
// Similar flow but using DODO Pay API
const checkout = await fetch('https://recoder.xyz/api/dodo/checkout', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plan: 'pro',
    billing_cycle: 'monthly'
  })
});

// Webhook: https://recoder.xyz/api/dodo/webhook
```

---

## 📊 Usage Tracking & Quota Enforcement

### Middleware on Every Request

```typescript
// backend/src/middleware/usage-tracking.ts
export async function usageTrackingMiddleware(req, res, next) {
  const userId = req.user.id; // From JWT
  const startTime = Date.now();
  
  try {
    // 1. Check quota BEFORE processing
    const quota = await prisma.userQuota.findUnique({
      where: { userId }
    });
    
    if (!quota) {
      return res.status(403).json({
        error: 'No quota found',
        message: 'Please contact support'
      });
    }
    
    if (quota.requests_used >= quota.requests_limit) {
      return res.status(429).json({
        error: 'Quota exceeded',
        message: `You have used ${quota.requests_used}/${quota.requests_limit} requests this month`,
        upgrade_url: 'https://recoder.xyz/pricing'
      });
    }
    
    // 2. Process request
    await next();
    
    // 3. Track usage AFTER success
    const duration = Date.now() - startTime;
    const tokensUsed = req.aiResponse?.tokens || 0;
    const cost = calculateCost(tokensUsed, req.modelUsed);
    
    await prisma.usageRecord.create({
      data: {
        userId,
        sessionId: req.sessionId,
        request_type: 'cli',
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        tokens_used: tokensUsed,
        cost,
        model_used: req.modelUsed,
        provider_used: req.providerUsed,
        duration,
        success: res.statusCode < 400,
        timestamp: new Date()
      }
    });
    
    // 4. Update quota
    await prisma.userQuota.update({
      where: { userId },
      data: {
        requests_used: { increment: 1 },
        tokens_used: { increment: tokensUsed }
      }
    });
    
  } catch (error) {
    console.error('Usage tracking error:', error);
  }
}
```

---

## 🎨 CLI User Experience

### Status Bar Info
```
┌─────────────────────────────────────────────────────┐
│ Recoder • PRO • 45,234/50,000 requests • ✅ Online │
└─────────────────────────────────────────────────────┘
```

### Quota Warning (90%)
```
⚠️  Quota Warning: 90% used (45,000/50,000 requests)
💡 Consider upgrading or add your own API key
   Visit: https://recoder.xyz/pricing
```

### Quota Exceeded
```
❌ Quota Exceeded: 50,000/50,000 requests used
🔒 Your account has reached the monthly limit

Options:
1. Upgrade to higher tier → https://recoder.xyz/pricing
2. Add your own OpenRouter API key → https://recoder.xyz/settings/api-keys
3. Wait until next billing cycle (resets in 5 days)
```

---

## 🔧 Environment Variables for recoder-code

### Production URLs
```bash
# Backend API
RECODER_API_URL=https://api.recoder.xyz

# Website (for OAuth)
RECODER_WEB_URL=https://recoder.xyz

# Bolt-like IDE
RECODER_APP_URL=https://web.recoder.xyz

# OAuth Callback (local)
RECODER_CALLBACK_URL=http://localhost:8080/auth/callback

# CLI Client ID
RECODER_CLIENT_ID=recoder-cli
```

### Development URLs
```bash
# For local testing
RECODER_API_URL=http://localhost:3001
RECODER_WEB_URL=http://localhost:3002
RECODER_APP_URL=http://localhost:3003
```

---

## ✅ Implementation Checklist for recoder-code

### Phase 1: Basic Auth ✅
- [ ] Implement OAuth web flow
- [ ] Implement device flow
- [ ] Implement API key auth
- [ ] Store session in secure storage
- [ ] Add auth status command
- [ ] Add logout command

### Phase 2: Session Management ✅
- [ ] Auto-refresh tokens before expiry
- [ ] Handle token expiration gracefully
- [ ] Sync session across platforms
- [ ] Show connection status in status bar

### Phase 3: Quota Awareness ✅
- [ ] Fetch quota on every request
- [ ] Show quota in status bar
- [ ] Warn at 90% usage
- [ ] Block at 100% usage
- [ ] Provide upgrade links

### Phase 4: User Experience ✅
- [ ] Onboarding flow for new users
- [ ] API key collection for free users
- [ ] Seamless upgrade experience
- [ ] Usage analytics display
- [ ] Helpful error messages

---

## 🚀 Quick Start Code Example

```typescript
// recoder-code/src/auth/AuthService.ts

import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

export class AuthService {
  private apiUrl = 'https://api.recoder.xyz';
  private webUrl = 'https://recoder.xyz';
  private sessionKey = 'recoder.session';
  
  async authenticateWithWeb(): Promise<void> {
    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Build auth URL
    const authUrl = new URL(`${this.webUrl}/api/auth/cli`);
    authUrl.searchParams.set('client_id', 'recoder-cli');
    authUrl.searchParams.set('redirect_uri', 'http://localhost:8080/auth/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'cli:full profile');
    
    // Start callback server
    const server = await this.startCallbackServer(state);
    
    // Open browser
    await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
    
    // Show progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Waiting for authentication...",
      cancellable: true
    }, async (progress, token) => {
      return new Promise((resolve) => {
        server.on('authenticated', resolve);
        token.onCancellationRequested(() => {
          server.close();
          resolve(undefined);
        });
      });
    });
  }
  
  private async startCallbackServer(expectedState: string): Promise<http.Server> {
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost:8080');
        
        if (url.pathname === '/auth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          
          if (state !== expectedState) {
            res.end('Invalid state parameter');
            server.close();
            return;
          }
          
          try {
            // Exchange code for tokens
            const response = await fetch(`${this.apiUrl}/auth/cli`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'exchange_code',
                code,
                client_id: 'recoder-cli',
                redirect_uri: 'http://localhost:8080/auth/callback'
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Save session
              await this.saveSession(data);
              
              res.end('✅ Authentication successful! You can close this window.');
              server.emit('authenticated', data);
              
              vscode.window.showInformationMessage(
                `✅ Authenticated as ${data.user.email}`
              );
            } else {
              res.end('❌ Authentication failed');
            }
          } catch (error) {
            res.end('❌ Error during authentication');
          }
          
          server.close();
        }
      });
      
      server.listen(8080, () => resolve(server));
    });
  }
  
  private async saveSession(data: any): Promise<void> {
    const context = vscode.ExtensionContext;
    await context.globalState.update(this.sessionKey, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      expires_at: data.expires_at
    });
  }
  
  async getSession(): Promise<any> {
    const context = vscode.ExtensionContext;
    return context.globalState.get(this.sessionKey);
  }
  
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session && new Date(session.expires_at) > new Date();
  }
}
```

---

## 📚 Additional Resources

- **Full Authentication Flows**: See `CLI_AUTH_FLOWS.md`
- **API Documentation**: See `CLI_AUTH_GUIDE.md`
- **Setup Guide**: See `SETUP_AUTHENTICATION_GUIDE.md`
- **Payment Integration**: Coming soon
- **Usage Tracking**: See usage tracking middleware

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-15  
**Maintained By**: Recoder.xyz Team
