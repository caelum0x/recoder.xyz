# GitHub OAuth Callback URL Checklist

## ⚠️ CRITICAL: Update Your GitHub OAuth Settings

Your OAuth is failing because GitHub callback URLs might not be configured correctly.

### Step 1: Update GitHub OAuth App Settings

1. Go to: https://github.com/settings/developers
2. Click on your OAuth App (Client ID: `Iv23liwzwgaRkVKkGlpu`)
3. Update **Authorization callback URL** to:

```
http://localhost:3000/api/auth/callback/github
```

For production, also add:
```
https://recoder.xyz/api/auth/callback/github
```

### Step 2: Verify Environment Variables

Check your `app/.env` file has:

```bash
# Must have BOTH sets for compatibility
GITHUB_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85
GITHUB_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_CLIENT_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85

GOOGLE_CLIENT_ID=716966330476-4rbi96edvjus5e4q3u7bilvthi8gmvb4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
```

### Step 3: Update Google OAuth Settings

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:

```
http://localhost:3000/api/auth/callback/google
https://recoder.xyz/api/auth/callback/google
```

### Step 4: Test Authentication

```bash
# Start the app
cd /Users/arhansubasi/recoder.xyz/app
npm run dev

# In browser, visit:
http://localhost:3000/auth/signin

# Try both:
- Sign in with GitHub
- Sign in with Google
```

## Expected Flow

1. User clicks "Sign in with GitHub"
2. Redirects to: `https://github.com/login/oauth/authorize?client_id=...`
3. User authorizes
4. GitHub redirects back to: `http://localhost:3000/api/auth/callback/github?code=...`
5. Better Auth handles the callback (via `app/api/auth/[...all]/route.ts`)
6. User is signed in and redirected to dashboard

## If Still Getting 404

1. **Check console logs** when starting `npm run dev`
2. **Verify route exists**: `ls -la app/api/auth/[...all]/route.ts`
3. **Check for TypeScript errors**: `npm run typecheck`
4. **Verify database connection**: Check DATABASE_URL in .env

## Quick Debug Commands

```bash
# Verify Better Auth route exists
ls -la app/api/auth/[...all]/route.ts

# Check environment variables are loaded
cd app && node -e "require('dotenv').config(); console.log('GITHUB_ID:', !!process.env.GITHUB_ID, '\nGITHUB_CLIENT_ID:', !!process.env.GITHUB_CLIENT_ID, '\nNEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL)"

# Test database connection
cd app && npx prisma db push
```

---
**Priority**: HIGH - Must update GitHub OAuth callback URLs
**Created**: 2025-01-19
