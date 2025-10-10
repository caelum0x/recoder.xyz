# 🔐 Recoder-Code CLI Authentication Integration Guide

## Overview

This guide shows how to integrate the recoder.xyz authentication system with the `recoder-code` npm CLI package for seamless user authentication through the interactive chat.

---

## 🎯 User Experience Flow

```
User: /login
↓
CLI: "Opening browser for authentication..."
↓
Browser opens: https://recoder.xyz/api/auth/cli?client_id=recoder-cli&...
↓
User sees authorization page: "Authorize Recoder CLI"
↓
User clicks: "Authorize"
↓
CLI receives callback: "✅ Authenticated as user@email.com"
↓
CLI saves session: ~/.recoder/auth.json
↓
User: /generate "build a React app"
CLI: [uses authenticated session to track usage]
```

---

## 📦 Required Changes to recoder-code CLI

### 1. Install Dependencies

```bash
# In recoder-code package
npm install open nanoid node-fetch@2
```

### 2. Create Authentication Module

**File: `src/auth/index.ts`**

```typescript
import open from 'open';
import http from 'http';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const AUTH_BASE_URL = process.env.RECODER_AUTH_URL || 'https://recoder.xyz';
const CLI_CLIENT_ID = 'recoder-cli';
const AUTH_FILE_PATH = path.join(os.homedir(), '.recoder', 'auth.json');

interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  name: string;
  plan: string;
  expiresAt: string;
  needsApiKey: boolean;
}

/**
 * Handle /login command in interactive chat
 */
export async function handleLoginCommand(): Promise<void> {
  console.log('🔐 Opening browser for authentication...\n');

  try {
    const session = await authenticateWithBrowser();
    
    // Save session
    await saveSession(session);
    
    console.log('✅ Authenticated successfully!');
    console.log(`   User: ${session.email}`);
    console.log(`   Plan: ${session.plan}`);
    
    if (session.needsApiKey) {
      console.log('\n⚠️  Action Required:');
      console.log('   Free plan requires your OpenRouter API key.');
      console.log('   Visit: https://recoder.xyz/auth/onboarding?userId=' + session.userId);
      console.log('   Or upgrade to Pro at: https://recoder.xyz/pricing');
    }
    
    console.log('\nYou can now use all CLI features! 🚀\n');
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('  • Make sure your browser is open');
    console.log('  • Check your internet connection');
    console.log('  • Try again with: /login');
  }
}

/**
 * Authenticate user with browser OAuth flow
 */
async function authenticateWithBrowser(): Promise<AuthSession> {
  return new Promise((resolve, reject) => {
    const state = nanoid();
    const callbackPort = 8181;
    const redirectUri = `http://localhost:${callbackPort}/callback`;

    // Create local server to receive callback
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${callbackPort}`);
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #e74c3c;">❌ Authentication Failed</h1>
                <p>${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(error));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Invalid callback</h1></body></html>');
          server.close();
          reject(new Error('Invalid callback parameters'));
          return;
        }

        // Exchange code for tokens
        try {
          const tokenResponse = await fetch(`${AUTH_BASE_URL}/api/auth/cli`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'exchange_code',
              grant_type: 'authorization_code',
              client_id: CLI_CLIENT_ID,
              code: code,
              redirect_uri: redirectUri,
            }),
          });

          const tokenData = await tokenResponse.json();

          if (!tokenResponse.ok || !tokenData.success) {
            throw new Error(tokenData.error || 'Token exchange failed');
          }

          // Success response
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                  }
                  .container {
                    background: white;
                    border-radius: 20px;
                    padding: 50px;
                    text-align: center;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.2);
                    max-width: 500px;
                  }
                  .success-icon {
                    width: 80px;
                    height: 80px;
                    background: #10b981;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    font-size: 40px;
                  }
                  h1 { color: #1f2937; margin-bottom: 10px; }
                  p { color: #6b7280; font-size: 18px; margin-bottom: 30px; }
                  .close-button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 15px 40px;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="success-icon">✅</div>
                  <h1>Authentication Successful!</h1>
                  <p>You can now close this window and return to your terminal.</p>
                  <button class="close-button" onclick="window.close()">Close Window</button>
                </div>
                <script>setTimeout(() => window.close(), 3000);</script>
              </body>
            </html>
          `);

          server.close();

          const session: AuthSession = {
            userId: tokenData.user_id || tokenData.user?.id,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            email: tokenData.user?.email || 'user@recoder.xyz',
            name: tokenData.user?.name || 'User',
            plan: tokenData.user?.subscription_plan || 'free',
            expiresAt: tokenData.expires_at,
            needsApiKey: tokenData.user?.apiKeyStatus?.requiresApiKey || false,
          };

          resolve(session);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authentication error</h1></body></html>');
          server.close();
          reject(error);
        }
      }
    });

    server.listen(callbackPort, () => {
      // Open browser to auth page
      const authUrl = `${AUTH_BASE_URL}/api/auth/cli?` + new URLSearchParams({
        response_type: 'code',
        client_id: CLI_CLIENT_ID,
        redirect_uri: redirectUri,
        state: state,
        scope: 'cli:full profile',
      }).toString();

      open(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Save authentication session to disk
 */
async function saveSession(session: AuthSession): Promise<void> {
  await fs.ensureDir(path.dirname(AUTH_FILE_PATH));
  await fs.writeJson(AUTH_FILE_PATH, session, { spaces: 2 });
}

/**
 * Load authentication session from disk
 */
export async function loadSession(): Promise<AuthSession | null> {
  try {
    if (await fs.pathExists(AUTH_FILE_PATH)) {
      const session = await fs.readJson(AUTH_FILE_PATH);
      
      // Check if expired
      if (new Date(session.expiresAt) < new Date()) {
        // Try to refresh
        const refreshed = await refreshSession(session.refreshToken);
        if (refreshed) {
          await saveSession(refreshed);
          return refreshed;
        }
        return null;
      }
      
      return session;
    }
  } catch (error) {
    console.error('Failed to load session:', error);
  }
  return null;
}

/**
 * Refresh expired session
 */
async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/auth/cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLI_CLIENT_ID,
      }),
    });

    const data = await response.json();
    
    if (data.success) {
      return {
        userId: data.user_id || data.user?.id,
        accessToken: data.access_token,
        refreshToken: refreshToken,
        email: data.user?.email,
        name: data.user?.name,
        plan: data.user?.subscription_plan,
        expiresAt: data.expires_at,
        needsApiKey: data.user?.apiKeyStatus?.requiresApiKey || false,
      };
    }
  } catch (error) {
    console.error('Failed to refresh session:', error);
  }
  return null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await loadSession();
  return session !== null;
}

/**
 * Get current user session
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  return loadSession();
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  if (await fs.pathExists(AUTH_FILE_PATH)) {
    await fs.remove(AUTH_FILE_PATH);
  }
  console.log('✅ Logged out successfully');
}

/**
 * Check quota before making request
 */
export async function checkQuota(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  message?: string;
}> {
  const session = await loadSession();
  
  if (!session) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      message: 'Not authenticated. Run /login to authenticate.',
    };
  }

  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/user/quota?userId=${session.userId}`);
    const data = await response.json();

    if (data.quota) {
      return {
        allowed: data.quota.allowed,
        remaining: data.quota.remaining,
        limit: data.quota.limit,
        message: data.quota.reason,
      };
    }
  } catch (error) {
    console.error('Failed to check quota:', error);
  }

  return {
    allowed: true,
    remaining: -1,
    limit: -1,
  };
}

/**
 * Track usage after request
 */
export async function trackUsage(metadata: {
  modelUsed?: string;
  tokensUsed?: number;
  cost?: number;
  duration?: number;
  success?: boolean;
}): Promise<void> {
  const session = await loadSession();
  
  if (!session) return;

  try {
    await fetch(`${AUTH_BASE_URL}/api/usage/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.userId,
        sessionId: session.accessToken.substring(0, 16),
        requestType: 'cli',
        ...metadata,
      }),
    });
  } catch (error) {
    // Silent fail - don't block user experience
    console.debug('Failed to track usage:', error);
  }
}
```

---

## 3. Integrate with Interactive Chat

**File: `src/chat/commands.ts`**

```typescript
import { handleLoginCommand, logout, checkQuota, getCurrentSession } from '../auth';

export async function handleCommand(command: string, args: string[]): Promise<void> {
  switch (command) {
    case '/login':
      await handleLoginCommand();
      break;

    case '/logout':
      await logout();
      break;

    case '/status':
      await showStatus();
      break;

    case '/quota':
      await showQuota();
      break;

    case '/help':
      showHelp();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Type /help for available commands');
  }
}

async function showStatus(): Promise<void> {
  const session = await getCurrentSession();
  
  if (!session) {
    console.log('❌ Not authenticated');
    console.log('   Run /login to authenticate');
    return;
  }

  console.log('✅ Authenticated');
  console.log(`   User: ${session.email}`);
  console.log(`   Plan: ${session.plan}`);
  console.log(`   Expires: ${new Date(session.expiresAt).toLocaleDateString()}`);
  
  if (session.needsApiKey) {
    console.log('\n⚠️  OpenRouter API key required');
    console.log('   Visit: https://recoder.xyz/auth/onboarding');
  }
}

async function showQuota(): Promise<void> {
  const quota = await checkQuota();
  
  if (!quota.allowed && quota.remaining === 0 && quota.limit === 0) {
    console.log(quota.message);
    return;
  }

  console.log('📊 Usage Quota:');
  console.log(`   Used: ${quota.limit - quota.remaining} / ${quota.limit}`);
  console.log(`   Remaining: ${quota.remaining}`);
  
  const percentage = ((quota.limit - quota.remaining) / quota.limit) * 100;
  console.log(`   Usage: ${percentage.toFixed(1)}%`);
  
  if (percentage > 80) {
    console.log('\n⚠️  Approaching quota limit!');
    console.log('   Upgrade at: https://recoder.xyz/pricing');
  }
}

function showHelp(): void {
  console.log('\n📚 Available Commands:\n');
  console.log('  /login     - Authenticate with recoder.xyz');
  console.log('  /logout    - Sign out');
  console.log('  /status    - Show authentication status');
  console.log('  /quota     - Check usage quota');
  console.log('  /help      - Show this help message');
  console.log('\n💡 Tips:');
  console.log('  - Use /login before making requests');
  console.log('  - Check /quota to see remaining requests');
  console.log('  - Upgrade to Pro for higher limits\n');
}
```

---

## 4. Add Pre-Request Quota Check

**File: `src/generate/index.ts`**

```typescript
import { checkQuota, trackUsage, isAuthenticated } from '../auth';

export async function generateCode(prompt: string): Promise<void> {
  // Check authentication
  if (!await isAuthenticated()) {
    console.log('❌ Not authenticated');
    console.log('   Run /login to authenticate with recoder.xyz');
    return;
  }

  // Check quota
  const quota = await checkQuota();
  if (!quota.allowed) {
    console.log('❌ Quota exceeded');
    console.log(`   ${quota.message}`);
    console.log('\n💡 Upgrade to continue:');
    console.log('   Visit: https://recoder.xyz/pricing');
    return;
  }

  // Show remaining quota if low
  if (quota.remaining > 0 && quota.remaining < 100) {
    console.log(`⚠️  ${quota.remaining} requests remaining this month\n`);
  }

  const startTime = Date.now();
  
  try {
    // Generate code (your existing logic)
    console.log('🚀 Generating code...');
    
    // ... your generation code ...
    
    const tokensUsed = 1500; // Calculate actual tokens
    const cost = 0.045; // Calculate actual cost
    const duration = Date.now() - startTime;

    // Track usage
    await trackUsage({
      modelUsed: 'claude-3-sonnet',
      tokensUsed,
      cost,
      duration,
      success: true,
    });

    console.log('✅ Code generated successfully!');
    console.log(`   Remaining: ${quota.remaining - 1} / ${quota.limit}\n`);
    
  } catch (error) {
    // Track failed request
    await trackUsage({
      duration: Date.now() - startTime,
      success: false,
    });
    
    throw error;
  }
}
```

---

## 5. Update Main CLI Entry Point

**File: `src/index.ts`**

```typescript
import { handleCommand } from './chat/commands';
import { isAuthenticated } from './auth';

async function main() {
  console.log('🚀 Recoder CLI v1.0.0\n');

  // Check if authenticated
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    console.log('👋 Welcome to Recoder!');
    console.log('   Please authenticate to get started.');
    console.log('   Run: /login\n');
  }

  // Start interactive chat
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: authenticated ? '> ' : '(not authenticated) > ',
  });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('/')) {
      // Handle command
      const [command, ...args] = trimmed.split(' ');
      await handleCommand(command, args);
    } else if (trimmed) {
      // Handle regular chat/generation
      if (!authenticated) {
        console.log('❌ Please authenticate first: /login');
      } else {
        // Process user input
        await processInput(trimmed);
      }
    }
    
    rl.prompt();
  });

  rl.prompt();
}

main();
```

---

## 6. Package.json Updates

**File: `package.json`**

```json
{
  "name": "recoder-code",
  "version": "1.0.0",
  "description": "AI-powered development CLI with authentication",
  "bin": {
    "recoder": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "prepublish": "npm run build"
  },
  "dependencies": {
    "open": "^8.4.0",
    "nanoid": "^3.3.4",
    "node-fetch": "^2.6.7",
    "fs-extra": "^11.1.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@types/node-fetch": "^2.6.2",
    "@types/fs-extra": "^11.0.1",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.1"
  }
}
```

---

## 7. Environment Variables

**File: `.env` (optional)**

```bash
# For development
RECODER_AUTH_URL=http://localhost:3002

# For production (default)
RECODER_AUTH_URL=https://recoder.xyz
```

---

## 🧪 Testing the Integration

### Test Locally

```bash
# 1. Start recoder.xyz dev server
cd /Users/arhansubasi/recoder.xyz/app
npm run dev

# 2. In recoder-code package
cd recoder-code
npm run dev

# 3. Test authentication
> /login
# Browser opens, authorize, CLI shows success

# 4. Test commands
> /status
> /quota

# 5. Test generation
> /generate "build a React app"
```

### Test Flow

```typescript
// In recoder-code package
npm run dev

// CLI starts:
🚀 Recoder CLI v1.0.0

👋 Welcome to Recoder!
   Please authenticate to get started.
   Run: /login

(not authenticated) > /login

🔐 Opening browser for authentication...
// Browser opens to recoder.xyz

// User authorizes in browser
// CLI receives callback:

✅ Authenticated successfully!
   User: user@example.com
   Plan: free

⚠️  Action Required:
   Free plan requires your OpenRouter API key.
   Visit: https://recoder.xyz/auth/onboarding?userId=xxx

You can now use all CLI features! 🚀

> /status
✅ Authenticated
   User: user@example.com
   Plan: free
   Expires: 12/31/2024

> /quota
📊 Usage Quota:
   Used: 0 / 1000
   Remaining: 1000
   Usage: 0.0%

> /generate "build a React app"
🚀 Generating code...
✅ Code generated successfully!
   Remaining: 999 / 1000
```

---

## 📊 Usage Flow Diagram

```
┌─────────────────────────────────────────┐
│  User in Interactive CLI                 │
└─────────────────────────────────────────┘
                  ↓
         User types: /login
                  ↓
┌─────────────────────────────────────────┐
│  CLI: Start local HTTP server (8181)    │
│  CLI: Generate state & redirect URI     │
└─────────────────────────────────────────┘
                  ↓
         Open browser to:
    recoder.xyz/api/auth/cli?...
                  ↓
┌─────────────────────────────────────────┐
│  Browser: User sees auth page           │
│  User clicks "Authorize"                 │
└─────────────────────────────────────────┘
                  ↓
    Redirect to: localhost:8181/callback?code=xxx
                  ↓
┌─────────────────────────────────────────┐
│  CLI: Receives callback                  │
│  CLI: Exchange code for tokens           │
│  CLI: Save to ~/.recoder/auth.json      │
└─────────────────────────────────────────┘
                  ↓
         CLI shows: ✅ Authenticated!
                  ↓
┌─────────────────────────────────────────┐
│  User types: /generate "app"             │
│  CLI: Check quota (GET /api/user/quota) │
│  CLI: Generate code                      │
│  CLI: Track usage (POST /api/usage/track)│
└─────────────────────────────────────────┘
```

---

## 🔐 Security Considerations

### Session Storage
- ✅ Tokens stored in `~/.recoder/auth.json`
- ✅ File permissions: 600 (user-only)
- ✅ Contains access token, refresh token, user info
- ✅ Automatically refreshes expired tokens

### OAuth Flow
- ✅ Uses state parameter for CSRF protection
- ✅ Authorization code flow (most secure)
- ✅ Short-lived authorization codes (10 minutes)
- ✅ Long-lived access tokens (30 days)

### API Communication
- ✅ Always uses HTTPS in production
- ✅ Tokens sent in request body (not URL)
- ✅ Silent failure for tracking (doesn't block UX)

---

## 📚 Additional Commands

Users can also use these commands in the CLI:

```bash
/login          # Authenticate
/logout         # Sign out
/status         # Show auth status
/quota          # Check remaining requests
/upgrade        # Open upgrade page
/apikey         # Open API key settings
/help           # Show all commands
```

---

## 🚀 Publishing to NPM

```bash
# 1. Build
npm run build

# 2. Test locally
npm link
recoder

# 3. Publish
npm publish

# 4. Users install
npm install -g recoder-code

# 5. Users run
recoder
> /login
```

---

## ✅ Integration Checklist

- [ ] Add auth module to recoder-code
- [ ] Integrate with interactive chat
- [ ] Add /login, /logout, /status commands
- [ ] Add quota checking before requests
- [ ] Add usage tracking after requests
- [ ] Handle authentication errors gracefully
- [ ] Test full flow locally
- [ ] Test with production recoder.xyz
- [ ] Update CLI documentation
- [ ] Publish to npm

---

## 🎉 Result

Users get a seamless authentication experience:
1. Run `/login` in CLI
2. Browser opens automatically
3. Authorize once
4. Session persists for 30 days
5. All requests tracked and limited
6. Automatic token refresh
7. Clean error messages

**Total user friction: ~10 seconds for first-time authentication!**

---

This integration provides the exact flow you described while maintaining security and tracking all usage properly.
