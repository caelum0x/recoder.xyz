# OAuth localhost:3000 Redirect Issue - Root Cause & Solution

## Problem
After Google OAuth authentication, users were being redirected to:
```
https://localhost:3000/auth/signin?error=oauth_error
```

Instead of:
```
https://recoder.xyz/auth/signin?error=oauth_error
```

## Root Cause
The OAuth **callback** handlers (`/app/api/auth/callback/google/route.ts` and `/app/api/auth/callback/github/route.ts`) were using `request.url` to construct redirect URLs.

Since nginx proxies to `localhost:3000` internally, `request.url` resolves to `localhost:3000`, causing all error redirects to point to localhost instead of the production domain.

## The Fix

### Files Modified:
1. `/app/api/auth/callback/google/route.ts`
2. `/app/api/auth/callback/github/route.ts`

### Change Required:
```typescript
// ❌ OLD (uses request.url which resolves to localhost:3000):
return NextResponse.redirect(new URL('/auth/signin?error=oauth_error', request.url));
return NextResponse.redirect(`${request.nextUrl.origin}/dashboard`);

// ✅ NEW (uses hardcoded production URL):
const origin = 'https://recoder.xyz';
return NextResponse.redirect(new URL('/auth/signin?error=oauth_error', origin));
return NextResponse.redirect(`${origin}/dashboard`);
```

## Files Already Fixed (Local)
✅ `/Users/arhansubasi/recoder.xyz/app/app/api/auth/callback/google/route.ts` - Updated
✅ `/Users/arhansubasi/recoder.xyz/app/app/api/auth/callback/github/route.ts` - Updated

## Files Fixed (Server)
✅ `/home/recoder/recoder.xyz/app/app/api/auth/callback/google/route.ts` - Uploaded
✅ `/home/recoder/recoder.xyz/app/app/api/auth/callback/github/route.ts` - Uploaded

## Status
- **Code**: ✅ Fixed on both local and server
- **Build**: ⚠️ Need to rebuild `.next` directory with fixed code
- **Deploy**: ⏳ Pending rebuild

## Next Steps to Deploy
1. Stop recoder-web service to free memory:
   ```bash
   systemctl stop recoder-web
   ```

2. Clean and rebuild as recoder user:
   ```bash
   cd /home/recoder/recoder.xyz/app
   rm -rf .next
   chown -R recoder:recoder .
   su - recoder -c 'cd /home/recoder/recoder.xyz/app && NODE_ENV=production pnpm run build'
   ```

3. Restart services:
   ```bash
   systemctl restart recoder-app
   systemctl start recoder-web
   ```

## Why This Different from Initial OAuth Fix
The **initial OAuth fix** corrected the `/api/auth/google` and `/api/auth/github` routes (the entry points).

This **second OAuth fix** corrects the `/api/auth/callback/google` and `/api/auth/callback/github` routes (the return handlers after Google/GitHub authentication).

Both were needed - one for outgoing redirects to OAuth providers, one for incoming redirects back from OAuth providers.

## Test After Deploy
1. Go to https://recoder.xyz
2. Click "Sign in with Google"
3. Authenticate with Google
4. You should be redirected to `https://recoder.xyz/dashboard` (not localhost)
5. If error occurs, redirect should be to `https://recoder.xyz/auth/signin?error=oauth_error` (not localhost)
