# Authentication Loop Issue - Complete Diagnosis & Solution

## 🔴 PROBLEM STATEMENT

**User Flow Issue:**
1. User logs in at `recoder.xyz` ✅ (works)
2. User clicks "Open Web IDE" → redirects to `/platform/web` ✅ (works)
3. `/platform/web` redirects to `web.recoder.xyz` with token ✅ (works)
4. `web.recoder.xyz` receives token but **REDIRECTS BACK TO DASHBOARD** ❌ (broken)
5. User stuck in loop - cannot access Web IDE

## 🔍 ROOT CAUSE ANALYSIS

### Architecture Overview
```
recoder.xyz (app/)           →  web.recoder.xyz (recoder-web/)
├─ Next.js 15                   ├─ Remix (Cloudflare)
├─ Better-auth                  ├─ No auth middleware
├─ PostgreSQL (Neon)            ├─ IndexedDB (local)
└─ Session management           └─ No session validation
```

### The Problem

**Missing Authentication Bridge:**
- `recoder.xyz` generates token and redirects to `web.recoder.xyz?token=xxx`
- `web.recoder.xyz` receives token but has **NO MIDDLEWARE** to:
  1. Validate the token
  2. Create a session
  3. Store authentication state
  4. Allow access to the IDE

**Current Behavior:**
```typescript
// recoder-web/app/routes/_index.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  // ❌ NO TOKEN VALIDATION
  // ❌ NO AUTH CHECK
  // Just loads the chat interface
}
```

**Result:** User lands on `web.recoder.xyz` but without valid session, gets redirected back.

## ✅ COMPLETE SOLUTION

### Phase 1: Main App Token Generation (recoder.xyz)

**File: `app/app/api/auth/verify-token/route.ts`** (NEW)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    // Verify token using better-auth
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token}` }
    });

    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
```

### Phase 2: Web IDE Token Reception (web.recoder.xyz)

**File: `recoder-web/app/routes/_index.tsx`** (UPDATE)
```typescript
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const from = url.searchParams.get('from');
  
  // ✅ Handle auth token from main app
  if (token && from === 'main-site') {
    try {
      const verifyUrl = process.env.NODE_ENV === 'production'
        ? 'https://recoder.xyz/api/auth/verify-token'
        : 'http://localhost:3000/api/auth/verify-token';
        
      const verifyResponse = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (verifyResponse.ok) {
        const userData = await verifyResponse.json();
        
        // Store user data in session
        const sessionData = {
          userId: userData.user.id,
          email: userData.user.email,
          name: userData.user.name,
          authenticated: true,
          timestamp: Date.now()
        };
        
        // Redirect to clean URL with session cookie
        return redirect('/', {
          headers: {
            'Set-Cookie': [
              `recoder_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
              `recoder_user=${encodeURIComponent(JSON.stringify(sessionData))}; Path=/; Max-Age=86400`
            ].join(', ')
          }
        });
      }
    } catch (error) {
      console.error('Auth token verification failed:', error);
      // Continue to normal flow
    }
  }
  
  // Rest of existing loader code...
}
```

### Phase 3: Session Persistence

**File: `recoder-web/app/lib/auth-session.ts`** (NEW)
```typescript
export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  authenticated: boolean;
  timestamp: number;
}

export function getAuthSession(request: Request): AuthSession | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...v] = c.split('=');
      return [key, v.join('=')];
    })
  );

  const userCookie = cookies['recoder_user'];
  if (!userCookie) return null;

  try {
    const session = JSON.parse(decodeURIComponent(userCookie));
    
    // Check if session is expired (24 hours)
    if (Date.now() - session.timestamp > 86400000) {
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

export function requireAuth(request: Request): AuthSession {
  const session = getAuthSession(request);
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}
```

### Phase 4: Protected Routes

**File: `recoder-web/app/routes/_index.tsx`** (FINAL UPDATE)
```typescript
import { getAuthSession } from '~/lib/auth-session';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const from = url.searchParams.get('from');
  
  // Handle auth token from main app
  if (token && from === 'main-site') {
    // ... token verification code from Phase 2 ...
  }
  
  // Check if user is authenticated
  const session = getAuthSession(request);
  if (!session) {
    // Redirect to main app login
    return redirect('https://recoder.xyz/auth/signin?return=web-ide');
  }
  
  // User is authenticated, continue with normal flow
  const projectId = url.searchParams.get('projectId');
  // ... rest of existing code ...
}
```

## 🚀 DEPLOYMENT PLAN

### Step 1: Deploy Main App (recoder.xyz)
```bash
cd /Users/arhansubasi/recoder.xyz/app

# Create verify-token API
mkdir -p app/api/auth/verify-token
# (File created above)

# Build and deploy
pnpm build

# Deploy to production server
ssh -i ~/.ssh/recoder_deploy root@77.42.23.19 << 'ENDSSH'
cd /home/recoder/recoder.xyz/app
git pull origin main
pnpm install
pnpm build
pm2 restart recoder-app
ENDSSH
```

### Step 2: Deploy Web IDE (web.recoder.xyz)
```bash
cd /Users/arhansubasi/recoder.xyz/recoder-web

# Create auth session lib
mkdir -p app/lib
# (File created above)

# Update index route
# (File updated above)

# Build and deploy
pnpm build

# Deploy to Cloudflare Workers
pnpm run deploy
```

### Step 3: Update Environment Variables

**recoder.xyz (.env):**
```env
NEXT_PUBLIC_WEB_IDE_URL=https://web.recoder.xyz
```

**web.recoder.xyz (.env):**
```env
MAIN_APP_URL=https://recoder.xyz
```

## 🧪 TESTING CHECKLIST

### Test 1: Fresh Login Flow
1. ✅ Go to `recoder.xyz`
2. ✅ Click "Sign In"
3. ✅ Complete authentication
4. ✅ Click "Open Web IDE"
5. ✅ Should land on `web.recoder.xyz` with working IDE
6. ✅ Should NOT redirect back to dashboard

### Test 2: Direct Access
1. ✅ Go directly to `web.recoder.xyz`
2. ✅ Should redirect to `recoder.xyz/auth/signin?return=web-ide`
3. ✅ After login, should redirect back to Web IDE

### Test 3: Session Persistence
1. ✅ Login and access Web IDE
2. ✅ Close browser
3. ✅ Reopen `web.recoder.xyz`
4. ✅ Should still be authenticated (24h session)

### Test 4: Token Expiry
1. ✅ Login and access Web IDE
2. ✅ Wait 24+ hours
3. ✅ Refresh page
4. ✅ Should redirect to login

## 📊 FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                    USER AUTHENTICATION FLOW                  │
└─────────────────────────────────────────────────────────────┘

1. User visits recoder.xyz
   │
   ├─ Not authenticated → Redirect to /auth/signin
   │
   └─ Authenticated → Dashboard

2. User clicks "Open Web IDE"
   │
   └─ Redirect to /platform/web

3. /platform/web checks auth
   │
   ├─ No token → Show "Sign In" button
   │
   └─ Has token → Call /api/platform/access
                   │
                   └─ Generate access token
                      │
                      └─ Redirect to web.recoder.xyz?token=xxx&from=main-site

4. web.recoder.xyz receives request
   │
   ├─ Has token param?
   │  │
   │  ├─ YES → Verify with recoder.xyz/api/auth/verify-token
   │  │        │
   │  │        ├─ Valid → Set session cookie → Redirect to /
   │  │        │
   │  │        └─ Invalid → Continue to auth check
   │  │
   │  └─ NO → Check session cookie
   │           │
   │           ├─ Valid session → Load IDE
   │           │
   │           └─ No session → Redirect to recoder.xyz/auth/signin
   │
   └─ User now has access to Web IDE ✅
```

## 🔧 IMPLEMENTATION FILES

### Files to Create:
1. `app/app/api/auth/verify-token/route.ts`
2. `recoder-web/app/lib/auth-session.ts`

### Files to Update:
1. `recoder-web/app/routes/_index.tsx`
2. `app/app/platform/web/page.tsx` (ensure token is passed)

## 🎯 SUCCESS CRITERIA

- ✅ User can login at recoder.xyz
- ✅ User can click "Open Web IDE" and access web.recoder.xyz
- ✅ No redirect loop
- ✅ Session persists for 24 hours
- ✅ Direct access to web.recoder.xyz redirects to login if not authenticated
- ✅ After login, user is redirected back to Web IDE

## 🚨 ROLLBACK PLAN

If issues occur:
```bash
# Revert main app
cd /home/recoder/recoder.xyz/app
git revert HEAD
pnpm build
pm2 restart recoder-app

# Revert web IDE
cd /Users/arhansubasi/recoder.xyz/recoder-web
git revert HEAD
pnpm run deploy
```

---

**Ready to implement and deploy?** This solution creates a proper authentication bridge between the two applications.
