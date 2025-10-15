# Recoder.xyz Authentication Integration Guide
## Complete Guide for recoder-code (VS Code Extension) Integration

> **Last Updated**: October 2024  
> **For**: AI Copilot implementing recoder-code authentication  
> **Platform**: recoder.xyz authentication system

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Authentication Architecture](#authentication-architecture)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [User Flow & States](#user-flow--states)
5. [Implementation Examples](#implementation-examples)
6. [Testing & Debugging](#testing--debugging)

---

## 🎯 System Overview

### Platform Structure

Recoder.xyz consists of three main platforms:

| Platform | URL | Purpose |
|----------|-----|---------|
| **Landing/Auth** | `recoder.xyz` | User registration, authentication, subscription management |
| **Web IDE** | `web.recoder.xyz` | Bolt.new-like AI app generator with IDE |
| **API Backend** | `api.recoder.xyz` | Authentication, user management, usage tracking |

### User Types & Access

```typescript
type UserPlan = 'free' | 'weekly' | 'monthly' | 'pro';

interface UserAccess {
  free: {
    requiresApiKey: true;
    openRouterKey: 'user-provided';
    sessionsPerDay: 6;
    priceyModelTokens: 10000; // per session
    freeModels: 'unlimited';
  };
  weekly: {
    requiresApiKey: false;
    openRouterKey: 'platform-provided';
    sessionsPerDay: 10;
    priceyModelTokens: 30000;
    freeModels: 'unlimited';
  };
  monthly: {
    requiresApiKey: false;
    openRouterKey: 'platform-provided';
    sessionsPerDay: 15;
    priceyModelTokens: 50000;
    freeModels: 'unlimited';
  };
  pro: {
    requiresApiKey: false;
    openRouterKey: 'platform-provided';
    sessionsPerDay: 20;
    priceyModelTokens: 100000;
    freeModels: 'unlimited';
  };
}
```

### Pricey vs Free Models

**Pricey Models** (token-limited):
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash-exp`
- `openai/gpt-4-turbo`
- Any model with cost > $0.50 per million tokens

**Free Models** (unlimited):
- `meta-llama/llama-3.1-8b-instruct:free`
- `google/gemini-flash-1.5-8b-exp:free`
- `mistralai/mistral-7b-instruct:free`
- All models tagged with `:free` on OpenRouter

---

## 🏗️ Authentication Architecture

### Environment Configuration

```typescript
// Environment variables for different environments
const CONFIG = {
  development: {
    APP_URL: 'http://localhost:3000',
    API_URL: 'http://localhost:3001',
    WEB_IDE_URL: 'http://localhost:3002',
  },
  production: {
    APP_URL: 'https://recoder.xyz',
    API_URL: 'https://api.recoder.xyz',
    WEB_IDE_URL: 'https://web.recoder.xyz',
  }
};
```

### Authentication Methods

recoder-code supports **4 authentication methods**:

#### 1. Web OAuth (Primary Method)
```typescript
// User clicks "Sign in with recoder.xyz"
// Opens browser to: https://recoder.xyz/api/auth/cli

POST https://api.recoder.xyz/api/auth/cli/authorize
{
  "clientId": "recoder-code-extension",
  "clientSecret": "<your-client-secret>",
  "scope": "cli:full user:read generate:code",
  "redirectUri": "http://localhost:8080/callback"
}

// Response:
{
  "authUrl": "https://recoder.xyz/auth/authorize?code=AUTH_CODE&state=STATE",
  "code": "auth_code_xxx",
  "state": "random_state"
}

// User authorizes → callback receives code
// Exchange code for token:

POST https://api.recoder.xyz/api/auth/cli/token
{
  "code": "auth_code_xxx",
  "clientId": "recoder-code-extension",
  "clientSecret": "<your-client-secret>"
}

// Response:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 3600,
    "user": {
      "id": "user_xxx",
      "email": "user@example.com",
      "name": "John Doe",
      "plan": "monthly",
      "hasOwnApiKey": false,
      "openRouterConfig": {
        "usesPlatformKey": true,
        "keyId": "platform_key_2"
      }
    }
  }
}
```

#### 2. Device Flow (Recommended for CLI/Extension)
```typescript
// Step 1: Initialize device flow
POST https://api.recoder.xyz/api/auth/cli/device
{
  "clientId": "recoder-code-extension",
  "scope": "cli:full user:read generate:code"
}

// Response:
{
  "success": true,
  "data": {
    "deviceCode": "device_xxx",
    "userCode": "ABCD-1234", // User enters this
    "verificationUri": "https://recoder.xyz/auth/device",
    "verificationUriComplete": "https://recoder.xyz/auth/device?code=ABCD-1234",
    "expiresIn": 900,
    "interval": 5
  }
}

// Step 2: Show user the code and URL
console.log(`
🔐 Authentication Required
Please visit: https://recoder.xyz/auth/device
Enter code: ABCD-1234

Or scan this QR code:
[QR CODE]
`);

// Step 3: Poll for authorization
let attempts = 0;
const maxAttempts = 180; // 15 minutes

while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const response = await fetch('https://api.recoder.xyz/api/auth/cli/device/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceCode: 'device_xxx',
      clientId: 'recoder-code-extension'
    })
  });
  
  const data = await response.json();
  
  if (data.success && data.data.status === 'authorized') {
    // Got tokens!
    const { accessToken, refreshToken, user } = data.data;
    saveTokens({ accessToken, refreshToken, user });
    break;
  }
  
  if (data.data.status === 'denied' || data.data.status === 'expired') {
    throw new Error('Authentication failed');
  }
  
  attempts++;
}
```

#### 3. API Key Authentication
```typescript
// For users who generate API keys in dashboard
// https://recoder.xyz/settings/api-keys

// API Key Format: rck_live_xxxxxxxxxxxxx

// Usage:
const response = await fetch('https://api.recoder.xyz/api/user/profile', {
  headers: {
    'Authorization': 'Bearer rck_live_xxxxxxxxxxxxx',
    'Content-Type': 'application/json'
  }
});
```

#### 4. Direct Email/Password (Not Recommended for Extension)
```typescript
// Only for testing or special cases
POST https://api.recoder.xyz/api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

---

## 📡 API Endpoints Reference

### Base URLs
```
Production: https://api.recoder.xyz
Development: http://localhost:3001
```

### Authentication Endpoints

#### Register New User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}

Response 201:
{
  "success": true,
  "data": {
    "user": {
      "id": "user_xxx",
      "email": "user@example.com",
      "name": "John Doe",
      "plan": "free",
      "hasOwnApiKey": false,
      "onboardingStep": "pending_api_key"
    },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response 200:
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}

Response 200:
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 3600
  }
}
```

### User Management Endpoints

#### Get User Profile
```http
GET /api/user/profile
Authorization: Bearer <access_token>

Response 200:
{
  "success": true,
  "data": {
    "id": "user_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "plan": "monthly",
    "hasOwnApiKey": false,
    "openRouterConfig": {
      "usesPlatformKey": true,
      "keyId": "platform_key_2"
    },
    "quota": {
      "sessionsToday": 3,
      "sessionsLimit": 15,
      "priceyTokensUsed": 15000,
      "priceyTokensLimit": 50000
    }
  }
}
```

#### Add OpenRouter API Key (Free Users Only)
```http
POST /api/user/api-key
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "apiKey": "sk-or-v1-xxxxxxxxxxxxx"
}

Response 200:
{
  "success": true,
  "data": {
    "user": {
      "id": "user_xxx",
      "hasOwnApiKey": true,
      "onboardingStep": "completed"
    }
  }
}
```

#### Get Usage Statistics
```http
GET /api/user/usage/stats
Authorization: Bearer <access_token>

Response 200:
{
  "success": true,
  "data": {
    "today": {
      "sessions": 3,
      "priceyTokens": 15000,
      "requests": 42
    },
    "thisMonth": {
      "sessions": 87,
      "priceyTokens": 430000,
      "totalCost": 2.15
    },
    "limits": {
      "sessionsPerDay": 15,
      "priceyTokensPerSession": 50000
    }
  }
}
```

### Session Management Endpoints

#### Start Work Session
```http
POST /api/user/session/start
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "platform": "vscode-extension",
  "projectName": "My Awesome App",
  "description": "Building a React dashboard"
}

Response 200:
{
  "success": true,
  "data": {
    "sessionId": "session_xxx",
    "sessionToken": "tok_xxx",
    "startedAt": "2024-10-11T12:00:00Z",
    "limits": {
      "priceyTokensRemaining": 50000,
      "sessionsRemainingToday": 12
    }
  }
}
```

#### Track Usage in Session
```http
POST /api/user/session/usage
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "sessionToken": "tok_xxx",
  "model": "anthropic/claude-3.5-sonnet",
  "tokensUsed": 1500,
  "requestType": "code_generation"
}

Response 200:
{
  "success": true,
  "data": {
    "recorded": true,
    "remainingTokens": 48500,
    "sessionTokensUsed": 1500
  }
}
```

#### End Work Session
```http
POST /api/user/session/end
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "sessionToken": "tok_xxx"
}

Response 200:
{
  "success": true,
  "data": {
    "sessionId": "session_xxx",
    "duration": 3600,
    "totalTokens": 25000,
    "totalCost": 0.125
  }
}
```

---

## 🔄 User Flow & States

### New User Journey (Free Plan)

```
1. User installs recoder-code extension
   ↓
2. Extension detects no auth → Shows "Sign in" prompt
   ↓
3. User clicks "Sign in with recoder.xyz"
   ↓
4. Opens browser → https://recoder.xyz/auth/device?code=ABCD-1234
   ↓
5. User signs up/logs in on website
   ↓
6. User clicks "Authorize recoder-code"
   ↓
7. Website: "You're on the Free plan - add your OpenRouter key"
   ↓
8. User enters OpenRouter API key → Validated & encrypted
   ↓
9. Success! User can now use extension
   ↓
10. Extension shows: "✅ Authenticated as user@example.com (Free Plan)"
```

### Premium User Journey (Weekly/Monthly/Pro)

```
1. User installs recoder-code extension
   ↓
2. Extension detects no auth → Shows "Sign in" prompt
   ↓
3. User clicks "Sign in with recoder.xyz"
   ↓
4. Opens browser → https://recoder.xyz/auth/device?code=ABCD-1234
   ↓
5. User already has Premium account → Logs in
   ↓
6. User clicks "Authorize recoder-code"
   ↓
7. ✅ Instant success - NO API KEY NEEDED
   ↓
8. Extension shows: "✅ Authenticated as user@example.com (Monthly Plan)"
   ↓
9. User can immediately start coding with all models
```

### User State Machine

```typescript
type UserState = 
  | 'unauthenticated'        // No tokens, needs to sign in
  | 'authenticated_pending'  // Has tokens, but free user needs API key
  | 'authenticated_ready'    // Has tokens + (API key OR paid plan)
  | 'session_active'         // Currently in a work session
  | 'quota_exceeded'         // Hit daily limits
  | 'token_expired'          // Access token expired, need refresh
  | 'refresh_failed';        // Refresh token invalid, need re-auth

interface UserStateManager {
  async checkState(): Promise<UserState> {
    const tokens = await getStoredTokens();
    
    if (!tokens) {
      return 'unauthenticated';
    }
    
    if (isTokenExpired(tokens.accessToken)) {
      try {
        await refreshTokens(tokens.refreshToken);
        return this.checkState(); // Recursive check
      } catch (error) {
        return 'refresh_failed';
      }
    }
    
    const user = await getUserProfile(tokens.accessToken);
    
    if (user.plan === 'free' && !user.hasOwnApiKey) {
      return 'authenticated_pending';
    }
    
    const quota = user.quota;
    if (quota.sessionsToday >= quota.sessionsLimit) {
      return 'quota_exceeded';
    }
    
    return 'authenticated_ready';
  }
}
```

---

## 💻 Implementation Examples

### Complete Extension Authentication Class

```typescript
import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'weekly' | 'monthly' | 'pro';
  hasOwnApiKey: boolean;
  openRouterConfig?: {
    usesPlatformKey: boolean;
    keyId?: string;
  };
  quota: {
    sessionsToday: number;
    sessionsLimit: number;
    priceyTokensUsed: number;
    priceyTokensLimit: number;
  };
}

class RecoderAuthManager {
  private static readonly API_URL = 
    process.env.NODE_ENV === 'production' 
      ? 'https://api.recoder.xyz'
      : 'http://localhost:3001';
  
  private static readonly CLIENT_ID = 'recoder-code-extension';
  private static readonly CALLBACK_PORT = 8080;
  
  private context: vscode.ExtensionContext;
  private statusBarItem: vscode.StatusBarItem;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
  }
  
  // ==========================================
  // Device Flow Authentication (Recommended)
  // ==========================================
  
  async authenticateWithDeviceFlow(): Promise<AuthTokens> {
    try {
      // Step 1: Initialize device flow
      const deviceData = await this.initializeDeviceFlow();
      
      // Step 2: Show user the code
      await this.showDeviceCodePrompt(deviceData);
      
      // Step 3: Poll for authorization
      const tokens = await this.pollForAuthorization(deviceData);
      
      // Step 4: Check if user needs to add API key
      await this.checkApiKeyRequirement(tokens);
      
      // Step 5: Save tokens securely
      await this.saveTokens(tokens);
      
      // Step 6: Update UI
      this.updateStatusBar(tokens.user);
      
      vscode.window.showInformationMessage(
        `✅ Signed in as ${tokens.user.email} (${tokens.user.plan} plan)`
      );
      
      return tokens;
      
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Authentication failed: ${error.message}`
      );
      throw error;
    }
  }
  
  private async initializeDeviceFlow() {
    const response = await fetch(
      `${RecoderAuthManager.API_URL}/api/auth/cli/device`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: RecoderAuthManager.CLIENT_ID,
          scope: 'cli:full user:read generate:code'
        })
      }
    );
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to initialize device flow');
    }
    
    return data.data;
  }
  
  private async showDeviceCodePrompt(deviceData: any) {
    const { userCode, verificationUriComplete, expiresIn } = deviceData;
    
    // Open browser automatically
    await vscode.env.openExternal(vscode.Uri.parse(verificationUriComplete));
    
    // Show notification with code
    const selection = await vscode.window.showInformationMessage(
      `🔐 Sign in to recoder.xyz\n\nYour code: ${userCode}\n\n` +
      `A browser window has opened. If not, visit:\n${verificationUriComplete}`,
      { modal: true },
      'I\'ve authorized',
      'Copy Code',
      'Cancel'
    );
    
    if (selection === 'Copy Code') {
      await vscode.env.clipboard.writeText(userCode);
      vscode.window.showInformationMessage('Code copied to clipboard!');
    } else if (selection === 'Cancel') {
      throw new Error('Authentication cancelled');
    }
  }
  
  private async pollForAuthorization(deviceData: any): Promise<AuthTokens> {
    const { deviceCode, interval, expiresIn } = deviceData;
    const maxAttempts = Math.floor(expiresIn / interval);
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
      
      const response = await fetch(
        `${RecoderAuthManager.API_URL}/api/auth/cli/device/poll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceCode,
            clientId: RecoderAuthManager.CLIENT_ID
          })
        }
      );
      
      const data = await response.json();
      
      if (data.success && data.data.status === 'authorized') {
        return data.data as AuthTokens;
      }
      
      if (data.data.status === 'denied') {
        throw new Error('Authorization denied');
      }
      
      if (data.data.status === 'expired') {
        throw new Error('Authorization code expired');
      }
    }
    
    throw new Error('Authorization timeout');
  }
  
  // ==========================================
  // API Key Management (for free users)
  // ==========================================
  
  private async checkApiKeyRequirement(tokens: AuthTokens) {
    if (tokens.user.plan !== 'free') {
      return; // Paid users don't need API key
    }
    
    if (tokens.user.hasOwnApiKey) {
      return; // Already has API key
    }
    
    // Free user needs to add OpenRouter key
    const apiKey = await this.promptForApiKey();
    
    if (!apiKey) {
      throw new Error('OpenRouter API key required for free plan');
    }
    
    await this.saveApiKey(tokens.accessToken, apiKey);
    tokens.user.hasOwnApiKey = true;
  }
  
  private async promptForApiKey(): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter API key',
      placeHolder: 'sk-or-v1-...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.startsWith('sk-or-')) {
          return 'Invalid OpenRouter API key format';
        }
        return null;
      }
    });
    
    return result;
  }
  
  private async saveApiKey(accessToken: string, apiKey: string) {
    const response = await fetch(
      `${RecoderAuthManager.API_URL}/api/user/api-key`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey })
      }
    );
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to save API key');
    }
  }
  
  // ==========================================
  // Session Management
  // ==========================================
  
  async startWorkSession(projectName?: string): Promise<string> {
    const tokens = await this.getTokens();
    
    if (!tokens) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(
      `${RecoderAuthManager.API_URL}/api/user/session/start`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platform: 'vscode-extension',
          projectName: projectName || vscode.workspace.name,
          description: 'VS Code session'
        })
      }
    );
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to start session');
    }
    
    // Save session token
    await this.context.workspaceState.update(
      'activeSessionToken',
      data.data.sessionToken
    );
    
    return data.data.sessionToken;
  }
  
  async trackUsage(model: string, tokensUsed: number) {
    const sessionToken = this.context.workspaceState.get<string>(
      'activeSessionToken'
    );
    
    if (!sessionToken) {
      console.warn('No active session, skipping usage tracking');
      return;
    }
    
    const tokens = await this.getTokens();
    
    if (!tokens) {
      return;
    }
    
    await fetch(
      `${RecoderAuthManager.API_URL}/api/user/session/usage`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionToken,
          model,
          tokensUsed,
          requestType: 'code_generation'
        })
      }
    );
  }
  
  // ==========================================
  // Token Management
  // ==========================================
  
  async getTokens(): Promise<AuthTokens | null> {
    const stored = await this.context.secrets.get('recoder_tokens');
    
    if (!stored) {
      return null;
    }
    
    const tokens: AuthTokens = JSON.parse(stored);
    
    // Check if expired
    if (Date.now() >= tokens.expiresAt) {
      return await this.refreshAccessToken(tokens.refreshToken);
    }
    
    return tokens;
  }
  
  private async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const response = await fetch(
      `${RecoderAuthManager.API_URL}/api/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      }
    );
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Failed to refresh token - please sign in again');
    }
    
    const tokens = data.data as AuthTokens;
    await this.saveTokens(tokens);
    
    return tokens;
  }
  
  private async saveTokens(tokens: AuthTokens) {
    await this.context.secrets.store(
      'recoder_tokens',
      JSON.stringify(tokens)
    );
  }
  
  async signOut() {
    await this.context.secrets.delete('recoder_tokens');
    await this.context.workspaceState.update('activeSessionToken', undefined);
    this.statusBarItem.text = '$(sign-in) Sign in to Recoder';
    vscode.window.showInformationMessage('Signed out successfully');
  }
  
  // ==========================================
  // UI Updates
  // ==========================================
  
  private updateStatusBar(user: User) {
    const planIcon = {
      free: '$(circle-outline)',
      weekly: '$(circle-filled)',
      monthly: '$(star)',
      pro: '$(star-full)'
    }[user.plan];
    
    this.statusBarItem.text = `${planIcon} ${user.email}`;
    this.statusBarItem.tooltip = 
      `Plan: ${user.plan}\n` +
      `Sessions today: ${user.quota.sessionsToday}/${user.quota.sessionsLimit}\n` +
      `Pricey tokens: ${user.quota.priceyTokensUsed}/${user.quota.priceyTokensLimit}`;
    this.statusBarItem.show();
  }
}

// ==========================================
// Extension Activation
// ==========================================

export function activate(context: vscode.ExtensionContext) {
  const authManager = new RecoderAuthManager(context);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('recoder.signIn', async () => {
      await authManager.authenticateWithDeviceFlow();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('recoder.signOut', async () => {
      await authManager.signOut();
    })
  );
  
  // Check auth status on activation
  authManager.getTokens().then(tokens => {
    if (tokens) {
      vscode.window.showInformationMessage(
        `Welcome back, ${tokens.user.email}!`
      );
    }
  });
}
```

---

## 🧪 Testing & Debugging

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/yourusername/recoder.xyz
cd recoder.xyz

# 2. Install dependencies
cd app && npm install
cd ../backend && npm install

# 3. Set up environment variables
cp app/.env.example app/.env.local
cp backend/.env.example backend/.env

# 4. Start database (Docker)
docker-compose up -d postgres redis

# 5. Run migrations
cd app && npx prisma migrate dev

# 6. Start services
npm run dev:all
# OR individually:
# Terminal 1: cd app && npm run dev
# Terminal 2: cd backend && npm run dev
```

### Testing Authentication Flow

```bash
# Test device flow
curl -X POST http://localhost:3001/api/auth/cli/device \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "recoder-code-extension",
    "scope": "cli:full user:read generate:code"
  }'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "deviceCode": "device_xxx",
#     "userCode": "ABCD-1234",
#     "verificationUri": "http://localhost:3000/auth/device",
#     "expiresIn": 900,
#     "interval": 5
#   }
# }

# Visit in browser: http://localhost:3000/auth/device?code=ABCD-1234
# Authorize the device

# Poll for authorization
curl -X POST http://localhost:3001/api/auth/cli/device/poll \
  -H "Content-Type: application/json" \
  -d '{
    "deviceCode": "device_xxx",
    "clientId": "recoder-code-extension"
  }'
```

### Debugging Checklist

```typescript
// Common issues and solutions

const DEBUGGING_GUIDE = {
  'Token expired': {
    issue: 'Access token has expired',
    solution: 'Call /api/auth/refresh with refreshToken',
    code: `
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
    `
  },
  
  'API key required': {
    issue: 'Free user hasn\'t added OpenRouter key',
    solution: 'Prompt user to add API key',
    code: `
      if (user.plan === 'free' && !user.hasOwnApiKey) {
        promptForApiKey();
      }
    `
  },
  
  'Quota exceeded': {
    issue: 'User hit daily session limit',
    solution: 'Show upgrade prompt',
    code: `
      if (user.quota.sessionsToday >= user.quota.sessionsLimit) {
        showUpgradeDialog();
      }
    `
  },
  
  'CORS error': {
    issue: 'Request blocked by CORS',
    solution: 'Ensure API allows your origin',
    check: 'Backend CORS config includes your domain'
  }
};
```

---

## 📚 Additional Resources

### Important Links
- **Landing Page**: https://recoder.xyz
- **Web IDE**: https://web.recoder.xyz
- **API Docs**: https://api.recoder.xyz/docs
- **Dashboard**: https://recoder.xyz/dashboard
- **Pricing**: https://recoder.xyz/pricing

### Support
- **Email**: support@recoder.xyz
- **Discord**: https://discord.gg/recoder
- **GitHub**: https://github.com/yourusername/recoder.xyz

### API Rate Limits
- **Free users**: 60 requests/minute
- **Paid users**: 300 requests/minute
- **Enterprise**: Custom limits

---

## 🔐 Security Best Practices

1. **Never log tokens** - Store securely using VS Code secrets API
2. **Validate all responses** - Check `success` field before using data
3. **Handle errors gracefully** - Show user-friendly messages
4. **Refresh tokens proactively** - Don't wait for 401 errors
5. **Clear data on sign out** - Remove all stored credentials
6. **Use HTTPS in production** - Never send tokens over HTTP

---

**Last Updated**: October 2024  
**Version**: 1.0.0  
**Maintainer**: Recoder.xyz Team
