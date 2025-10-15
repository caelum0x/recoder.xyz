# Recoder.xyz Authentication System - Complete Guide for AI Copilot

> **For AI Copilot in recoder-code workspace**  
> This document explains how recoder.xyz authentication works so you can integrate it into recoder-code CLI

---

## 🎯 System Overview

### Platform Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  recoder.xyz    │────────>│  web.recoder.xyz │────────>│  api.recoder.xyz│
│  (Landing Page) │         │  (Bolt-like IDE) │         │  (Backend API)  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                            │
        │                            │                            │
        └────────────────────────────┴────────────────────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │   recoder-code (CLI)    │
                        │   VS Code Extension     │
                        └─────────────────────────┘
```

### URLs (Production)
- **Landing/Auth**: `https://recoder.xyz` (main website, pricing, authentication)
- **Web IDE**: `https://web.recoder.xyz` (Bolt-like AI app generator)
- **API Backend**: `https://api.recoder.xyz` (authentication, usage tracking, AI routing)

### URLs (Development)
- **Landing/Auth**: `http://localhost:3002`
- **Web IDE**: `http://localhost:3003`
- **API Backend**: `http://localhost:3001`

---

## 🔐 Authentication Flow

### Step 1: User Installs recoder-code CLI

```bash
npm install -g recoder-code
```

### Step 2: User Runs CLI for First Time

```bash
recoder-code /new project
```

CLI detects no authentication and shows:

```
🔒 Authentication Required

You need to authenticate with recoder.xyz to use recoder-code.

Choose an authentication method:
  1. Browser OAuth (Recommended)
  2. Device Flow (Headless)
  3. API Key
  
> 1
```

### Step 3: Authentication Methods

#### Method 1: Browser OAuth (Recommended)

```typescript
// CLI Flow
1. CLI generates state token and opens browser:
   https://recoder.xyz/api/auth/cli?client_id=recoder-cli&redirect_uri=http://localhost:8080/callback&state=abc123

2. User lands on recoder.xyz authorization page
3. User clicks "Sign in with GitHub/Google/Email"
4. User authenticates (OAuth or credentials)
5. User sees: "Authorize recoder-code CLI?"
6. User clicks "Authorize"
7. recoder.xyz redirects to: http://localhost:8080/callback?code=xyz789&state=abc123

8. CLI receives code, exchanges for tokens:
   POST https://api.recoder.xyz/api/auth/cli/token
   {
     "code": "xyz789",
     "client_id": "recoder-cli",
     "redirect_uri": "http://localhost:8080/callback"
   }

9. API returns:
   {
     "access_token": "eyJ...",
     "refresh_token": "eyJ...",
     "expires_in": 900,
     "user": {
       "id": "user_123",
       "email": "user@example.com",
       "name": "John Doe",
       "subscriptionPlan": "free",
       "hasOwnApiKey": false
     }
   }

10. CLI stores tokens locally in:
    ~/.recoder-code/session.json
```

#### Method 2: Device Flow (Headless/SSH)

```typescript
// CLI Flow
1. CLI requests device code:
   POST https://api.recoder.xyz/api/auth/cli/device
   {
     "client_id": "recoder-cli",
     "scope": "cli:full"
   }

2. API returns:
   {
     "device_code": "abc123def456",
     "user_code": "WXYZ-1234",
     "verification_uri": "https://recoder.xyz/auth/device",
     "expires_in": 900,
     "interval": 5
   }

3. CLI displays:
   🔑 Go to: https://recoder.xyz/auth/device
   📝 Enter code: WXYZ-1234

4. User visits URL, enters code
5. User authenticates and authorizes

6. CLI polls every 5 seconds:
   POST https://api.recoder.xyz/api/auth/cli/device/token
   {
     "device_code": "abc123def456",
     "client_id": "recoder-cli"
   }

7. Once authorized, API returns tokens (same as OAuth)
```

#### Method 3: API Key

```typescript
// For users who prefer API keys
1. User goes to: https://recoder.xyz/settings/api-keys
2. User clicks "Generate New API Key"
3. System shows: rck_live_abc123def456...
4. User copies key

5. CLI usage:
   recoder-code auth login --api-key rck_live_abc123def456...

6. CLI validates key:
   GET https://api.recoder.xyz/api/auth/keys/validate
   Authorization: Bearer rck_live_abc123def456...

7. API returns user data
```

---

## 👤 User Flow: Free vs Premium

### Free Users (Bring Your Own API Key)

```typescript
// After authentication
1. User authenticates with recoder.xyz ✅
2. User added to database ✅
3. System checks: user.hasOwnApiKey === false

4. CLI/Web shows onboarding:
   "🔑 Add Your OpenRouter API Key"
   
   Why? Free users use their own OpenRouter account.
   
   [Get API Key at OpenRouter.ai] [Enter Key]

5. User enters OpenRouter API key: sk-or-v1-abc123...

6. CLI sends to API:
   POST https://api.recoder.xyz/api/user/openrouter/key
   {
     "apiKey": "sk-or-v1-abc123..."
   }

7. API:
   - Validates key with OpenRouter
   - Encrypts and stores in database
   - Updates user.hasOwnApiKey = true
   - Updates user.onboardingStep = "completed"

8. User can now use CLI/Web with their own API key
```

**Free User Limits:**
- ❌ No token limits (they pay OpenRouter directly)
- ✅ Session-based limits: **6 sessions per day**
- ✅ Can use free models (Gemini Flash, Llama, etc.) **unlimited**
- ⚠️ Pricey models (Claude 4.5, Gemini 2.5 Pro): **10,000 tokens/session**

### Premium Users (Platform API Keys)

```typescript
// After authentication
1. User authenticates with recoder.xyz ✅
2. User goes to: https://recoder.xyz/pricing
3. User clicks "Subscribe to Pro" ($20/month)

4. Payment flow (Paddle or DODO Pay):
   - User enters payment info
   - Webhook confirms payment
   - System updates:
     user.subscriptionPlan = "pro"
     user.subscriptionStatus = "active"

5. User can now use CLI/Web immediately

6. Platform uses its own API keys (pool of 3+):
   - OPENROUTER_API_KEY_1
   - OPENROUTER_API_KEY_2
   - OPENROUTER_API_KEY_3
   (Load balanced automatically)

7. Usage tracked:
   - Sessions per day: 6 (same as free)
   - Token limits per session: 50,000 tokens
   - Free models: unlimited
   - Pricey models: 50,000 tokens/session
```

---

## 📊 Session-Based Usage Model

### What is a "Session"?

A session starts when user:
- Opens a new chat in web.recoder.xyz
- Runs `recoder-code /new` in CLI
- Creates a new project

Session ends when:
- User closes chat/project
- 30 minutes of inactivity
- User manually ends session

### Usage Tracking

```typescript
interface UsageRecord {
  id: string;
  userId: string;
  sessionId: string;
  sessionNumber: number; // 1-6 per day
  model: string; // 'claude-3-5-sonnet', 'gemini-2.5-pro', etc.
  tokensUsed: number;
  cost: number;
  timestamp: Date;
}

// Example usage tracking
const session = {
  id: 'session_abc123',
  userId: 'user_123',
  sessionNumber: 3, // This is their 3rd session today
  modelsUsed: {
    'claude-3-5-sonnet': 8500, // 8.5k tokens
    'gemini-flash-8b': 15000,  // Free model, unlimited
  },
  totalTokens: 23500,
  priceyModelTokens: 8500, // Only Claude counted
  startTime: '2024-01-10T10:00:00Z',
  endTime: '2024-01-10T10:45:00Z'
};
```

### Model Categories

```typescript
// Pricey Models (Limited)
const priceyModels = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'google/gemini-2.5-pro',
  'openai/gpt-4-turbo',
  'openai/o1-preview'
];

// Free Models (Unlimited)
const freeModels = [
  'google/gemini-flash-8b',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.3-70b',
  'anthropic/claude-3-haiku',
  'openai/gpt-3.5-turbo'
];
```

### Daily Limits

```typescript
interface DailyLimits {
  free: {
    sessionsPerDay: 6;
    priceyTokensPerSession: 10_000;
    freeModelsUnlimited: true;
  };
  weekly: {
    sessionsPerDay: 10;
    priceyTokensPerSession: 30_000;
    freeModelsUnlimited: true;
  };
  monthly: {
    sessionsPerDay: 15;
    priceyTokensPerSession: 50_000;
    freeModelsUnlimited: true;
  };
  pro: {
    sessionsPerDay: 20;
    priceyTokensPerSession: 100_000;
    freeModelsUnlimited: true;
  };
  enterprise: {
    sessionsPerDay: Infinity;
    priceyTokensPerSession: Infinity;
    freeModelsUnlimited: true;
  };
}
```

---

## 💳 Subscription Plans

### Actual Pricing (from /pricing page)

```typescript
const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: {
      sessionsPerDay: 6,
      priceyTokensPerSession: 10_000,
      requiresOwnApiKey: true,
      priority: 'low'
    }
  },
  {
    id: 'weekly',
    name: 'Weekly',
    price: 10, // per week
    features: {
      sessionsPerDay: 10,
      priceyTokensPerSession: 30_000,
      requiresOwnApiKey: false,
      priority: 'normal',
      teamMembers: 3
    }
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 20, // per month (or $18/mo if annual)
    features: {
      sessionsPerDay: 15,
      priceyTokensPerSession: 50_000,
      requiresOwnApiKey: false,
      priority: 'high',
      teamMembers: 5
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 100, // per month (or $90/mo if annual)
    features: {
      sessionsPerDay: 20,
      priceyTokensPerSession: 100_000,
      requiresOwnApiKey: false,
      priority: 'highest',
      teamMembers: 10,
      betaAccess: true
    }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'custom',
    features: {
      sessionsPerDay: Infinity,
      priceyTokensPerSession: Infinity,
      requiresOwnApiKey: false,
      priority: 'dedicated',
      teamMembers: Infinity,
      customModels: true,
      sla: true
    }
  }
];
```

---

## 🔄 API Endpoints

### Authentication

```typescript
// 1. Initiate Browser OAuth
GET https://api.recoder.xyz/api/auth/cli
Query params:
  - client_id: string (required) = 'recoder-cli'
  - redirect_uri: string (required) = 'http://localhost:8080/callback'
  - state: string (required) - CSRF protection
  - scope: string (optional) = 'cli:full'

Response: Redirects to authorization page

// 2. Exchange Code for Tokens
POST https://api.recoder.xyz/api/auth/cli/token
Body: {
  code: string;
  client_id: string;
  redirect_uri: string;
}
Response: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

// 3. Device Flow - Request Code
POST https://api.recoder.xyz/api/auth/cli/device
Body: {
  client_id: string;
  scope?: string;
}
Response: {
  device_code: string;
  user_code: string; // Format: XXXX-XXXX
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// 4. Device Flow - Poll for Token
POST https://api.recoder.xyz/api/auth/cli/device/token
Body: {
  device_code: string;
  client_id: string;
}
Response: {
  access_token?: string;
  refresh_token?: string;
  user?: User;
  error?: 'authorization_pending' | 'slow_down' | 'access_denied';
}

// 5. Validate API Key
GET https://api.recoder.xyz/api/auth/keys/validate
Headers: {
  Authorization: Bearer <api_key>
}
Response: {
  valid: boolean;
  user: User;
}

// 6. Refresh Access Token
POST https://api.recoder.xyz/api/auth/cli/refresh
Body: {
  refresh_token: string;
  client_id: string;
}
Response: {
  access_token: string;
  expires_in: number;
}
```

### User Management

```typescript
// Get User Profile
GET https://api.recoder.xyz/api/user/profile
Headers: {
  Authorization: Bearer <access_token>
}
Response: {
  id: string;
  email: string;
  name: string;
  subscriptionPlan: 'free' | 'weekly' | 'monthly' | 'pro' | 'enterprise';
  hasOwnApiKey: boolean;
  onboardingStep: string;
}

// Add OpenRouter API Key (Free Users)
POST https://api.recoder.xyz/api/user/openrouter/key
Headers: {
  Authorization: Bearer <access_token>
}
Body: {
  apiKey: string; // sk-or-v1-...
}
Response: {
  success: boolean;
  message: string;
}

// Get Usage Stats
GET https://api.recoder.xyz/api/user/usage/stats
Headers: {
  Authorization: Bearer <access_token>
}
Response: {
  today: {
    sessionsUsed: number;
    sessionsLimit: number;
    priceyTokensUsed: number;
    priceyTokensLimit: number;
  };
  currentSession: {
    id: string;
    tokensUsed: number;
    modelsUsed: Record<string, number>;
  } | null;
}
```

### Session Management

```typescript
// Start New Session
POST https://api.recoder.xyz/api/sessions/start
Headers: {
  Authorization: Bearer <access_token>
}
Body: {
  type: 'cli' | 'web';
  metadata?: Record<string, any>;
}
Response: {
  sessionId: string;
  sessionNumber: number; // 1-6 for free users
  limits: {
    priceyTokensRemaining: number;
  };
}

// Track Usage in Session
POST https://api.recoder.xyz/api/sessions/:sessionId/usage
Headers: {
  Authorization: Bearer <access_token>
}
Body: {
  model: string;
  tokensUsed: number;
  cost?: number;
}
Response: {
  success: boolean;
  remaining: {
    priceyTokens: number;
  };
  warning?: string; // If approaching limit
}

// End Session
POST https://api.recoder.xyz/api/sessions/:sessionId/end
Headers: {
  Authorization: Bearer <access_token>
}
Response: {
  success: boolean;
  summary: {
    duration: number;
    tokensUsed: number;
    modelsUsed: Record<string, number>;
  };
}
```

---

## 🔧 Implementation for recoder-code CLI

### 1. Authentication Module

```typescript
// ~/.recoder-code/src/auth/index.ts

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.recoder-code');
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name: string;
    subscriptionPlan: string;
    hasOwnApiKey: boolean;
  };
}

export class RecoderAuth {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const session = this.getSession();
    if (!session) return false;
    
    // Check if token expired
    if (Date.now() >= session.expiresAt) {
      // Try to refresh
      return this.refreshToken(session.refreshToken);
    }
    
    return true;
  }

  // Get current session
  getSession(): Session | null {
    if (!fs.existsSync(SESSION_FILE)) return null;
    try {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Save session
  saveSession(session: Session): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  }

  // Initiate browser OAuth
  async loginWithBrowser(): Promise<void> {
    const state = this.generateRandomString(32);
    const redirectUri = 'http://localhost:8080/callback';
    
    const authUrl = new URL(`${this.baseUrl}/api/auth/cli`);
    authUrl.searchParams.set('client_id', 'recoder-cli');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    
    console.log('Opening browser for authentication...');
    await this.openBrowser(authUrl.toString());
    
    // Start callback server
    const code = await this.waitForCallback(state);
    
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code, redirectUri);
    
    this.saveSession(tokens);
    console.log('✅ Authentication successful!');
  }

  // Device flow authentication
  async loginWithDeviceFlow(): Promise<void> {
    // Request device code
    const response = await fetch(`${this.baseUrl}/api/auth/cli/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'recoder-cli',
        scope: 'cli:full'
      })
    });
    
    const data = await response.json();
    
    console.log('\n🔑 Go to:', data.verification_uri);
    console.log('📝 Enter code:', data.user_code);
    console.log('\nWaiting for authorization...\n');
    
    // Poll for token
    const tokens = await this.pollForDeviceToken(
      data.device_code,
      data.interval,
      data.expires_in
    );
    
    this.saveSession(tokens);
    console.log('✅ Authentication successful!');
  }

  // API key authentication
  async loginWithApiKey(apiKey: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/keys/validate`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Invalid API key');
    }
    
    const data = await response.json();
    
    this.saveSession({
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
      user: data.user
    });
    
    console.log('✅ Authentication successful!');
  }

  // Refresh access token
  private async refreshToken(refreshToken: string): boolean {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/cli/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: refreshToken,
          client_id: 'recoder-cli'
        })
      });
      
      if (!response.ok) return false;
      
      const data = await response.json();
      const session = this.getSession();
      if (session) {
        session.accessToken = data.access_token;
        session.expiresAt = Date.now() + (data.expires_in * 1000);
        this.saveSession(session);
      }
      
      return true;
    } catch {
      return false;
    }
  }

  // Helper methods
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async openBrowser(url: string): Promise<void> {
    const { default: open } = await import('open');
    await open(url);
  }

  private async waitForCallback(expectedState: string): Promise<string> {
    // Implementation of local callback server
    // Returns authorization code
    // Validates state parameter
    return 'auth_code_here';
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<Session> {
    const response = await fetch(`${this.baseUrl}/api/auth/cli/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: 'recoder-cli',
        redirect_uri: redirectUri
      })
    });
    
    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      user: data.user
    };
  }

  private async pollForDeviceToken(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<Session> {
    const maxAttempts = Math.floor(expiresIn / interval);
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
      
      const response = await fetch(`${this.baseUrl}/api/auth/cli/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_code: deviceCode,
          client_id: 'recoder-cli'
        })
      });
      
      const data = await response.json();
      
      if (data.access_token) {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (900 * 1000), // 15 min
          user: data.user
        };
      }
      
      if (data.error === 'access_denied') {
        throw new Error('Authorization denied');
      }
      
      if (data.error === 'slow_down') {
        interval += 5; // Increase polling interval
      }
    }
    
    throw new Error('Device flow timed out');
  }
}
```

### 2. Usage Tracking Module

```typescript
// ~/.recoder-code/src/usage/index.ts

export class UsageTracker {
  private baseUrl: string;
  private sessionId: string | null = null;

  constructor() {
    this.baseUrl = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
  }

  async startSession(accessToken: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/sessions/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'cli',
        metadata: {
          platform: process.platform,
          version: '1.0.0'
        }
      })
    });

    const data = await response.json();
    this.sessionId = data.sessionId;
    
    console.log(`📊 Session ${data.sessionNumber}/6 started`);
    console.log(`🎯 Pricey model tokens: ${data.limits.priceyTokensRemaining} remaining\n`);
    
    return data.sessionId;
  }

  async trackUsage(
    accessToken: string,
    model: string,
    tokensUsed: number
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    const response = await fetch(
      `${this.baseUrl}/api/sessions/${this.sessionId}/usage`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          tokensUsed
        })
      }
    );

    const data = await response.json();
    
    if (data.warning) {
      console.warn(`⚠️  ${data.warning}`);
    }
  }

  async endSession(accessToken: string): Promise<void> {
    if (!this.sessionId) return;

    await fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/end`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    this.sessionId = null;
  }
}
```

---

## 🚀 Quick Start for CLI Integration

### 1. Install Dependencies

```bash
npm install open node-fetch
```

### 2. Create Auth Command

```typescript
// recoder-code/src/commands/auth.ts

import { Command } from 'commander';
import { RecoderAuth } from '../auth';

export function createAuthCommand(): Command {
  const auth = new Command('auth');

  auth
    .command('login')
    .description('Authenticate with recoder.xyz')
    .option('--browser', 'Use browser OAuth (default)')
    .option('--device', 'Use device flow (headless)')
    .option('--api-key <key>', 'Use API key')
    .action(async (options) => {
      const client = new RecoderAuth();

      if (options.apiKey) {
        await client.loginWithApiKey(options.apiKey);
      } else if (options.device) {
        await client.loginWithDeviceFlow();
      } else {
        await client.loginWithBrowser();
      }
    });

  auth
    .command('logout')
    .description('Logout from recoder.xyz')
    .action(() => {
      const client = new RecoderAuth();
      client.logout();
      console.log('✅ Logged out successfully');
    });

  auth
    .command('status')
    .description('Check authentication status')
    .action(async () => {
      const client = new RecoderAuth();
      const session = client.getSession();
      
      if (!session) {
        console.log('❌ Not authenticated');
        return;
      }

      console.log('✅ Authenticated as:', session.user.email);
      console.log('Plan:', session.user.subscriptionPlan);
      console.log('Has API Key:', session.user.hasOwnApiKey);
    });

  return auth;
}
```

### 3. Integrate into Main CLI

```typescript
// recoder-code/src/index.ts

import { program } from 'commander';
import { RecoderAuth } from './auth';
import { UsageTracker } from './usage';
import { createAuthCommand } from './commands/auth';

const auth = new RecoderAuth();
const tracker = new UsageTracker();

// Add auth command
program.addCommand(createAuthCommand());

// Wrap main commands with auth check
async function requireAuth(): Promise<string> {
  if (!auth.isAuthenticated()) {
    console.log('🔒 Authentication required. Run: recoder-code auth login');
    process.exit(1);
  }
  
  const session = auth.getSession();
  return session!.accessToken;
}

// Example: /new command
program
  .command('/new')
  .description('Create a new project')
  .action(async (prompt) => {
    const accessToken = await requireAuth();
    
    // Start session
    await tracker.startSession(accessToken);
    
    // Your AI logic here
    // ...
    
    // Track usage
    await tracker.trackUsage(accessToken, 'claude-3-5-sonnet', 1500);
    
    // End session when done
    await tracker.endSession(accessToken);
  });

program.parse();
```

---

## 📝 Environment Variables

Create `.env` file in CLI:

```bash
# Production
RECODER_API_URL=https://api.recoder.xyz
RECODER_WEB_URL=https://recoder.xyz

# Development
# RECODER_API_URL=http://localhost:3001
# RECODER_WEB_URL=http://localhost:3002
```

---

## ✅ Testing Checklist

1. **Test Authentication**
   ```bash
   recoder-code auth login --browser
   recoder-code auth login --device
   recoder-code auth login --api-key rck_test_123
   ```

2. **Test Session Management**
   ```bash
   recoder-code /new "build a todo app"
   # Should start session, track usage, end session
   ```

3. **Test Free User Flow**
   - Authenticate
   - Should prompt for OpenRouter API key
   - Add key
   - Should work with user's key

4. **Test Premium User Flow**
   - Authenticate as premium user
   - Should NOT ask for API key
   - Should use platform keys

5. **Test Usage Limits**
   - Use 6 sessions in a day
   - 7th session should be blocked
   - Test pricey model token limits

---

## 🎯 Key Takeaways

1. **All users authenticate via recoder.xyz** first
2. **Free users** must add their own OpenRouter API key
3. **Premium users** use platform API keys (no setup needed)
4. **Usage is session-based**: 6 sessions/day for free, more for premium
5. **Token limits** only apply to pricey models (Claude 4.5, Gemini 2.5 Pro, etc.)
6. **Free models** are unlimited for all users
7. **No cost/token info shown** to users - just session and pricey token limits

---

## 📚 Additional Resources

- **Database Schema**: `/app/prisma/schema.prisma`
- **API Routes**: `/app/app/api/*`
- **Auth Pages**: `/app/app/auth/*`
- **Pricing Page**: `/app/app/pricing/page.tsx`
- **Environment Config**: `/app/.env`

---

**Ready to integrate!** 🚀

Use this guide to implement recoder.xyz authentication in recoder-code CLI. All endpoints are documented, flows are explained, and code examples are provided.
