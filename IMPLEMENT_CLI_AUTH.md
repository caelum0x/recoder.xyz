# Implementation Checklist: CLI Authentication for recoder.xyz

## 🎯 Goal
Enable users to authenticate from the `recoder` CLI package to your recoder.xyz website so they can use their account, quota, and subscription from the terminal.

---

## ✅ What You Already Have (CLI Side)

Your CLI package is **100% ready** with these files:

### Core Authentication Service
- ✅ `/packages/cli/src/services/auth-service.ts` - Complete authentication service
  - Web OAuth flow
  - Device authorization flow  
  - API key authentication
  - Token refresh logic
  - Session storage & validation

### CLI Commands
- ✅ `/packages/cli/src/commands/auth.ts` - Full command suite
  - `recoder auth login` (multiple methods)
  - `recoder auth register`
  - `recoder auth status`
  - `recoder auth logout`
  - `recoder auth sessions` (session management)
  - `recoder auth keys` (API key management)
  - `recoder auth upgrade` (subscription)
  - `recoder auth usage` (analytics)

### Infrastructure
- ✅ Session storage: `~/.recoder/auth.json`
- ✅ Secure file permissions (0600)
- ✅ Token refresh on expiration
- ✅ Rate limiting awareness
- ✅ Cross-platform session sync

---

## 🔨 What You Need to Build (Website Side)

### Priority 1: Core API Endpoints (CRITICAL - Week 1)

#### 1.1 Main CLI Authentication Endpoint
**File:** `/app/api/auth/cli/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'exchange_code':
      return await handleCodeExchange(body);
    
    case 'device_flow':
      return await handleDeviceFlowInit(body);
    
    case 'device_token':
      return await handleDeviceTokenPoll(body);
    
    case 'validate_token':
      return await handleTokenValidation(body);
    
    case 'refresh_token':
      return await handleTokenRefresh(body);
    
    case 'revoke_token':
      return await handleTokenRevocation(body);
    
    default:
      return NextResponse.json(
        { success: false, error: 'Unknown action' },
        { status: 400 }
      );
  }
}

export async function GET(request: NextRequest) {
  // OAuth authorization flow
  return await handleOAuthAuthorization(request);
}
```

**Action Items:**
- [ ] Create `/app/api/auth/cli/route.ts`
- [ ] Implement `handleCodeExchange()` function
- [ ] Implement `handleDeviceFlowInit()` function
- [ ] Implement `handleDeviceTokenPoll()` function
- [ ] Implement `handleTokenValidation()` function
- [ ] Implement `handleTokenRefresh()` function
- [ ] Implement `handleTokenRevocation()` function
- [ ] Implement `handleOAuthAuthorization()` function

---

#### 1.2 OAuth Authorization Page
**File:** `/app/app/auth/cli/page.tsx`

Create a page where users authorize the CLI to access their account.

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function CLIAuthorizationPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [authorizing, setAuthorizing] = useState(false);

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope');

  const handleAuthorize = async () => {
    setAuthorizing(true);
    
    // Generate authorization code
    const response = await fetch('/api/auth/cli/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope
      })
    });

    const { code } = await response.json();

    // Redirect back to CLI
    const redirectUrl = new URL(redirectUri!);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', state!);
    
    window.location.href = redirectUrl.toString();
  };

  if (!session) {
    // Redirect to sign in
    return window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`;
  }

  return (
    <div className="container max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Authorize CLI Access</h1>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <p className="text-sm text-gray-600 mb-2">Logged in as:</p>
        <p className="font-semibold">{session.user.email}</p>
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">Recoder CLI wants to:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Access your account information</li>
          <li>Generate code using your quota</li>
          <li>Manage your projects</li>
          <li>Use AI models on your behalf</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => window.close()}
          className="flex-1 px-4 py-2 border border-gray-300 rounded"
        >
          Deny
        </button>
        <button
          onClick={handleAuthorize}
          disabled={authorizing}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {authorizing ? 'Authorizing...' : 'Authorize'}
        </button>
      </div>
    </div>
  );
}
```

**Action Items:**
- [ ] Create `/app/app/auth/cli/page.tsx`
- [ ] Style the authorization page
- [ ] Add error handling
- [ ] Test OAuth flow end-to-end

---

#### 1.3 Device Authorization Page
**File:** `/app/app/device/page.tsx`

Page where users enter the device code from their terminal.

```tsx
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

export default function DeviceAuthorizationPage() {
  const { data: session } = useSession();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/device/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code.toUpperCase() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent('/device')}`;
  }

  if (success) {
    return (
      <div className="container max-w-md mx-auto p-8 text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Device Authorized!</h1>
        <p className="text-gray-600 mb-4">You can now return to your terminal</p>
        <p className="text-sm text-gray-500">This window can be closed</p>
      </div>
    );
  }

  return (
    <div className="container max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Device Authorization</h1>
      
      <div className="bg-gray-100 p-4 rounded mb-6">
        <p className="text-sm text-gray-600 mb-2">Logged in as:</p>
        <p className="font-semibold">{session.user.email}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="block mb-4">
          <span className="text-sm font-medium">Enter the code shown in your terminal:</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            maxLength={9}
            className="mt-2 w-full px-4 py-3 text-center text-2xl font-mono border rounded"
            autoFocus
          />
        </label>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || code.length < 8}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Authorizing...' : 'Authorize Device'}
        </button>
      </form>

      <div className="mt-6 text-sm text-gray-500">
        <p className="font-medium mb-2">This will allow the CLI to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Access your account</li>
          <li>Generate code</li>
          <li>Use your quota</li>
        </ul>
      </div>
    </div>
  );
}
```

**Action Items:**
- [ ] Create `/app/app/device/page.tsx`
- [ ] Create API endpoint `/app/api/auth/device/authorize/route.ts`
- [ ] Style the device authorization page
- [ ] Add code validation
- [ ] Test device flow end-to-end

---

### Priority 2: Database Schema (Week 1)

#### 2.1 Add to Prisma Schema

**File:** `prisma/schema.prisma` (or wherever your schema is)

```prisma
// OAuth Authorization Codes (temporary, 10 min expiration)
model AuthCode {
  id           String   @id @default(cuid())
  code         String   @unique
  userId       String
  clientId     String
  redirectUri  String?
  scope        String?
  expiresAt    DateTime
  used         Boolean  @default(false)
  createdAt    DateTime @default(now())
  
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([code])
  @@index([userId])
}

// Device Flow Codes (temporary, 15 min expiration)
model DeviceCode {
  id           String   @id @default(cuid())
  deviceCode   String   @unique
  userCode     String   @unique
  userId       String?
  clientId     String
  scope        String?
  expiresAt    DateTime
  status       String   @default("pending") // pending, approved, denied, expired
  createdAt    DateTime @default(now())
  
  user         User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([deviceCode])
  @@index([userCode])
  @@index([userId])
}

// API Keys (long-lived, manually revoked)
model ApiKey {
  id           String    @id @default(cuid())
  userId       String
  keyId        String    @unique
  keyHash      String    // bcrypt hash of the key
  name         String?
  scopes       String[]
  lastUsedAt   DateTime?
  createdAt    DateTime  @default(now())
  revoked      Boolean   @default(false)
  revokedAt    DateTime?
  
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([keyId])
  @@index([userId])
}

// CLI/Platform Sessions
model Session {
  id           String    @id @default(cuid())
  userId       String
  deviceId     String?
  platform     String    // cli, web, extension, router, mobile
  accessToken  String    @unique
  refreshToken String?   @unique
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  lastUsedAt   DateTime  @default(now())
  revoked      Boolean   @default(false)
  
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([accessToken])
  @@index([refreshToken])
  @@index([userId])
  @@index([deviceId])
}

// Update User model to add relations
model User {
  // ... existing fields ...
  
  authCodes    AuthCode[]
  deviceCodes  DeviceCode[]
  apiKeys      ApiKey[]
  sessions     Session[]
}
```

**Action Items:**
- [ ] Add tables to Prisma schema
- [ ] Run `prisma migrate dev --name add_cli_auth`
- [ ] Generate Prisma client: `prisma generate`
- [ ] Test database connection

---

### Priority 3: Helper Functions (Week 2)

Create utility functions for common auth operations.

#### 3.1 Auth Code Management
**File:** `/app/lib/auth/auth-codes.ts`

```typescript
import { prisma } from '@/lib/database';
import crypto from 'crypto';

export async function generateAuthCode(
  userId: string,
  clientId: string,
  redirectUri: string,
  scope: string
): Promise<string> {
  // Generate secure random code
  const code = crypto.randomBytes(32).toString('base64url');
  
  // Store in database (expires in 10 minutes)
  await prisma.authCode.create({
    data: {
      code,
      userId,
      clientId,
      redirectUri,
      scope,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });
  
  return code;
}

export async function validateAuthCode(code: string) {
  const authCode = await prisma.authCode.findUnique({
    where: { code },
    include: { user: true }
  });
  
  if (!authCode) return null;
  if (authCode.used) return null;
  if (authCode.expiresAt < new Date()) return null;
  
  // Mark as used
  await prisma.authCode.update({
    where: { code },
    data: { used: true }
  });
  
  return authCode;
}
```

**Action Items:**
- [ ] Create `/app/lib/auth/auth-codes.ts`
- [ ] Implement `generateAuthCode()`
- [ ] Implement `validateAuthCode()`
- [ ] Add cleanup job for expired codes

---

#### 3.2 Device Flow Management
**File:** `/app/lib/auth/device-flow.ts`

```typescript
import { prisma } from '@/lib/database';
import crypto from 'crypto';

export async function generateDeviceCode(clientId: string, scope: string) {
  const deviceCode = crypto.randomBytes(32).toString('base64url');
  const userCode = generateUserCode(); // e.g., "WXYZ-5678"
  
  await prisma.deviceCode.create({
    data: {
      deviceCode,
      userCode,
      clientId,
      scope,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      status: 'pending'
    }
  });
  
  return { deviceCode, userCode };
}

export async function authorizeDevice(userCode: string, userId: string) {
  const device = await prisma.deviceCode.findUnique({
    where: { userCode: userCode.toUpperCase() }
  });
  
  if (!device) throw new Error('Invalid code');
  if (device.expiresAt < new Date()) throw new Error('Code expired');
  if (device.status !== 'pending') throw new Error('Code already used');
  
  await prisma.deviceCode.update({
    where: { userCode: userCode.toUpperCase() },
    data: {
      userId,
      status: 'approved'
    }
  });
  
  return device;
}

export async function pollDeviceCode(deviceCode: string) {
  const device = await prisma.deviceCode.findUnique({
    where: { deviceCode },
    include: { user: true }
  });
  
  if (!device) return { status: 'expired' };
  if (device.expiresAt < new Date()) return { status: 'expired' };
  if (device.status === 'denied') return { status: 'denied' };
  if (device.status === 'pending') return { status: 'pending' };
  
  // Approved!
  return {
    status: 'approved',
    userId: device.userId,
    user: device.user
  };
}

function generateUserCode(): string {
  // Generate 8-character code like "WXYZ-5678"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
```

**Action Items:**
- [ ] Create `/app/lib/auth/device-flow.ts`
- [ ] Implement device code generation
- [ ] Implement device authorization
- [ ] Implement polling logic
- [ ] Add cleanup job for expired codes

---

#### 3.3 API Key Management
**File:** `/app/lib/auth/api-keys.ts`

```typescript
import { prisma } from '@/lib/database';
import { hash, compare } from 'bcryptjs';
import crypto from 'crypto';

export async function generateApiKey(
  userId: string,
  name: string,
  scopes: string[]
): Promise<{ keyId: string; apiKey: string }> {
  const keyId = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  
  // Format: rcli_{userId_short}_{timestamp}_{random}_{checksum}
  const userIdShort = userId.substring(0, 8);
  const apiKey = `rcli_${userIdShort}_${timestamp}_${random}`;
  
  // Add checksum
  const checksum = crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .substring(0, 8);
  
  const fullApiKey = `${apiKey}_${checksum}`;
  
  // Hash for storage
  const keyHash = await hash(fullApiKey, 10);
  
  await prisma.apiKey.create({
    data: {
      userId,
      keyId,
      keyHash,
      name,
      scopes
    }
  });
  
  return { keyId, apiKey: fullApiKey };
}

export async function validateApiKey(apiKey: string) {
  // Parse format
  const parts = apiKey.split('_');
  if (parts.length !== 5) return { valid: false };
  
  const [prefix, userIdShort, timestamp, random, checksum] = parts;
  
  // Verify checksum
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(`${prefix}_${userIdShort}_${timestamp}_${random}`)
    .digest('hex')
    .substring(0, 8);
  
  if (checksum !== expectedChecksum) return { valid: false };
  
  // Find matching API key in database
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      revoked: false,
      user: { id: { startsWith: userIdShort } }
    },
    include: { user: true }
  });
  
  for (const key of apiKeys) {
    const isMatch = await compare(apiKey, key.keyHash);
    if (isMatch) {
      // Update last used
      await prisma.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() }
      });
      
      return {
        valid: true,
        userId: key.userId,
        keyId: key.keyId,
        scopes: key.scopes,
        user: key.user
      };
    }
  }
  
  return { valid: false };
}

export async function revokeApiKey(keyId: string, userId: string) {
  await prisma.apiKey.update({
    where: { keyId, userId },
    data: {
      revoked: true,
      revokedAt: new Date()
    }
  });
}
```

**Action Items:**
- [ ] Create `/app/lib/auth/api-keys.ts`
- [ ] Implement API key generation
- [ ] Implement API key validation
- [ ] Implement API key revocation
- [ ] Add API key list endpoint

---

#### 3.4 Token Management
**File:** `/app/lib/auth/tokens.ts`

```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@/lib/database';

const JWT_SECRET = process.env.NEXTAUTH_SECRET!;

export async function generateTokens(userId: string, clientId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access', clientId },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh', clientId },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
  
  // Store session
  const deviceId = crypto.randomBytes(16).toString('hex');
  await prisma.session.create({
    data: {
      userId,
      deviceId,
      platform: 'cli',
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

export async function refreshTokens(refreshToken: string, clientId: string) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    // Check if session exists and not revoked
    const session = await prisma.session.findUnique({
      where: { refreshToken }
    });
    
    if (!session || session.revoked) {
      throw new Error('Session revoked');
    }
    
    // Generate new tokens
    const newTokens = await generateTokens(decoded.userId, clientId);
    
    // Revoke old session
    await prisma.session.update({
      where: { refreshToken },
      data: { revoked: true }
    });
    
    return newTokens;
  } catch (error) {
    return null;
  }
}

export async function revokeToken(token: string) {
  await prisma.session.updateMany({
    where: {
      OR: [
        { accessToken: token },
        { refreshToken: token }
      ]
    },
    data: { revoked: true }
  });
}
```

**Action Items:**
- [ ] Create `/app/lib/auth/tokens.ts`
- [ ] Implement token generation
- [ ] Implement token refresh
- [ ] Implement token revocation
- [ ] Add JWT validation

---

### Priority 4: API Key Management UI (Week 3)

**File:** `/app/app/settings/api-keys/page.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function ApiKeysPage() {
  const { data: session } = useSession();
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    const response = await fetch('/api/auth/keys');
    const data = await response.json();
    setApiKeys(data.keys);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('/api/auth/keys/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newKeyName,
        scopes: ['cli:full', 'profile']
      })
    });

    const data = await response.json();
    setGeneratedKey(data.apiKey);
    setNewKeyName('');
    fetchApiKeys();
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    
    await fetch('/api/auth/keys/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId })
    });

    fetchApiKeys();
  };

  return (
    <div className="container max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">API Keys</h1>

      {generatedKey && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded">
          <p className="font-bold mb-2">⚠️ Save this key - it won't be shown again!</p>
          <code className="block p-2 bg-white rounded text-sm break-all">
            {generatedKey}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(generatedKey)}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Generate New Key</h2>
        <form onSubmit={handleGenerate} className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., Production Server)"
            className="flex-1 px-4 py-2 border rounded"
            required
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Generate
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your API Keys</h2>
        {apiKeys.length === 0 ? (
          <p className="text-gray-500">No API keys yet</p>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key: any) => (
              <div key={key.keyId} className="border rounded p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{key.name || 'Unnamed'}</p>
                  <p className="text-sm text-gray-500">
                    Key ID: {key.keyId}
                  </p>
                  <p className="text-sm text-gray-500">
                    Created: {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                  {key.lastUsedAt && (
                    <p className="text-sm text-gray-500">
                      Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRevoke(key.keyId)}
                  className="px-4 py-2 text-red-600 border border-red-600 rounded hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Action Items:**
- [ ] Create API key management page
- [ ] Create `/api/auth/keys/route.ts` (list keys)
- [ ] Create `/api/auth/keys/generate/route.ts`
- [ ] Create `/api/auth/keys/revoke/route.ts`
- [ ] Test key generation and revocation

---

## ✅ Testing Checklist

### Test Web OAuth Flow
```bash
# 1. Start your website
npm run dev

# 2. In another terminal, test CLI
cd packages/cli
recoder auth login --web

# Expected:
# - Browser opens to recoder.xyz/auth/cli
# - User signs in
# - Redirects to localhost:8080
# - CLI shows success message
```

### Test Device Flow
```bash
recoder auth login --device-flow

# Expected:
# - Shows device code (e.g., WXYZ-5678)
# - Shows URL: recoder.xyz/device
# - User enters code on website
# - CLI receives token after approval
```

### Test API Key
```bash
# 1. Generate key on website
open https://recoder.xyz/settings/api-keys

# 2. Copy generated key

# 3. Test in CLI
recoder auth login --api-key rcli_...

# Expected:
# - CLI validates key
# - Shows user info
# - Ready to use
```

### Test Session Management
```bash
# View status
recoder auth status

# View sessions
recoder auth sessions --list

# Revoke session
recoder auth sessions --revoke <deviceId>

# Logout
recoder auth logout
```

---

## 🚀 Quick Start Implementation (3-Day Plan)

### Day 1: Core OAuth
1. ✅ Create `/app/api/auth/cli/route.ts` with basic structure
2. ✅ Implement code exchange (`handleCodeExchange`)
3. ✅ Create authorization page `/app/app/auth/cli/page.tsx`
4. ✅ Test: `recoder auth login --web`

### Day 2: Device Flow
1. ✅ Implement device flow initiation
2. ✅ Create device authorization page `/app/app/device/page.tsx`
3. ✅ Implement polling logic
4. ✅ Test: `recoder auth login --device-flow`

### Day 3: API Keys
1. ✅ Implement API key validation
2. ✅ Create API key management UI
3. ✅ Test key generation and usage
4. ✅ Test: `recoder auth login --api-key`

---

## 📞 Support

If you need help implementing any of these:
1. Check existing implementations in `/lib/auth.ts` and `/lib/api-auth.ts`
2. Reference NextAuth.js docs: https://next-auth.js.org/
3. OAuth 2.0 Device Flow spec: RFC 8628

Your CLI is **ready to go** - you just need the website endpoints! 🚀
