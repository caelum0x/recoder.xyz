# 🚀 Quick Start: Fix OAuth in 3 Steps

## What Was Fixed
✅ Environment variables corrected  
✅ Better Auth configuration fixed  
✅ Homepage navigation fixed  
✅ Security issue with private key addressed  

## ⚡ 3 Steps to Working OAuth

### Step 1: Update GitHub OAuth Settings (2 minutes)

Go to: **https://github.com/settings/developers**

1. Click your OAuth App
2. Set **Authorization callback URL** to:
   ```
   http://localhost:3000/api/auth/callback/github
   ```
3. Click **Update application**

### Step 2: Update Google OAuth Settings (2 minutes)

Go to: **https://console.cloud.google.com/apis/credentials**

1. Click your OAuth 2.0 Client ID
2. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
3. Click **Save**

### Step 3: Test It! (30 seconds)

```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
```

Open: **http://localhost:3000/auth/signin**

Click "Sign in with GitHub" or "Sign in with Google" - it should work! 🎉

## ✅ What to Expect

1. Click "Sign in with GitHub"
2. Redirected to GitHub authorization page
3. Click "Authorize"
4. Redirected back to your app
5. **Successfully signed in!**

## 🐛 If It Still Doesn't Work

### Check Console Logs
```bash
# Look for errors when starting the app
npm run dev
```

### Verify Environment
```bash
cd app && node -e "
require('dotenv').config();
console.log('GITHUB_ID:', !!process.env.GITHUB_ID ? '✅' : '❌');
console.log('GITHUB_SECRET:', !!process.env.GITHUB_SECRET ? '✅' : '❌');
console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL);
console.log('Database:', !!process.env.DATABASE_URL ? '✅' : '❌');
"
```

### Common Issues

**"Cannot connect to database"**
→ Check DATABASE_URL in .env

**"Invalid client" from GitHub**
→ Verify callback URL in GitHub settings matches exactly

**Still getting 404**
→ Make sure app is running on port 3000 (not 3002)

## 🔒 Security Reminder

⚠️ **CRITICAL**: Your GitHub App private key was in git. You must:

1. Go to: https://github.com/settings/apps
2. Find your app (ID: 2079807)
3. Revoke old private key
4. Generate new private key
5. Save as: `app/recoder-xyz.2025-10-13.private-key.pem`
6. Set permissions: `chmod 600 app/recoder-xyz.2025-10-13.private-key.pem`

## 📚 Full Documentation

- `FIXES_APPLIED.md` - Complete list of changes
- `GITHUB_OAUTH_CHECKLIST.md` - Detailed OAuth setup
- `GITHUB_AUTH_SECURITY.md` - Security best practices

---
**Ready to test!** All code changes are complete. Just update GitHub/Google OAuth settings and you're done.
