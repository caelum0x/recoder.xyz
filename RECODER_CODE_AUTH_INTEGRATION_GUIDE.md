# Recoder Code - Authentication Integration Guide

**For AI Copilot: Complete Guide to Integrate recoder.xyz Authentication**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication Flows](#authentication-flows)
4. [API Endpoints](#api-endpoints)
5. [Implementation Guide](#implementation-guide)
6. [Code Examples](#code-examples)
7. [Token Management](#token-management)
8. [Error Handling](#error-handling)
9. [Testing](#testing)

---

## 🎯 Overview

### What is This?

This guide explains how **recoder-code** (VS Code extension) authenticates users through **recoder.xyz** (web platform) to:

1. ✅ Authenticate users on first install
2. ✅ Store user data in database  
3. ✅ Collect OpenRouter API keys from free users
4. ✅ Track usage and enforce quotas
5. ✅ Distinguish between free and premium users

### User Journey

```
1. User installs recoder-code extension
2. Extension prompts: "Sign in to recoder.xyz"
3. Browser opens → User signs in/signs up
4. User added to database automatically
5. Free users: Prompted for OpenRouter API key
6. Premium users: Use platform API keys (no prompt needed)
7. Extension stores session + tracks usage
```

### Subscription Tiers

| Tier | API Key Required? | Usage Tracking | Monthly Limit |
|------|-------------------|----------------|---------------|
| **Free** | ✅ Yes (user's own OpenRouter key) | ✅ Yes | 1,000 requests |
| **Pro** | ❌ No (platform provides keys) | ✅ Yes | 50,000 requests |
| **Enterprise** | ❌ No (dedicated keys) | ✅ Yes | 1,000,000 requests |

---

## 🏗️ Architecture

### System Components

```
┌─────────────────┐
│  Recoder Code   │ (VS Code Extension)
│   (CLI Client)  │
└────────┬────────┘
         │
         │ 1. Initiate Auth
         ↓
┌─────────────────┐
│  Recoder.xyz    │ (Web Platform)
│  (Auth Server)  │ https://recoder.xyz
└────────┬────────┘
         │
         │ 2. User Login/OAuth
         ↓
┌─────────────────┐
│  Database       │ (PostgreSQL via Neon)
│  (User Store)   │ 
└────────┬────────┘
         │
         │ 3. Session + Tokens
         ↓
┌─────────────────┐
│  Backend API    │ (Express.js)
│  (Usage Track)  │ https://api.recoder.xyz
└─────────────────┘
```

### Authentication Database Schema

```typescript
// User (main user table)
{
  id: string                    // Primary key
  email: string                 // Unique email
  name: string                  // Display name
  passwordHash?: string         // For email/password auth
  subscriptionPlan: string      // 'free' | 'pro' | 'enterprise'
  subscriptionStatus: string    // 'active' | 'canceled' | 'expired'
  
  // API Key Management (FREE USERS)
  openRouterApiKey?: string     // Encrypted user's API key
  hasOwnApiKey: boolean         // true if user provided key
  onboardingStep?: string       // 'pending_api_key' | 'completed'
  
  // Premium tracking
  preferredModels: string[]     // Model preferences
  routerEnabled: boolean        // Smart routing enabled
  
  // Metadata
  emailVerified: boolean
  createdAt: DateTime
  lastLoginAt?: DateTime
}

// CLISession (active sessions)
{
  id: string
  userId: string                // Foreign key to User
  accessToken: string           // JWT token
  refreshToken?: string         // For token refresh
  deviceType: string            // 'cli' | 'extension' | 'web'
  deviceName?: string           // 'VS Code on MacBook Pro'
  expiresAt: DateTime           // Token expiration
  isActive: boolean             // Session active?
  lastUsedAt: DateTime          // Last activity
}

// UserQuota (usage tracking)
{
  id: string
  userId: string
  requestsLimit: number         // Monthly limit
  requestsUsed: number          // Requests this period
  tokensUsed: BigInt            // Tokens consumed
  costThisPeriod: number        // $ cost (for premium)
  periodStart: DateTime         // Quota period start
  periodEnd: DateTime           // Quota period end (monthly)
}

// UsageRecord (detailed logs)
{
  id: string
  userId: string
  requestType: string           // 'cli' | 'extension' | 'api'
  tokensUsed: number            // Per request
  cost?: number                 // $ cost
  modelUsed?: string            // Which AI model
  success: boolean              // Request succeeded?
  createdAt: DateTime
}
```

---

## 🔐 Authentication Flows

### Flow 1: Web OAuth Flow (Recommended)

**Use Case:** User is at their computer, browser available

```
┌─────────┐                    ┌──────────┐                  ┌──────────┐
│Recoder  │                    │ Browser  │                  │recoder.xyz│
│  Code   │                    │          │                  │          │
└────┬────┘                    └─────┬────┘                  └─────┬────┘
     │                               │                             │
     │ 1. User runs: /login          │                             │
     ├──────────────────────────────>│                             │
     │                               │                             │
     │ 2. Generate OAuth request     │                             │
     │   (client_id, redirect_uri)   │                             │
     │                               │                             │
     │ 3. Open browser               │                             │
     ├──────────────────────────────>│                             │
     │                               │                             │
     │                               │ 4. GET /api/auth/cli        │
     │                               │    ?response_type=code      │
     │                               ├────────────────────────────>│
     │                               │                             │
     │                               │ 5. Show login page          │
     │                               │<────────────────────────────┤
     │                               │                             │
     │                               │ 6. User enters credentials  │
     │                               │    or uses OAuth            │
     │                               │    (GitHub/Google/Discord)  │
     │                               ├────────────────────────────>│
     │                               │                             │
     │                               │ 7. User created/found in DB │
     │                               │    + Authorization code     │
     │                               │<────────────────────────────┤
     │                               │                             │
     │                               │ 8. Redirect with code       │
     │                               │    localhost:8080/callback  │
     │                               │    ?code=xxx&state=xxx      │
     │ 9. Receive callback          │                             │
     │<──────────────────────────────┤                             │
     │                               │                             │
     │ 10. POST /api/auth/cli                                      │
     │     action: exchange_code                                   │
     │     code: xxx                                               │
     ├─────────────────────────────────────────────────────────────>
     │                                                             │
     │ 11. Validate code + create session                          │
     │     + Return tokens + user data                             │
     │<─────────────────────────────────────────────────────────────
     │                                                             │
     │ 12. Store tokens locally                                    │
     │     + Check if API key needed                               │
     │                                                             │
     │ 13. If free user: Prompt for                                │
     │     OpenRouter API key                                      │
     │                                                             │
     │ 14. POST /api/user/openrouter                               │
     │     { openRouterApiKey: "sk-or-..." }                       │
     ├─────────────────────────────────────────────────────────────>
     │                                                             │
     │ 15. Encrypt + Store API key                                 │
     │<─────────────────────────────────────────────────────────────
     │                                                             │
     │ ✅ Authentication Complete!                                 │
     │
```

### Flow 2: Device Flow (Headless Servers)

**Use Case:** SSH session, remote server, no browser on machine

```
┌─────────┐                                           ┌──────────┐
│Recoder  │                                           │recoder.xyz│
│  Code   │                                           │          │
└────┬────┘                                           └─────┬────┘
     │                                                      │
     │ 1. POST /api/auth/cli                               │
     │    action: device_flow                              │
     │    client_id: recoder-code                          │
     ├─────────────────────────────────────────────────────>
     │                                                      │
     │ 2. Generate device code + user code                 │
     │<─────────────────────────────────────────────────────
     │    {                                                 │
     │      device_code: "xxx",                             │
     │      user_code: "ABCD-1234",                         │
     │      verification_uri: "recoder.xyz/auth/device",    │
     │      expires_in: 900                                 │
     │    }                                                 │
     │                                                      │
     │ 3. Display to user:                                 │
     │    "Visit https://recoder.xyz/auth/device"          │
     │    "Enter code: ABCD-1234"                          │
     │                                                      │
     │ 4. Start polling (every 5 seconds)                  │
     │    POST /api/auth/cli                               │
     │    action: device_token                             │
     │    device_code: xxx                                 │
     ├─────────────────────────────────────────────────────>
     │                                                      │
     │ 5. Return: { error: "authorization_pending" }       │
     │<─────────────────────────────────────────────────────
     │                                                      │
     │ (User visits website on phone/other device)         │
     │ (Enters code ABCD-1234)                             │
     │ (Approves authorization)                            │
     │                                                      │
     │ 6. Continue polling...                              │
     ├─────────────────────────────────────────────────────>
     │                                                      │
     │ 7. Authorization approved!                          │
     │    Return tokens + user data                        │
     │<─────────────────────────────────────────────────────
     │                                                      │
     │ 8. Store tokens + check API key                     │
     │                                                      │
     │ ✅ Authentication Complete!                         │
     │
```

### Flow 3: API Key Authentication (Legacy)

**Use Case:** User generated API key from dashboard

```
┌─────────┐                                           ┌──────────┐
│Recoder  │                                           │recoder.xyz│
│  Code   │                                           │          │
└────┬────┘                                           └─────┬────┘
     │                                                      │
     │ 1. User runs: /login --api-key rck_xxx              │
     │                                                      │
     │ 2. POST /api/auth/cli                               │
     │    action: validate_token                           │
     │    token: rck_xxx                                   │
     ├─────────────────────────────────────────────────────>
     │                                                      │
     │ 3. Validate API key                                 │
     │    + Increment usage counter                        │
     │    + Get user data                                  │
     │<─────────────────────────────────────────────────────
     │                                                      │
     │ 4. Store key + user data                            │
     │                                                      │
     │ ✅ Authentication Complete!                         │
     │
```

---

## 🔌 API Endpoints

### Base URL

```
Production:  https://recoder.xyz
Development: http://localhost:3000
```

### Authentication Endpoints

#### 1. **Initiate Web OAuth**
```http
GET /api/auth/cli?response_type=code&client_id=recoder-code&redirect_uri=http://localhost:8080/callback&state=random-state&scope=cli:full profile
```

**Response:** HTML page with login form

---

#### 2. **Initiate Device Flow**
```http
POST /api/auth/cli
Content-Type: application/json

{
  "action": "device_flow",
  "client_id": "recoder-code",
  "scope": "cli:full profile"
}
```

**Response:**
```json
{
  "success": true,
  "device_code": "xxx",
  "user_code": "ABCD-1234",
  "verification_uri": "https://recoder.xyz/auth/device",
  "verification_uri_complete": "https://recoder.xyz/auth/device?user_code=ABCD-1234",
  "expires_in": 900,
  "interval": 5
}
```

---

#### 3. **Poll Device Authorization**
```http
POST /api/auth/cli
Content-Type: application/json

{
  "action": "device_token",
  "device_code": "xxx",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}
```

**Response (pending):**
```json
{
  "success": false,
  "error": "authorization_pending",
  "error_description": "User has not yet authorized"
}
```

**Response (approved):**
```json
{
  "success": true,
  "user_id": "usr_xxx",
  "access_token": "rct_xxx",
  "refresh_token": "rcr_xxx",
  "expires_at": "2024-02-01T00:00:00Z",
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "free",
    "quota": {
      "requests_remaining": 1000,
      "requests_limit": 1000,
      "reset_date": "2024-02-01T00:00:00Z"
    }
  }
}
```

---

#### 4. **Exchange Authorization Code**
```http
POST /api/auth/cli
Content-Type: application/json

{
  "action": "exchange_code",
  "grant_type": "authorization_code",
  "client_id": "recoder-code",
  "code": "xxx",
  "redirect_uri": "http://localhost:8080/callback"
}
```

**Response:**
```json
{
  "success": true,
  "user_id": "usr_xxx",
  "access_token": "rct_xxx",
  "refresh_token": "rcr_xxx",
  "expires_at": "2024-02-01T00:00:00Z",
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "free",
    "quota": {
      "requests_remaining": 1000,
      "requests_limit": 1000,
      "reset_date": "2024-02-01T00:00:00Z"
    }
  }
}
```

---

#### 5. **Validate Token**
```http
POST /api/auth/cli
Content-Type: application/json

{
  "action": "validate_token",
  "token": "rct_xxx"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "quota": {
      "requests_remaining": 45000,
      "requests_limit": 50000,
      "reset_date": "2024-02-01T00:00:00Z"
    }
  }
}
```

---

#### 6. **Refresh Token**
```http
POST /api/auth/cli
Content-Type: application/json

{
  "action": "refresh_token",
  "refresh_token": "rcr_xxx",
  "client_id": "recoder-code"
}
```

**Response:**
```json
{
  "success": true,
  "access_token": "rct_new_xxx",
  "expires_at": "2024-02-01T00:00:00Z",
  "user": { /* updated user data */ }
}
```

---

### User API Endpoints

#### 7. **Add OpenRouter API Key (Free Users)**
```http
POST /api/user/openrouter
Authorization: Bearer rct_xxx
Content-Type: application/json

{
  "openRouterApiKey": "sk-or-v1-xxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OpenRouter API key saved successfully",
  "hasApiKey": true
}
```

---

#### 8. **Validate OpenRouter API Key**
```http
GET /api/user/openrouter/validate
Authorization: Bearer rct_xxx
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "hasKey": true
}
```

---

#### 9. **Get User Quota**
```http
GET /api/user/quota
Authorization: Bearer rct_xxx
```

**Response:**
```json
{
  "success": true,
  "quota": {
    "requests_remaining": 850,
    "requests_limit": 1000,
    "tokens_used": 150000,
    "tokens_limit": 1000000,
    "cost_this_period": 2.50,
    "period_start": "2024-01-01T00:00:00Z",
    "period_end": "2024-02-01T00:00:00Z",
    "reset_date": "2024-02-01T00:00:00Z"
  }
}
```

---

#### 10. **Get User Profile**
```http
GET /api/user/profile
Authorization: Bearer rct_xxx
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": "https://...",
    "subscription_plan": "pro",
    "subscription_status": "active",
    "has_own_api_key": false,
    "onboarding_step": "completed",
    "email_verified": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

#### 11. **Get User Subscription**
```http
GET /api/user/subscription
Authorization: Bearer rct_xxx
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "plan": "pro",
    "status": "active",
    "current_period_start": "2024-01-01T00:00:00Z",
    "current_period_end": "2024-02-01T00:00:00Z",
    "quota_limit": 50000,
    "features": ["cli_access", "priority_support", "platform_api_keys"],
    "billing_amount": 29.99,
    "billing_currency": "USD",
    "payment_method": "paddle"
  }
}
```

---

## 💻 Implementation Guide

### Step 1: Initialize Authentication

```typescript
// src/auth/AuthManager.ts

import * as vscode from 'vscode';
import axios from 'axios';
import { nanoid } from 'nanoid';

export class AuthManager {
  private readonly API_BASE = 'https://recoder.xyz';
  private readonly CLIENT_ID = 'recoder-code';
  private readonly CALLBACK_PORT = 8080;
  
  private context: vscode.ExtensionContext;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) return false;
    
    // Validate token with server
    try {
      const response = await axios.post(`${this.API_BASE}/api/auth/cli`, {
        action: 'validate_token',
        token: token
      });
      
      return response.data.success;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get stored access token
   */
  public async getAccessToken(): Promise<string | undefined> {
    return await this.context.secrets.get('recoder.accessToken');
  }
  
  /**
   * Get stored user data
   */
  public async getUser(): Promise<any | undefined> {
    const userJson = await this.context.secrets.get('recoder.user');
    return userJson ? JSON.parse(userJson) : undefined;
  }
  
  /**
   * Save authentication data
   */
  private async saveAuthData(data: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    user: any;
  }): Promise<void> {
    await this.context.secrets.store('recoder.accessToken', data.accessToken);
    if (data.refreshToken) {
      await this.context.secrets.store('recoder.refreshToken', data.refreshToken);
    }
    await this.context.secrets.store('recoder.expiresAt', data.expiresAt);
    await this.context.secrets.store('recoder.user', JSON.stringify(data.user));
  }
  
  /**
   * Clear authentication data (logout)
   */
  public async logout(): Promise<void> {
    await this.context.secrets.delete('recoder.accessToken');
    await this.context.secrets.delete('recoder.refreshToken');
    await this.context.secrets.delete('recoder.expiresAt');
    await this.context.secrets.delete('recoder.user');
    await this.context.secrets.delete('recoder.openRouterApiKey');
  }
}
```

### Step 2: Implement Web OAuth Flow

```typescript
// src/auth/WebOAuthFlow.ts

import * as vscode from 'vscode';
import * as http from 'http';
import axios from 'axios';
import { nanoid } from 'nanoid';

export class WebOAuthFlow {
  private readonly API_BASE = 'https://recoder.xyz';
  private readonly CLIENT_ID = 'recoder-code';
  private readonly CALLBACK_PORT = 8080;
  
  /**
   * Start web OAuth flow
   */
  public async authenticate(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    user: any;
  }> {
    // 1. Generate OAuth parameters
    const state = nanoid(32);
    const redirectUri = `http://localhost:${this.CALLBACK_PORT}/callback`;
    
    // 2. Build authorization URL
    const authUrl = new URL(`${this.API_BASE}/api/auth/cli`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', this.CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'cli:full profile');
    
    // 3. Start local callback server
    const authCodePromise = this.startCallbackServer(state);
    
    // 4. Open browser
    await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
    
    vscode.window.showInformationMessage(
      'Opening browser for authentication...',
      'Waiting for authorization...'
    );
    
    // 5. Wait for callback
    const authCode = await authCodePromise;
    
    // 6. Exchange code for tokens
    const tokenResponse = await axios.post(`${this.API_BASE}/api/auth/cli`, {
      action: 'exchange_code',
      grant_type: 'authorization_code',
      client_id: this.CLIENT_ID,
      code: authCode,
      redirect_uri: redirectUri
    });
    
    if (!tokenResponse.data.success) {
      throw new Error('Failed to exchange authorization code');
    }
    
    return {
      accessToken: tokenResponse.data.access_token,
      refreshToken: tokenResponse.data.refresh_token,
      expiresAt: tokenResponse.data.expires_at,
      user: tokenResponse.data.user
    };
  }
  
  /**
   * Start local HTTP server to receive callback
   */
  private async startCallbackServer(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${this.CALLBACK_PORT}`);
        
        // Handle callback
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(error));
            return;
          }
          
          if (!code || state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Invalid callback parameters</h1>');
            server.close();
            reject(new Error('Invalid callback'));
            return;
          }
          
          // Success!
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>✅ Authentication Successful!</h1>
                <p>You can close this window and return to VS Code.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          
          server.close();
          resolve(code);
        }
      });
      
      server.listen(this.CALLBACK_PORT);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }
}
```

### Step 3: Implement Device Flow

```typescript
// src/auth/DeviceFlow.ts

import * as vscode from 'vscode';
import axios from 'axios';

export class DeviceFlow {
  private readonly API_BASE = 'https://recoder.xyz';
  private readonly CLIENT_ID = 'recoder-code';
  
  /**
   * Start device flow
   */
  public async authenticate(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    user: any;
  }> {
    // 1. Request device code
    const deviceResponse = await axios.post(`${this.API_BASE}/api/auth/cli`, {
      action: 'device_flow',
      client_id: this.CLIENT_ID,
      scope: 'cli:full profile'
    });
    
    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval
    } = deviceResponse.data;
    
    // 2. Show instructions to user
    const openBrowser = await vscode.window.showInformationMessage(
      `To authenticate, visit:\n${verification_uri}\n\nEnter code: ${user_code}`,
      'Open Browser',
      'I\'ll do it manually'
    );
    
    if (openBrowser === 'Open Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(verification_uri_complete));
    }
    
    // 3. Start polling for authorization
    return await this.pollForAuthorization(
      device_code,
      interval * 1000, // Convert to milliseconds
      expires_in * 1000
    );
  }
  
  /**
   * Poll server for device authorization
   */
  private async pollForAuthorization(
    deviceCode: string,
    interval: number,
    timeout: number
  ): Promise<any> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Device flow timeout'));
          return;
        }
        
        try {
          const response = await axios.post(`${this.API_BASE}/api/auth/cli`, {
            action: 'device_token',
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          });
          
          if (response.data.success) {
            // Authorization approved!
            resolve({
              accessToken: response.data.access_token,
              refreshToken: response.data.refresh_token,
              expiresAt: response.data.expires_at,
              user: response.data.user
            });
          } else {
            // Still pending, continue polling
            setTimeout(poll, interval);
          }
        } catch (error: any) {
          if (error.response?.data?.error === 'authorization_pending') {
            // Expected, continue polling
            setTimeout(poll, interval);
          } else {
            reject(error);
          }
        }
      };
      
      // Start polling
      poll();
    });
  }
}
```

### Step 4: Handle API Key Collection (Free Users)

```typescript
// src/auth/ApiKeyManager.ts

import * as vscode from 'vscode';
import axios from 'axios';

export class ApiKeyManager {
  private readonly API_BASE = 'https://recoder.xyz';
  
  /**
   * Check if user needs to provide API key
   */
  public async needsApiKey(user: any): Promise<boolean> {
    // Premium users don't need API keys
    if (user.subscription_plan !== 'free') {
      return false;
    }
    
    // Check if already has API key
    return !user.has_own_api_key;
  }
  
  /**
   * Prompt user for OpenRouter API key
   */
  public async promptForApiKey(accessToken: string): Promise<boolean> {
    // Show explanation
    const learnMore = await vscode.window.showInformationMessage(
      'Free tier requires your own OpenRouter API key. Get one from openrouter.ai',
      'Enter API Key',
      'Learn More',
      'Skip for Now'
    );
    
    if (learnMore === 'Learn More') {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://openrouter.ai/keys')
      );
      return false;
    }
    
    if (learnMore === 'Skip for Now') {
      return false;
    }
    
    // Prompt for API key
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter API key',
      password: true,
      placeHolder: 'sk-or-v1-...',
      validateInput: (value) => {
        if (!value.startsWith('sk-or-')) {
          return 'API key must start with sk-or-';
        }
        return null;
      }
    });
    
    if (!apiKey) {
      return false;
    }
    
    // Save API key to server
    try {
      await axios.post(
        `${this.API_BASE}/api/user/openrouter`,
        { openRouterApiKey: apiKey },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      vscode.window.showInformationMessage(
        '✅ API key saved successfully!'
      );
      
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to save API key: ${error.message}`
      );
      return false;
    }
  }
  
  /**
   * Get OpenRouter API key for requests
   */
  public async getApiKey(accessToken: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.API_BASE}/api/user/openrouter`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      return response.data.openRouterApiKey || null;
    } catch (error) {
      return null;
    }
  }
}
```

### Step 5: Track Usage

```typescript
// src/usage/UsageTracker.ts

import axios from 'axios';

export class UsageTracker {
  private readonly API_BASE = 'https://recoder.xyz';
  
  /**
   * Track a request
   */
  public async trackRequest(
    accessToken: string,
    data: {
      tokensUsed: number;
      modelUsed: string;
      requestType: string;
      success: boolean;
      cost?: number;
    }
  ): Promise<void> {
    try {
      await axios.post(
        `${this.API_BASE}/api/usage/track`,
        data,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }
  
  /**
   * Get current quota
   */
  public async getQuota(accessToken: string): Promise<any> {
    const response = await axios.get(
      `${this.API_BASE}/api/user/quota`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    return response.data.quota;
  }
  
  /**
   * Check if user has exceeded quota
   */
  public async hasExceededQuota(accessToken: string): Promise<boolean> {
    const quota = await this.getQuota(accessToken);
    return quota.requests_remaining <= 0;
  }
}
```

### Step 6: Complete Authentication Flow

```typescript
// src/extension.ts

import * as vscode from 'vscode';
import { AuthManager } from './auth/AuthManager';
import { WebOAuthFlow } from './auth/WebOAuthFlow';
import { DeviceFlow } from './auth/DeviceFlow';
import { ApiKeyManager } from './auth/ApiKeyManager';
import { UsageTracker } from './usage/UsageTracker';

export async function activate(context: vscode.ExtensionContext) {
  const authManager = new AuthManager(context);
  const webOAuth = new WebOAuthFlow();
  const deviceFlow = new DeviceFlow();
  const apiKeyManager = new ApiKeyManager();
  const usageTracker = new UsageTracker();
  
  // Register login command
  context.subscriptions.push(
    vscode.commands.registerCommand('recoder.login', async () => {
      try {
        // Choose authentication method
        const method = await vscode.window.showQuickPick(
          [
            { label: 'Web Browser (Recommended)', value: 'web' },
            { label: 'Device Code (Headless)', value: 'device' }
          ],
          { placeHolder: 'Select authentication method' }
        );
        
        if (!method) return;
        
        // Perform authentication
        vscode.window.showInformationMessage('Authenticating...');
        
        let authData;
        if (method.value === 'web') {
          authData = await webOAuth.authenticate();
        } else {
          authData = await deviceFlow.authenticate();
        }
        
        // Save authentication data
        await authManager.saveAuthData(authData);
        
        vscode.window.showInformationMessage(
          `✅ Logged in as ${authData.user.name}!`
        );
        
        // Check if API key needed
        if (await apiKeyManager.needsApiKey(authData.user)) {
          await apiKeyManager.promptForApiKey(authData.accessToken);
        }
        
        // Check quota
        const quota = await usageTracker.getQuota(authData.accessToken);
        vscode.window.showInformationMessage(
          `Quota: ${quota.requests_remaining}/${quota.requests_limit} requests remaining`
        );
        
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Authentication failed: ${error.message}`
        );
      }
    })
  );
  
  // Auto-authenticate on startup
  if (!(await authManager.isAuthenticated())) {
    const login = await vscode.window.showInformationMessage(
      'Sign in to Recoder to start using AI features',
      'Sign In'
    );
    
    if (login) {
      vscode.commands.executeCommand('recoder.login');
    }
  }
}
```

---

## 🔄 Token Management

### Token Refresh

```typescript
// src/auth/TokenRefresh.ts

export class TokenRefresh {
  private readonly API_BASE = 'https://recoder.xyz';
  private readonly CLIENT_ID = 'recoder-code';
  
  /**
   * Refresh access token
   */
  public async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: string;
  }> {
    const response = await axios.post(`${this.API_BASE}/api/auth/cli`, {
      action: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.CLIENT_ID
    });
    
    if (!response.data.success) {
      throw new Error('Token refresh failed');
    }
    
    return {
      accessToken: response.data.access_token,
      expiresAt: response.data.expires_at
    };
  }
  
  /**
   * Auto-refresh token if expired
   */
  public async ensureValidToken(
    context: vscode.ExtensionContext
  ): Promise<string> {
    const accessToken = await context.secrets.get('recoder.accessToken');
    const refreshToken = await context.secrets.get('recoder.refreshToken');
    const expiresAt = await context.secrets.get('recoder.expiresAt');
    
    if (!accessToken || !refreshToken) {
      throw new Error('Not authenticated');
    }
    
    // Check if token is expired or will expire in next 5 minutes
    const expiryTime = new Date(expiresAt!).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (expiryTime - now < fiveMinutes) {
      // Refresh token
      const newTokens = await this.refreshToken(refreshToken);
      
      await context.secrets.store('recoder.accessToken', newTokens.accessToken);
      await context.secrets.store('recoder.expiresAt', newTokens.expiresAt);
      
      return newTokens.accessToken;
    }
    
    return accessToken;
  }
}
```

---

## ⚠️ Error Handling

### Common Errors

```typescript
export enum AuthError {
  NOT_AUTHENTICATED = 'not_authenticated',
  INVALID_TOKEN = 'invalid_token',
  TOKEN_EXPIRED = 'token_expired',
  QUOTA_EXCEEDED = 'quota_exceeded',
  API_KEY_MISSING = 'api_key_missing',
  API_KEY_INVALID = 'api_key_invalid',
  NETWORK_ERROR = 'network_error',
  SERVER_ERROR = 'server_error'
}

export class AuthErrorHandler {
  public static handle(error: any): void {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorCode = error.response?.data?.error;
      
      switch (status) {
        case 401:
          if (errorCode === 'token_expired') {
            vscode.window.showErrorMessage(
              'Session expired. Please log in again.',
              'Log In'
            ).then((action) => {
              if (action === 'Log In') {
                vscode.commands.executeCommand('recoder.login');
              }
            });
          } else {
            vscode.window.showErrorMessage(
              'Authentication failed. Please log in.',
              'Log In'
            );
          }
          break;
          
        case 429:
          vscode.window.showErrorMessage(
            'Quota exceeded. Upgrade your plan or wait for reset.',
            'View Plans'
          ).then((action) => {
            if (action === 'View Plans') {
              vscode.env.openExternal(
                vscode.Uri.parse('https://recoder.xyz/pricing')
              );
            }
          });
          break;
          
        case 403:
          if (errorCode === 'api_key_missing') {
            vscode.window.showErrorMessage(
              'OpenRouter API key required for free tier.',
              'Add API Key'
            ).then((action) => {
              if (action === 'Add API Key') {
                vscode.commands.executeCommand('recoder.addApiKey');
              }
            });
          }
          break;
          
        default:
          vscode.window.showErrorMessage(
            `Request failed: ${error.message}`
          );
      }
    } else {
      vscode.window.showErrorMessage(
        `Unexpected error: ${error.message}`
      );
    }
  }
}
```

---

## 🧪 Testing

### Test Authentication Flow

```typescript
// test/auth.test.ts

import { AuthManager } from '../src/auth/AuthManager';
import { WebOAuthFlow } from '../src/auth/WebOAuthFlow';

describe('Authentication', () => {
  test('Web OAuth flow completes successfully', async () => {
    const webOAuth = new WebOAuthFlow();
    
    // Mock server response
    const mockAuthData = {
      accessToken: 'rct_test_token',
      refreshToken: 'rcr_test_token',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user: {
        id: 'usr_test',
        email: 'test@example.com',
        name: 'Test User',
        subscription_plan: 'free'
      }
    };
    
    // Test successful authentication
    // (In real test, mock axios calls)
    expect(mockAuthData.accessToken).toBeTruthy();
    expect(mockAuthData.user.id).toBe('usr_test');
  });
  
  test('Token validation works', async () => {
    // Test token validation endpoint
    // (Mock axios calls)
  });
  
  test('API key collection for free users', async () => {
    // Test API key prompt and storage
  });
});
```

---

## 📝 Summary Checklist

### Implementation Checklist

- [ ] **Authentication Manager**
  - [ ] Token storage using VS Code secrets API
  - [ ] isAuthenticated() check
  - [ ] Token validation with server
  - [ ] Logout functionality

- [ ] **Web OAuth Flow**
  - [ ] Generate OAuth URL
  - [ ] Start local callback server
  - [ ] Open browser
  - [ ] Handle callback
  - [ ] Exchange code for tokens

- [ ] **Device Flow** 
  - [ ] Request device code
  - [ ] Display user code
  - [ ] Poll for authorization
  - [ ] Handle approval

- [ ] **API Key Management**
  - [ ] Check if user needs API key
  - [ ] Prompt for OpenRouter key
  - [ ] Save key to server (encrypted)
  - [ ] Retrieve key for requests

- [ ] **Usage Tracking**
  - [ ] Track each request
  - [ ] Check quota before requests
  - [ ] Show quota in status bar
  - [ ] Handle quota exceeded

- [ ] **Token Refresh**
  - [ ] Auto-refresh expiring tokens
  - [ ] Handle refresh failures
  - [ ] Prompt re-login if needed

- [ ] **Error Handling**
  - [ ] Handle network errors
  - [ ] Handle authentication errors
  - [ ] Handle quota errors
  - [ ] Show user-friendly messages

---

## 🎯 Key Points for AI Copilot

### Critical Implementation Details

1. **Always use HTTPS in production**: `https://recoder.xyz`
2. **Store tokens securely**: Use VS Code secrets API, never plain storage
3. **Validate tokens on startup**: Check with server, not just local check
4. **Handle free vs premium differently**:
   - Free: Prompt for API key immediately after auth
   - Premium: No API key prompt, use platform keys
5. **Track usage religiously**: Every request must be tracked
6. **Refresh tokens proactively**: Don't wait for 401 errors
7. **Handle errors gracefully**: Show actionable messages to users
8. **Test all flows**: Web OAuth, device flow, API key auth
9. **Respect quota limits**: Check before making requests
10. **Follow OAuth 2.0 standards**: Security is critical

### Payment Integration Note

**DODO Pay is a standard payment SDK** (not crypto-specific). It supports:
- Credit/debit cards
- Bank transfers  
- Multiple currencies
- International payments
- Subscription billing

Use alongside Paddle for comprehensive payment coverage.

---

## 📚 Additional Resources

- **recoder.xyz API Docs**: https://recoder.xyz/docs/api
- **OpenRouter Docs**: https://openrouter.ai/docs
- **OAuth 2.0 Device Flow**: https://oauth.net/2/device-flow/
- **VS Code Extension Auth**: https://code.visualstudio.com/api/references/vscode-api#authentication

---

**End of Guide** 🎉

This guide contains everything needed to implement recoder.xyz authentication in recoder-code. Follow the flows, use the code examples, and implement the checklist items for complete integration.
