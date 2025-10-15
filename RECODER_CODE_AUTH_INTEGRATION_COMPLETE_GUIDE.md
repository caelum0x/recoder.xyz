# Recoder.xyz Authentication Integration Guide for Recoder-Code

## 📋 Overview

This document explains how **recoder-code** (CLI/VS Code Extension) authenticates with **recoder.xyz** (web platform) and manages user sessions, API keys, subscriptions, and usage tracking.

### Architecture Summary

```
┌─────────────────┐
│  Recoder-Code   │  (CLI/VS Code Extension)
│  (Client)       │
└────────┬────────┘
         │
         │ OAuth / Device Flow / API Key
         │
┌────────▼────────┐
│  recoder.xyz    │  (Main Website/Landing - Next.js)
│  Port 3000      │  - User registration
└────────┬────────┘  - OAuth authentication
         │           - Payment/subscription management
         │           - User dashboard
         │
┌────────▼────────┐
│  api.recoder.xyz│  (Backend API - Express.js)
│  Port 3001      │  - Auth tokens
└────────┬────────┘  - User data
         │           - Usage tracking
         │           - API key management
         │
┌────────▼────────┐
│  web.recoder.xyz│  (Bolt-like IDE - Next.js)
│                 │  - AI code generation
└─────────────────┘  - Project management
                     - Real-time collaboration
```

---

## 🎯 User Journey & Business Logic

### 1. New User Flow (Free Tier)

```
1. User installs recoder-code CLI/Extension
   ↓
2. User runs: recoder auth login
   ↓
3. Opens browser → https://recoder.xyz/auth/signup
   ↓
4. User creates account (email/password or OAuth)
   ↓
5. User saved to PostgreSQL database
   ↓
6. Onboarding modal appears: "Add your OpenRouter API Key"
   ↓
7. User provides OpenRouter key → Validated & Encrypted
   ↓
8. API key stored in database (encrypted)
   ↓
9. Access token returned to CLI
   ↓
10. User can now use recoder-code with their API key
    ↓
11. Usage tracked: 6 sessions/day, 10k tokens/session limit
```

### 2. Premium User Flow

```
1. User has free account
   ↓
2. Visits https://recoder.xyz/pricing
   ↓
3. Selects plan: Weekly ($10), Monthly ($20), or Pro ($100)
   ↓
4. Payment via Paddle or DODO Pay
   ↓
5. Subscription activated in database
   ↓
6. User's subscriptionPlan updated to 'weekly'/'monthly'/'pro'
   ↓
7. User logs back into recoder-code
   ↓
8. CLI checks subscription status
   ↓
9. Premium user: NO API KEY REQUIRED
   ↓
10. Platform uses shared OpenRouter keys (from PlatformApiKey table)
   ↓
11. Higher limits: 10-20 sessions/day, 30k-100k tokens/session
    ↓
12. Usage tracked against subscription limits
```

---

## 🔐 Authentication Methods

### Method 1: Web OAuth Flow (Recommended)

**Best for**: Desktop users with browser access

```bash
# User command
recoder auth login --web
```

**Flow:**
```
1. CLI generates OAuth request
   → state, code_verifier, code_challenge
   
2. Opens browser to:
   https://recoder.xyz/api/auth/cli?state=xxx&code_challenge=yyy
   
3. User sees authorization page:
   "Recoder CLI wants to access your account"
   [Authorize] [Deny]
   
4. User clicks Authorize
   
5. recoder.xyz redirects to:
   http://localhost:8080/callback?code=abc&state=xxx
   
6. CLI exchanges code for tokens:
   POST https://api.recoder.xyz/api/auth/token
   Body: { code, code_verifier }
   
7. Backend validates & returns:
   {
     accessToken: "jwt-token",
     refreshToken: "refresh-token",
     user: { id, email, name, subscriptionPlan }
   }
   
8. CLI stores tokens in:
   ~/.recoder/credentials.json (encrypted)
```

### Method 2: Device Flow

**Best for**: Headless servers, remote machines, Docker containers

```bash
# User command
recoder auth login --device-flow
```

**Flow:**
```
1. CLI requests device code:
   POST https://api.recoder.xyz/api/auth/device
   
2. Backend returns:
   {
     deviceCode: "XXXX-XXXX",
     userCode: "ABCD-1234",
     verificationUri: "https://recoder.xyz/auth/device",
     expiresIn: 900  # 15 minutes
   }
   
3. CLI displays:
   "Visit https://recoder.xyz/auth/device
    Enter code: ABCD-1234"
   
4. User visits URL in ANY browser (phone, tablet, etc.)
   
5. Enters code: ABCD-1234
   
6. Authenticates (if not logged in)
   
7. Confirms: "Authorize device?"
   
8. CLI polls for status:
   POST https://api.recoder.xyz/api/auth/device/token
   Body: { deviceCode }
   
9. Once authorized, returns tokens
   
10. CLI stores tokens
```

### Method 3: API Key (Advanced Users)

**Best for**: CI/CD, automation, advanced users

```bash
# User generates API key at:
https://recoder.xyz/settings/api-keys

# Then uses it:
recoder auth login --api-key sk-rcd-xxxxxxxxxxxxx
```

**Flow:**
```
1. User generates API key on website
   
2. API key stored in database:
   - keyId: unique identifier
   - keyHash: bcrypt hash
   - keyPrefix: first 12 chars (for display)
   - scopes: ['cli:full', 'api:read', 'generate:code']
   
3. User copies full key (shown only once)
   
4. CLI validates key:
   POST https://api.recoder.xyz/api/auth/validate-api-key
   Body: { apiKey }
   
5. Backend checks hash, returns user data
   
6. CLI stores API key in credentials
```

---

## 💾 Database Schema

### User Table

```typescript
model User {
  id                String   @id @default(cuid())
  email             String   @unique
  name              String
  passwordHash      String?
  avatar            String?
  
  // Subscription
  subscriptionPlan  String   @default("free")  // "free" | "weekly" | "monthly" | "pro"
  subscriptionStatus String  @default("active") // "active" | "canceled" | "past_due"
  
  // OpenRouter API Key (for free users)
  openRouterApiKey  String?  // Encrypted
  hasOwnApiKey      Boolean  @default(false)
  onboardingStep    String?  // "pending_api_key" | "completed"
  
  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  lastLoginAt       DateTime?
  
  // Relations
  quotas            UserQuota[]
  usageRecords      UsageRecord[]
  cliSessions       CLISession[]
  apiKeys           ApiKey[]
}
```

### UserQuota Table

```typescript
model UserQuota {
  id                  String   @id @default(cuid())
  userId              String
  
  // Session-based limits (daily reset)
  sessionsLimit       Int      @default(6)      // 6 for free, 10-20 for premium
  sessionsUsed        Int      @default(0)
  
  // Token limits per session (for pricey models)
  tokensPerSession    Int      @default(10000)  // 10k for free, 30k-100k for premium
  
  // Unlimited for free models (Gemini Flash, Llama, etc.)
  // No tracking needed
  
  // Period tracking
  periodStart         DateTime @default(now())  // Reset daily
  periodEnd           DateTime                   // +24 hours
  lastResetAt         DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id])
}
```

### UsageRecord Table

```typescript
model UsageRecord {
  id            String   @id @default(cuid())
  userId        String
  sessionId     String   // Unique per work session
  
  // Request tracking
  requestType   String   // "cli" | "web" | "api"
  endpoint      String?  // "/api/generate" | "/api/chat"
  
  // AI Model tracking
  modelUsed     String?  // "claude-3-5-sonnet" | "gemini-flash"
  providerUsed  String?  // "openrouter"
  tokensUsed    Int?     // Actual tokens consumed
  cost          Float?   // Cost in USD
  
  // Session management
  isPriceyModel Boolean  @default(false)  // Track against limits
  
  // Metadata
  timestamp     DateTime @default(now())
  success       Boolean  @default(true)
  
  user User @relation(fields: [userId], references: [id])
}
```

### PlatformApiKey Table (Premium Users)

```typescript
model PlatformApiKey {
  id              String    @id @default(cuid())
  provider        String    // "openrouter"
  keyEncrypted    String    // AES-256 encrypted
  keyName         String    // "OpenRouter Primary"
  
  // Load balancing
  quotaLimit      Int       @default(1000000)
  quotaUsed       Int       @default(0)
  isActive        Boolean   @default(true)
  priority        Int       @default(0)  // Higher = used first
  
  createdAt       DateTime  @default(now())
  lastUsedAt      DateTime?
}
```

---

## 🎫 Session Management

### Sessions vs API Calls

**Session Definition:**
- A session is one continuous work period
- Starts when user begins a task (e.g., "build a React app")
- Ends when:
  - User explicitly ends it (closes project)
  - 30 minutes of inactivity
  - User switches to a different project

**Daily Limits:**
```
Free:     6 sessions per day
Weekly:   10 sessions per day
Monthly:  15 sessions per day
Pro:      20 sessions per day
```

**Token Limits (Per Session, Pricey Models Only):**
```
Free:     10,000 tokens
Weekly:   30,000 tokens
Monthly:  50,000 tokens
Pro:      100,000 tokens
```

**Free Models (Unlimited):**
- Gemini Flash
- Llama 3.3 70B
- Claude Haiku
- Mixtral
- Qwen 2.5 Coder
- And other low-cost models

### Tracking Logic in CLI

```typescript
// When user starts a task
class SessionManager {
  async startSession(): Promise<Session> {
    // Check if user has sessions remaining
    const quota = await checkUserQuota();
    
    if (quota.sessionsUsed >= quota.sessionsLimit) {
      throw new QuotaExceededError(
        'Daily session limit reached. Upgrade or wait for reset.'
      );
    }
    
    // Create new session
    const session = {
      id: generateId(),
      userId: currentUser.id,
      startedAt: new Date(),
      tokensUsed: 0,
      modelType: null  // Will be set on first request
    };
    
    // Increment session count
    await incrementSessionCount();
    
    return session;
  }
  
  async trackRequest(request: AIRequest): Promise<void> {
    const isPriceyModel = PRICEY_MODELS.includes(request.model);
    
    // Only track tokens for pricey models
    if (isPriceyModel) {
      const session = getCurrentSession();
      session.tokensUsed += request.tokensUsed;
      
      // Check token limit
      const quota = await getUserQuota();
      if (session.tokensUsed > quota.tokensPerSession) {
        throw new QuotaExceededError(
          `Session token limit (${quota.tokensPerSession}) exceeded. ` +
          'Switch to a free model or start a new session.'
        );
      }
    }
    
    // Record usage
    await recordUsage({
      userId: currentUser.id,
      sessionId: session.id,
      modelUsed: request.model,
      tokensUsed: request.tokensUsed,
      isPriceyModel,
      cost: calculateCost(request)
    });
  }
}
```

---

## 💳 Payment & Subscription System

### Payment Providers

**Primary: DODO Pay**
- Standard payment processor (NOT crypto)
- Supports credit cards, debit cards, bank transfers
- API: https://docs.dodopayments.com
- SDK: `dodopayments` npm package

**Secondary: Paddle**
- Subscription management
- Handles taxes, VAT, invoicing
- API: https://developer.paddle.com

### Pricing Plans

```typescript
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: null,
    limits: {
      sessionsPerDay: 6,
      tokensPerSession: 10000,
      requiresApiKey: true
    }
  },
  
  weekly: {
    id: 'weekly',
    name: 'Weekly',
    price: 10,
    interval: 'week',
    limits: {
      sessionsPerDay: 10,
      tokensPerSession: 30000,
      requiresApiKey: false  // Uses platform keys
    }
  },
  
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    price: 20,
    interval: 'month',
    limits: {
      sessionsPerDay: 15,
      tokensPerSession: 50000,
      requiresApiKey: false
    }
  },
  
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 100,
    interval: 'month',
    limits: {
      sessionsPerDay: 20,
      tokensPerSession: 100000,
      requiresApiKey: false,
      betaAccess: true,
      customModels: true
    }
  }
};
```

### Checkout Flow

```typescript
// User clicks "Start Monthly" on pricing page
async function handleCheckout(plan: string) {
  // 1. Check authentication
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/signin?redirect=/pricing');
    return;
  }
  
  // 2. Create checkout session
  const checkout = await createCheckout({
    userId: user.id,
    plan: plan,
    provider: 'dodo'  // or 'paddle'
  });
  
  // 3. Redirect to payment page
  window.location.href = checkout.url;
}

// Backend: Create checkout
async function createCheckout(params) {
  const planConfig = PLANS[params.plan];
  
  if (params.provider === 'dodo') {
    const dodo = getDodoPayService();
    const subscription = await dodo.createSubscription({
      userId: params.userId,
      email: user.email,
      plan: params.plan,
      amount: planConfig.price * 100,  // Convert to cents
      interval: planConfig.interval,
      successUrl: 'https://recoder.xyz/dashboard?payment=success',
      cancelUrl: 'https://recoder.xyz/pricing?payment=canceled'
    });
    
    return { url: subscription.checkoutUrl };
  }
  
  // Similar for Paddle
}
```

### Webhook Handling

```typescript
// DODO Pay webhook
app.post('/api/webhooks/dodo', async (req, res) => {
  const signature = req.headers['x-dodo-signature'];
  
  // Verify webhook signature
  const isValid = verifyDodoSignature(req.body, signature);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.renewed':
      // Activate subscription
      await db.user.update({
        where: { id: event.data.metadata.userId },
        data: {
          subscriptionPlan: event.data.plan,
          subscriptionStatus: 'active'
        }
      });
      
      // Update quota limits
      await updateUserQuota(event.data.metadata.userId, event.data.plan);
      break;
      
    case 'subscription.canceled':
      // Downgrade to free
      await db.user.update({
        where: { id: event.data.metadata.userId },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'canceled'
        }
      });
      break;
      
    case 'payment.failed':
      await db.user.update({
        where: { id: event.data.metadata.userId },
        data: { subscriptionStatus: 'past_due' }
      });
      
      // Send email notification
      await sendPaymentFailedEmail(event.data.metadata.userId);
      break;
  }
  
  res.json({ received: true });
});
```

---

## 🔑 API Key Management

### For Free Users (OpenRouter Key)

```typescript
// User adds their OpenRouter API key
async function addOpenRouterKey(userId: string, apiKey: string) {
  // 1. Validate key with OpenRouter
  const isValid = await validateOpenRouterKey(apiKey);
  if (!isValid) {
    throw new Error('Invalid OpenRouter API key');
  }
  
  // 2. Encrypt key
  const encrypted = await encrypt(apiKey);
  
  // 3. Store in database
  await db.user.update({
    where: { id: userId },
    data: {
      openRouterApiKey: encrypted,
      hasOwnApiKey: true,
      onboardingStep: 'completed'
    }
  });
  
  return { success: true };
}

// When making AI requests
async function makeAIRequest(userId: string, request: AIRequest) {
  const user = await db.user.findUnique({ where: { id: userId } });
  
  let apiKey: string;
  
  if (user.subscriptionPlan === 'free') {
    // Use user's own key
    if (!user.openRouterApiKey) {
      throw new Error('Please add your OpenRouter API key');
    }
    apiKey = await decrypt(user.openRouterApiKey);
  } else {
    // Use platform key (premium)
    apiKey = await getNextPlatformApiKey();
  }
  
  // Make request to OpenRouter
  const response = await openrouter.chat({
    apiKey,
    model: request.model,
    messages: request.messages
  });
  
  return response;
}
```

### For Premium Users (Platform Keys)

```typescript
// Load balance across multiple platform keys
async function getNextPlatformApiKey(): Promise<string> {
  // Get active keys sorted by usage
  const keys = await db.platformApiKey.findMany({
    where: { isActive: true },
    orderBy: [
      { priority: 'desc' },  // Higher priority first
      { quotaUsed: 'asc' }   // Less used first
    ]
  });
  
  if (keys.length === 0) {
    throw new Error('No platform API keys available');
  }
  
  // Select key with lowest usage
  const key = keys[0];
  
  // Check if quota exceeded
  if (key.quotaUsed >= key.quotaLimit) {
    // Try next key
    return getNextPlatformApiKey();
  }
  
  // Decrypt and return
  return await decrypt(key.keyEncrypted);
}

// Update usage after request
async function recordPlatformKeyUsage(keyId: string, tokensUsed: number) {
  await db.platformApiKey.update({
    where: { id: keyId },
    data: {
      quotaUsed: { increment: tokensUsed },
      lastUsedAt: new Date()
    }
  });
}
```

---

## 🌐 Environment Variables

### Production URLs

```bash
# Frontend (Landing/Marketing)
NEXT_PUBLIC_WEB_URL=https://recoder.xyz

# Backend API
BACKEND_URL=https://api.recoder.xyz
NEXT_PUBLIC_API_URL=https://api.recoder.xyz

# Bolt-like IDE
NEXT_PUBLIC_IDE_URL=https://web.recoder.xyz

# Database
DATABASE_URL=postgresql://user:pass@host:5432/recoder_prod

# Auth
NEXTAUTH_URL=https://recoder.xyz
NEXTAUTH_SECRET=your-production-secret

# OAuth
GITHUB_CLIENT_ID=prod-client-id
GITHUB_CLIENT_SECRET=prod-secret
GOOGLE_CLIENT_ID=prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=prod-secret

# Payments
DODO_API_KEY_LIVE=dodo-live-key
DODO_API_SECRET=dodo-live-secret
DODO_WEBHOOK_SECRET=dodo-webhook-secret

PADDLE_VENDOR_ID=your-vendor-id
PADDLE_API_KEY=paddle-live-key
PADDLE_WEBHOOK_SECRET=paddle-webhook-secret

# Platform API Keys (encrypted)
PLATFORM_OPENROUTER_KEY_1=sk-or-xxxxxx
PLATFORM_OPENROUTER_KEY_2=sk-or-xxxxxx
PLATFORM_OPENROUTER_KEY_3=sk-or-xxxxxx

# Encryption
ENCRYPTION_KEY=64-char-hex-string
ENCRYPTION_SALT=production-salt-string
JWT_SECRET=jwt-secret
JWT_REFRESH_SECRET=refresh-secret
```

---

## 🔧 CLI Integration Examples

### Initialize Auth

```typescript
// recoder-code/src/auth/index.ts

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

const API_BASE = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
const CREDS_PATH = path.join(os.homedir(), '.recoder', 'credentials.json');

class RecoderAuth {
  async login(method: 'web' | 'device' | 'api-key' = 'web') {
    switch (method) {
      case 'web':
        return this.webOAuthFlow();
      case 'device':
        return this.deviceFlow();
      case 'api-key':
        return this.apiKeyFlow();
    }
  }
  
  async webOAuthFlow() {
    // 1. Generate PKCE challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    
    // 2. Start local callback server
    const callbackServer = await this.startCallbackServer();
    
    // 3. Open browser
    const authUrl = `${API_BASE.replace('api.', '')}}/auth/cli?` +
      `code_challenge=${codeChallenge}&` +
      `state=${state}&` +
      `redirect_uri=http://localhost:8080/callback`;
    
    console.log('Opening browser for authentication...');
    await open(authUrl);
    
    // 4. Wait for callback
    const { code } = await callbackServer.waitForCallback();
    
    // 5. Exchange code for tokens
    const response = await axios.post(`${API_BASE}/api/auth/token`, {
      code,
      codeVerifier,
      grantType: 'authorization_code'
    });
    
    // 6. Save credentials
    await this.saveCredentials(response.data);
    
    console.log('✅ Authentication successful!');
    console.log(`Logged in as: ${response.data.user.email}`);
    console.log(`Plan: ${response.data.user.subscriptionPlan}`);
    
    return response.data;
  }
  
  async deviceFlow() {
    // 1. Request device code
    const { data } = await axios.post(`${API_BASE}/api/auth/device`);
    
    console.log('\n📱 Device Authentication\n');
    console.log(`Visit: ${data.verificationUri}`);
    console.log(`Enter code: ${chalk.bold.green(data.userCode)}`);
    console.log('\nWaiting for authorization...');
    
    // 2. Poll for authorization
    const tokens = await this.pollDeviceAuthorization(data.deviceCode);
    
    // 3. Save credentials
    await this.saveCredentials(tokens);
    
    console.log('\n✅ Device authorized successfully!');
    return tokens;
  }
  
  async isAuthenticated(): Promise<boolean> {
    try {
      const creds = await this.loadCredentials();
      
      // Check if access token is valid
      const response = await axios.get(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` }
      });
      
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  async getUser() {
    const creds = await this.loadCredentials();
    const response = await axios.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` }
    });
    return response.data.user;
  }
  
  async checkQuota() {
    const creds = await this.loadCredentials();
    const response = await axios.get(`${API_BASE}/api/user/quota`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` }
    });
    return response.data;
  }
  
  private async saveCredentials(data: any) {
    const encrypted = this.encrypt(JSON.stringify(data));
    await fs.ensureDir(path.dirname(CREDS_PATH));
    await fs.writeFile(CREDS_PATH, encrypted);
  }
  
  private async loadCredentials() {
    if (!await fs.pathExists(CREDS_PATH)) {
      throw new Error('Not authenticated. Run: recoder auth login');
    }
    const encrypted = await fs.readFile(CREDS_PATH, 'utf8');
    const decrypted = this.decrypt(encrypted);
    return JSON.parse(decrypted);
  }
}

export const auth = new RecoderAuth();
```

### Making AI Requests

```typescript
// recoder-code/src/ai/client.ts

import axios from 'axios';
import { auth } from '../auth';

class AIClient {
  async generate(prompt: string, options: GenerateOptions = {}) {
    // 1. Check authentication
    if (!await auth.isAuthenticated()) {
      throw new Error('Please login first: recoder auth login');
    }
    
    // 2. Check quota
    const quota = await auth.checkQuota();
    if (quota.sessionsUsed >= quota.sessionsLimit) {
      throw new Error(
        `Daily session limit reached (${quota.sessionsLimit}). ` +
        'Upgrade your plan or wait for reset.'
      );
    }
    
    // 3. Start session if needed
    if (!this.currentSession) {
      this.currentSession = await this.startSession();
    }
    
    // 4. Make request
    const creds = await auth.loadCredentials();
    const response = await axios.post(
      `${API_BASE}/api/generate`,
      {
        prompt,
        model: options.model || 'claude-3-5-sonnet',
        sessionId: this.currentSession.id,
        ...options
      },
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`
        }
      }
    );
    
    // 5. Update session usage
    this.currentSession.tokensUsed += response.data.usage.totalTokens;
    
    // 6. Check if session limit reached
    const isPriceyModel = this.isPriceyModel(options.model);
    if (isPriceyModel && 
        this.currentSession.tokensUsed > quota.tokensPerSession) {
      console.warn(
        `⚠️ Session token limit reached. ` +
        'Switch to a free model or start a new session.'
      );
    }
    
    return response.data;
  }
  
  private async startSession() {
    const creds = await auth.loadCredentials();
    const response = await axios.post(
      `${API_BASE}/api/sessions/start`,
      {},
      {
        headers: { Authorization: `Bearer ${creds.accessToken}` }
      }
    );
    return response.data.session;
  }
  
  private isPriceyModel(model: string): boolean {
    const priceyModels = [
      'claude-3-5-sonnet',
      'claude-3-opus',
      'gpt-4',
      'gpt-4-turbo',
      'gemini-2.5-pro'
    ];
    return priceyModels.includes(model);
  }
}

export const ai = new AIClient();
```

---

## 📊 Usage Tracking Implementation

### Backend Middleware

```typescript
// backend/src/middleware/usage-tracking.ts

export async function trackUsageMiddleware(req, res, next) {
  const user = req.user;  // From auth middleware
  const sessionId = req.body.sessionId || req.headers['x-session-id'];
  
  // Store request start time
  const startTime = Date.now();
  
  // Intercept response
  const originalJson = res.json.bind(res);
  res.json = function (data: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Record usage after response
    trackUsage({
      userId: user.id,
      sessionId,
      endpoint: req.path,
      method: req.method,
      modelUsed: data.model,
      tokensUsed: data.usage?.totalTokens || 0,
      cost: calculateCost(data),
      duration,
      success: true
    }).catch(console.error);
    
    return originalJson(data);
  };
  
  next();
}

async function trackUsage(data: UsageData) {
  const isPriceyModel = PRICEY_MODELS.includes(data.modelUsed);
  
  // Record in database
  await db.usageRecord.create({
    data: {
      userId: data.userId,
      sessionId: data.sessionId,
      requestType: 'api',
      endpoint: data.endpoint,
      modelUsed: data.modelUsed,
      tokensUsed: data.tokensUsed,
      cost: data.cost,
      isPriceyModel,
      duration: data.duration,
      success: data.success,
      timestamp: new Date()
    }
  });
  
  // Update quota
  if (isPriceyModel) {
    await db.userQuota.update({
      where: { userId: data.userId },
      data: {
        tokensUsed: { increment: data.tokensUsed }
      }
    });
  }
}
```

---

## 🚀 Quick Start for CLI Developers

### 1. Install Dependencies

```bash
cd recoder-code
npm install axios open crypto-js fs-extra
```

### 2. Add Environment Variables

```bash
# .env
RECODER_API_URL=https://api.recoder.xyz
RECODER_WEB_URL=https://recoder.xyz
```

### 3. Implement Auth

Copy the auth implementation from the "CLI Integration Examples" section above.

### 4. Test Authentication

```bash
# Test web flow
recoder auth login

# Test device flow
recoder auth login --device-flow

# Check status
recoder auth status

# Output:
# ✅ Authenticated
# Email: user@example.com
# Plan: monthly
# Sessions today: 3/15
# Tokens this session: 5,432/50,000
```

### 5. Make AI Requests

```typescript
import { ai } from './ai/client';

// Generate code
const result = await ai.generate('Create a React todo app');
console.log(result.code);

// Usage is automatically tracked!
```

---

## 🔒 Security Best Practices

1. **Never log API keys or tokens**
2. **Encrypt credentials at rest** (use crypto-js or similar)
3. **Use HTTPS only** in production
4. **Validate all tokens** on the backend
5. **Rotate platform API keys** regularly
6. **Implement rate limiting** on all endpoints
7. **Log all authentication attempts** for security monitoring
8. **Use PKCE** for OAuth flows (already implemented)
9. **Validate webhook signatures** from payment providers
10. **Implement token refresh** before expiry

---

## 📝 Summary

This authentication system provides:

✅ **Multiple auth methods**: Web OAuth, Device Flow, API Keys  
✅ **Freemium model**: Free with own API key, premium with platform keys  
✅ **Session-based limits**: Not per-request, per-session  
✅ **Unlimited free models**: Only track expensive models  
✅ **Dual payment systems**: DODO Pay + Paddle  
✅ **Usage tracking**: Comprehensive analytics  
✅ **Secure**: Encrypted keys, JWT tokens, PKCE flow  

### Key Differences from Other Platforms

**vs Cursor/GitHub Copilot:**
- We support BYOK (Bring Your Own Key) for free users
- Session-based instead of per-request limits
- Multi-platform (CLI + Web + Extension)

**vs Bolt.new:**
- We have a standalone CLI (they're web-only)
- We have API key management built-in
- We support multiple payment providers

**vs OpenAI/Anthropic Direct:**
- We provide a unified interface across multiple providers
- We handle quota management and load balancing
- We offer both BYOK and managed API keys

---

## 🆘 Support

For questions or issues:

- 📧 Email: dev@recoder.xyz
- 💬 Discord: https://discord.gg/recoder
- 📖 Docs: https://docs.recoder.xyz
- 🐛 Issues: https://github.com/recoder/recoder-code/issues

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Status**: Production Ready ✅
