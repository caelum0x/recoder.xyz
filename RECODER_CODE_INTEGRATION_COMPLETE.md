# Recoder Code - Authentication Integration Guide

## 🎯 Overview

This document explains how **Recoder Code** (VS Code extension / CLI) integrates with **recoder.xyz** for authentication, user management, and usage tracking.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User Ecosystem                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. recoder.xyz (Landing + Auth)                                     │
│     └─> User signs up / logs in                                      │
│     └─> User manages subscription                                    │
│     └─> User gets saved to database                                  │
│                                                                       │
│  2. web.recoder.xyz (Bolt-like IDE)                                  │
│     └─> Premium users get full access                                │
│     └─> Free users get limited access                                │
│     └─> Usage tracked by sessions (6/day limit)                      │
│                                                                       │
│  3. Recoder Code (VS Code Extension)                                 │
│     └─> Authenticates via recoder.xyz                                │
│     └─> Premium users: No API keys needed                            │
│     └─> Free users: Must provide OpenRouter API key                  │
│     └─> Usage tracked per session                                    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication Flow

### Step 1: User Installs Recoder Code

```typescript
// When user first opens Recoder Code extension
async function onExtensionActivate() {
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    showAuthenticationModal();
  }
}
```

### Step 2: User Authenticates via recoder.xyz

```typescript
// User clicks "Sign in with Recoder.xyz"
async function authenticateWithRecoder() {
  // Method 1: OAuth Web Flow (Recommended)
  const authUrl = 'https://recoder.xyz/api/auth/cli';
  const params = {
    client_id: 'recoder-code',
    redirect_uri: 'http://localhost:8080/auth/callback',
    response_type: 'code',
    scope: 'cli:full profile usage',
    state: generateRandomState()
  };
  
  // Open browser → user logs in → gets redirected back with code
  const code = await openBrowserAndWaitForCallback(authUrl, params);
  
  // Exchange code for tokens
  const response = await fetch('https://recoder.xyz/api/auth/cli', {
    method: 'POST',
    body: JSON.stringify({
      action: 'exchange_code',
      code,
      client_id: 'recoder-code'
    })
  });
  
  const { access_token, user } = await response.json();
  
  // Save session locally
  await saveSession({
    accessToken: access_token,
    user: user
  });
  
  return user;
}
```

### Step 3: Check User Plan & API Key Requirement

```typescript
async function checkUserSetup(user: User): Promise<SetupStatus> {
  // Premium users (PRO/ENTERPRISE)
  if (user.subscriptionPlan === 'pro' || user.subscriptionPlan === 'enterprise') {
    return {
      ready: true,
      needsApiKey: false,
      message: '✅ Premium plan - Ready to use!'
    };
  }
  
  // Free users - need OpenRouter API key
  if (user.subscriptionPlan === 'free') {
    if (user.hasOwnApiKey) {
      return {
        ready: true,
        needsApiKey: false,
        message: '✅ API key configured - Ready to use!'
      };
    } else {
      return {
        ready: false,
        needsApiKey: true,
        message: '⚠️ Please add your OpenRouter API key to continue'
      };
    }
  }
}
```

### Step 4: Collect OpenRouter API Key (Free Users Only)

```typescript
async function collectApiKey() {
  // Show modal with instructions
  const apiKey = await showApiKeyModal({
    title: 'OpenRouter API Key Required',
    description: 'Free plan requires your own OpenRouter API key',
    instructions: [
      '1. Visit https://openrouter.ai/keys',
      '2. Sign up/login',
      '3. Create a new API key',
      '4. Paste it below'
    ],
    upgradeOption: {
      text: 'Or upgrade to PRO to use our API keys',
      link: 'https://recoder.xyz/pricing'
    }
  });
  
  // Validate and save API key
  const response = await fetch('https://recoder.xyz/api/user/api-key', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ apiKey })
  });
  
  if (response.ok) {
    showSuccess('✅ API key saved! You can now use Recoder Code.');
  }
}
```

---

## 💳 Payment & Subscription Logic

### Pricing Plans

```typescript
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    features: {
      sessionsPerDay: 6,
      premiumModels: false, // Cannot use Claude, Gemini Pro
      requiresOwnApiKey: true,
      freeModelsUnlimited: true // Can use free models always
    }
  },
  
  pro: {
    name: 'PRO',
    price: 20, // $20/month
    features: {
      sessionsPerDay: 6,
      premiumModels: true, // Can use Claude 3.5 Sonnet, Gemini 2.0 Flash exp
      premiumModelsTokenLimit: 100000, // 100K tokens/day for premium models
      requiresOwnApiKey: false,
      freeModelsUnlimited: true
    }
  },
  
  enterprise: {
    name: 'Enterprise',
    price: 79, // $79/month
    features: {
      sessionsPerDay: 20,
      premiumModels: true,
      premiumModelsTokenLimit: 500000, // 500K tokens/day
      requiresOwnApiKey: false,
      freeModelsUnlimited: true,
      prioritySupport: true
    }
  }
};
```

### Session-Based Usage Tracking

```typescript
interface Session {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  tokensUsed: number;
  modelsUsed: string[];
  costEstimate: number;
  status: 'active' | 'completed' | 'abandoned';
}

// Track usage by sessions, not individual requests
async function startNewSession(userId: string): Promise<Session> {
  // Check daily session limit
  const todaySessions = await getUserSessionsToday(userId);
  const user = await getUser(userId);
  const plan = PLANS[user.subscriptionPlan];
  
  if (todaySessions.length >= plan.features.sessionsPerDay) {
    throw new Error(`Daily session limit reached (${plan.features.sessionsPerDay}/day)`);
  }
  
  // Create new session
  const session = await createSession({
    userId,
    startTime: new Date(),
    tokensUsed: 0,
    modelsUsed: [],
    costEstimate: 0,
    status: 'active'
  });
  
  return session;
}

async function trackSessionUsage(sessionId: string, usage: {
  model: string;
  tokens: number;
  cost: number;
}) {
  // Update session stats
  await updateSession(sessionId, {
    tokensUsed: { increment: usage.tokens },
    costEstimate: { increment: usage.cost },
    modelsUsed: { push: usage.model }
  });
  
  // Check if premium model token limit exceeded
  const session = await getSession(sessionId);
  const user = await getUser(session.userId);
  
  if (isPremiumModel(usage.model)) {
    const plan = PLANS[user.subscriptionPlan];
    if (session.tokensUsed > plan.features.premiumModelsTokenLimit) {
      throw new Error('Premium model token limit exceeded for today');
    }
  }
}
```

---

## 🤖 AI Model Routing Logic

```typescript
// Premium models (limited by token usage for paid plans)
const PREMIUM_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'google/gemini-2.0-flash-exp',
  'google/gemini-pro',
  'openai/gpt-4-turbo'
];

// Free models (unlimited for all users)
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-flash-1.5',
  'anthropic/claude-3-haiku',
  'openai/gpt-3.5-turbo',
  'mistralai/mistral-7b-instruct'
];

async function selectModel(
  task: string, 
  userPlan: string,
  sessionTokensUsed: number
): Promise<string> {
  const plan = PLANS[userPlan];
  
  // Premium users
  if (plan.features.premiumModels) {
    // Check if token limit exceeded
    if (sessionTokensUsed >= plan.features.premiumModelsTokenLimit) {
      // Fall back to free models
      console.log('⚠️ Premium token limit reached, using free models');
      return selectFreeModel(task);
    }
    
    // Can use premium models
    return selectPremiumModel(task);
  }
  
  // Free users - only free models
  return selectFreeModel(task);
}

function selectPremiumModel(task: string): string {
  // Smart routing based on task complexity
  if (task.includes('blockchain') || task.includes('solana')) {
    return 'anthropic/claude-3.5-sonnet'; // Best for blockchain
  }
  if (task.includes('react') || task.includes('nextjs')) {
    return 'google/gemini-2.0-flash-exp'; // Fast for web dev
  }
  return 'anthropic/claude-3.5-sonnet'; // Default premium
}

function selectFreeModel(task: string): string {
  // Use best free model available
  return 'meta-llama/llama-3.3-70b-instruct';
}
```

---

## 📊 API Endpoints Required

### 1. Exchange OAuth Code for Tokens

```typescript
POST https://recoder.xyz/api/auth/cli

Request:
{
  "action": "exchange_code",
  "code": "ABC123...",
  "client_id": "recoder-code"
}

Response:
{
  "success": true,
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "expires_at": "2024-12-31T23:59:59Z",
  "user": {
    "id": "user_123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscriptionPlan": "pro",
    "hasOwnApiKey": false,
    "onboardingStep": "completed"
  }
}
```

### 2. Get User Profile

```typescript
GET https://recoder.xyz/api/user/profile

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscriptionPlan": "pro",
    "subscriptionStatus": "active",
    "hasOwnApiKey": false,
    "quotas": {
      "sessionsToday": 3,
      "sessionsLimit": 6,
      "tokensUsedToday": 25000,
      "tokensLimitToday": 100000
    }
  }
}
```

### 3. Add/Update OpenRouter API Key (Free Users)

```typescript
POST https://recoder.xyz/api/user/api-key

Headers:
  Authorization: Bearer {access_token}

Request:
{
  "apiKey": "sk-or-v1-..."
}

Response:
{
  "success": true,
  "message": "API key saved successfully",
  "user": {
    "hasOwnApiKey": true,
    "onboardingStep": "completed"
  }
}
```

### 4. Start New Session

```typescript
POST https://recoder.xyz/api/sessions/start

Headers:
  Authorization: Bearer {access_token}

Request:
{
  "platform": "recoder-code",
  "deviceId": "device_abc123"
}

Response:
{
  "success": true,
  "session": {
    "id": "session_xyz789",
    "userId": "user_123",
    "startTime": "2024-01-15T10:00:00Z",
    "status": "active",
    "remainingSessions": 3
  }
}
```

### 5. Track Session Usage

```typescript
POST https://recoder.xyz/api/sessions/{sessionId}/usage

Headers:
  Authorization: Bearer {access_token}

Request:
{
  "model": "anthropic/claude-3.5-sonnet",
  "tokens": 1500,
  "cost": 0.015
}

Response:
{
  "success": true,
  "session": {
    "tokensUsed": 1500,
    "costEstimate": 0.015,
    "remainingTokens": 98500
  }
}
```

### 6. End Session

```typescript
POST https://recoder.xyz/api/sessions/{sessionId}/end

Headers:
  Authorization: Bearer {access_token}

Response:
{
  "success": true,
  "session": {
    "id": "session_xyz789",
    "duration": 3600, // seconds
    "tokensUsed": 25000,
    "costEstimate": 0.25,
    "status": "completed"
  }
}
```

---

## 🔒 Security Best Practices

### Token Storage
```typescript
// Store tokens securely in VS Code secret storage
async function saveSession(session: Session) {
  await context.secrets.store('recoder_access_token', session.accessToken);
  await context.secrets.store('recoder_refresh_token', session.refreshToken);
  await context.secrets.store('recoder_user_id', session.user.id);
}

async function getAccessToken(): Promise<string | undefined> {
  return await context.secrets.get('recoder_access_token');
}
```

### Auto Token Refresh
```typescript
async function ensureValidToken(): Promise<string> {
  const token = await getAccessToken();
  const expiresAt = await context.secrets.get('recoder_token_expires_at');
  
  // If token expires in < 5 minutes, refresh it
  if (new Date(expiresAt) < new Date(Date.now() + 5 * 60 * 1000)) {
    const newToken = await refreshAccessToken();
    return newToken;
  }
  
  return token;
}
```

---

## 🎨 User Experience Flow

### First Time User (Free Plan)

1. User installs Recoder Code extension
2. Extension shows: "Welcome! Sign in with recoder.xyz"
3. User clicks "Sign In" → Browser opens
4. User signs up/logs in on recoder.xyz
5. Browser redirects back → Extension authenticated
6. Extension shows: "⚠️ OpenRouter API key required"
7. User adds API key → Validated and saved
8. Extension shows: "✅ Ready! Start coding with AI"

### First Time User (Paid Plan)

1. User installs Recoder Code extension
2. Extension shows: "Welcome! Sign in with recoder.xyz"
3. User clicks "Sign In" → Browser opens
4. User signs up/logs in on recoder.xyz
5. Browser redirects back → Extension authenticated
6. Extension shows: "✅ PRO plan active! No API key needed"
7. User starts using immediately

### Free User Upgrades to PRO

1. User clicks "Upgrade" in extension
2. Browser opens to recoder.xyz/pricing
3. User subscribes via Paddle/DODO Pay
4. Payment confirmed → Plan updated in database
5. Extension automatically detects upgrade
6. Extension shows: "🎉 Upgraded to PRO! API key no longer needed"

---

## 📱 Cross-Platform Session Sync

```typescript
// When user logs in via Recoder Code
async function syncSessionAcrossPlatforms(userId: string) {
  await fetch('https://recoder.xyz/api/sessions/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      platform: 'recoder-code',
      status: 'active'
    })
  });
  
  // User can now:
  // ✅ Use Recoder Code (VS Code extension)
  // ✅ Visit web.recoder.xyz (already logged in)
  // ✅ Visit recoder.xyz (already logged in)
  // ✅ Use mobile app (synced session)
}
```

---

## 🚀 Complete Implementation Checklist

### Recoder Code Extension
- [x] OAuth web flow implementation
- [x] Token storage in VS Code secrets
- [x] Auto token refresh logic
- [x] User profile fetching
- [x] API key collection modal (free users)
- [x] Session management
- [x] Usage tracking per request
- [x] Plan upgrade flow
- [x] Cross-platform sync

### recoder.xyz Backend
- [ ] POST /api/auth/cli (OAuth endpoint)
- [ ] POST /api/user/api-key (Save user's OpenRouter key)
- [ ] GET /api/user/profile (Get user data)
- [ ] POST /api/sessions/start (Start new session)
- [ ] POST /api/sessions/:id/usage (Track usage)
- [ ] POST /api/sessions/:id/end (End session)
- [ ] Database tables for users, sessions, quotas
- [ ] Payment webhook handlers (Paddle + DODO Pay)
- [ ] Usage limit enforcement

---

## 💡 Key Differences from Docs

### What Changed:
1. **Session-based tracking** (not request-based)
   - Users get 6 sessions/day (not 1000 requests)
   - Each session can have unlimited free model usage
   - Premium models limited by token count

2. **No detailed token display to users**
   - Users see: "Session 3/6 today"
   - They don't see: "You used 1500 tokens"
   - Backend tracks everything silently

3. **Free models always available**
   - Even if token limit hit, free models work
   - Premium models get blocked after limit

4. **Pricing simplified**
   - Free: $0 (6 sessions, own API key, free models)
   - PRO: $20 (6 sessions, our API, premium models)
   - Enterprise: $79 (20 sessions, our API, priority)

---

## 📝 Summary

Recoder Code authenticates users via recoder.xyz, checks their subscription plan, collects OpenRouter API key if needed (free users only), and tracks usage by daily sessions with token limits on premium models for paid users.

**End Result:**
- ✅ Users authenticate once
- ✅ Free users add OpenRouter key
- ✅ Premium users get instant access
- ✅ Usage tracked by sessions (6/day default)
- ✅ Premium models limited by tokens
- ✅ Free models always available
- ✅ Cross-platform session sync

This creates a seamless experience similar to Cursor/Copilot where users log in once and everything just works!
