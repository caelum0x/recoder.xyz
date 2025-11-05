# 🔐 Recoder-Web Authentication Implementation Plan

**Date**: 2025-11-05
**Goal**: Require users to authenticate via recoder.xyz before accessing web.recoder.xyz

---

## 📋 CURRENT STATE

### Main Site (recoder.xyz)
- ✅ Uses **better-auth** for authentication
- ✅ Email/password + OAuth (Google, GitHub)
- ✅ Session management with cookies
- ✅ Database: PostgreSQL with Prisma

### Recoder-Web (web.recoder.xyz)
- ❌ **Placeholder auth** using localStorage (not secure!)
- ❌ No real authentication
- ⚠️ Runs on **Cloudflare Workers** (Remix)

---

## 🎯 AUTHENTICATION FLOW

### Flow Diagram
```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits web.recoder.xyz                              │
│    └─> Check for valid session                              │
│                                                              │
│ 2. No session found?                                         │
│    └─> Redirect to recoder.xyz/login?redirect=web.recoder...│
│                                                              │
│ 3. User logs in at recoder.xyz                              │
│    └─> better-auth creates session                          │
│                                                              │
│ 4. After login success:                                      │
│    └─> Redirect back to web.recoder.xyz with token          │
│                                                              │
│ 5. web.recoder.xyz receives token                           │
│    └─> Verify token with recoder.xyz API                    │
│    └─> Create session cookie for web.recoder.xyz            │
│                                                              │
│ 6. User can now use AI app                                   │
│    └─> Session persists across page refreshes               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 IMPLEMENTATION STEPS

### Step 1: Create Session Verification API (recoder.xyz)

**File**: `app/app/api/auth/verify-session/route.ts`

```typescript
// Verify a session token from web.recoder.xyz
export async function POST(request: Request) {
  const { sessionToken } = await request.json();

  // Verify the token with better-auth
  const session = await auth.api.getSession({
    headers: { cookie: `session=${sessionToken}` }
  });

  if (!session?.user) {
    return Response.json({ valid: false }, { status: 401 });
  }

  return Response.json({
    valid: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      plan: session.user.subscriptionPlan
    }
  });
}
```

### Step 2: Create Auth Middleware (web.recoder.xyz)

**File**: `recoder-web/app/lib/auth/session.server.ts`

```typescript
import { createCookie } from '@remix-run/cloudflare';

export const sessionCookie = createCookie('recoder_web_session', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
});

export async function verifySession(request: Request) {
  const cookieHeader = request.headers.get('Cookie');
  const session = await sessionCookie.parse(cookieHeader);

  if (!session?.token) {
    return null;
  }

  // Verify with main site
  const response = await fetch('https://recoder.xyz/api/auth/verify-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: session.token })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.valid ? data.user : null;
}
```

### Step 3: Add Auth Guard to Root Route

**File**: `recoder-web/app/root.tsx` (loader function)

```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Skip auth check for callback route
  if (url.pathname === '/auth/callback') {
    return json({ user: null });
  }

  // Verify session
  const user = await verifySession(request);

  if (!user) {
    // Redirect to login on main site
    const redirectUrl = encodeURIComponent(url.toString());
    return redirect(`https://recoder.xyz/login?redirect=${redirectUrl}`);
  }

  return json({ user });
}
```

### Step 4: Create Auth Callback Route

**File**: `recoder-web/app/routes/auth.callback.tsx`

```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionToken = url.searchParams.get('token');
  const redirectTo = url.searchParams.get('redirect') || '/';

  if (!sessionToken) {
    return redirect('https://recoder.xyz/login');
  }

  // Create session cookie
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    await sessionCookie.serialize({ token: sessionToken })
  );

  return redirect(redirectTo, { headers });
}
```

### Step 5: Update Main Site Login Success

**File**: `app/app/(dashboard)/login/page.tsx` or login handler

After successful login, redirect to:
```typescript
const redirect = searchParams.get('redirect');
if (redirect?.includes('web.recoder.xyz')) {
  // Get session token
  const session = await getSession();
  const callbackUrl = `${redirect}?token=${session.token}`;
  router.push(callbackUrl);
} else {
  router.push('/dashboard');
}
```

---

## 🔒 SECURITY CONSIDERATIONS

### 1. Token Security
- ✅ Use HTTP-only cookies
- ✅ Enable secure flag in production
- ✅ Short-lived tokens (7 days)
- ✅ SameSite=Lax to prevent CSRF

### 2. CORS Configuration
- ✅ Allow recoder.xyz to call web.recoder.xyz APIs
- ✅ Allow web.recoder.xyz to call recoder.xyz verification API

### 3. Session Validation
- ✅ Verify every request
- ✅ Cache verification results (5 minutes)
- ✅ Invalidate on logout

---

## 📝 ENVIRONMENT VARIABLES

### recoder.xyz (.env)
```bash
NEXT_PUBLIC_WEB_APP_URL=https://web.recoder.xyz
```

### web.recoder.xyz (.env)
```bash
MAIN_SITE_URL=https://recoder.xyz
# In development
MAIN_SITE_URL=http://localhost:3000
WEB_APP_URL=http://localhost:8788
```

---

## ✅ TESTING CHECKLIST

### Local Development
- [ ] Start recoder.xyz on localhost:3000
- [ ] Start web.recoder.xyz on localhost:8788
- [ ] Visit http://localhost:8788
- [ ] Should redirect to http://localhost:3000/login
- [ ] Login with test account
- [ ] Should redirect back to http://localhost:8788
- [ ] Should see AI app (authenticated)

### Production
- [ ] Visit https://web.recoder.xyz
- [ ] Should redirect to https://recoder.xyz/login
- [ ] Login successfully
- [ ] Should redirect back to web app
- [ ] Refresh page - should stay logged in
- [ ] Logout - should redirect to login

---

## 🚀 ROLLOUT PLAN

### Phase 1: Backend Setup
1. Create verification API on recoder.xyz
2. Add session verification to web.recoder.xyz
3. Test with Postman/curl

### Phase 2: Frontend Integration
1. Add auth callback route
2. Update root loader with auth guard
3. Update login page to handle redirects

### Phase 3: Testing
1. Local testing
2. Staging deployment
3. Production deployment

### Phase 4: Monitoring
1. Log auth failures
2. Monitor redirect loops
3. Track user login success rate

---

## 🔄 ALTERNATIVE: Shared Cookie Domain

**Option**: Use a shared cookie domain (*.recoder.xyz)

**Pros**:
- Simpler - no token passing needed
- Better-auth session works across subdomains

**Cons**:
- Requires domain configuration
- Less secure if other subdomains exist

**Implementation**:
```typescript
// In better-auth config
export const auth = betterAuth({
  // ...
  cookie: {
    domain: '.recoder.xyz', // Works for *.recoder.xyz
  }
});
```

This would allow sessions to work across recoder.xyz and web.recoder.xyz automatically!

---

## 📚 NEXT STEPS

1. ✅ Review this plan
2. Choose approach (token passing vs shared cookie)
3. Implement verification API
4. Add auth guards to web app
5. Test locally
6. Deploy to production

---

**Recommended Approach**: Shared Cookie Domain (simpler, more secure)
