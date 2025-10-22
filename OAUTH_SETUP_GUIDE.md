# OAuth Setup Guide - Recoder.xyz

**Status**: Required for GitHub & Google authentication
**Time Required**: 10-15 minutes
**Skill Level**: Easy (just copy-paste URLs)

---

## 🎯 What You're Configuring

OAuth allows users to sign in with GitHub or Google instead of creating passwords. You need to tell GitHub and Google where to send users after they authenticate.

---

## 🔧 GitHub OAuth Setup

### Step 1: Access Your GitHub App

1. Go to: https://github.com/settings/developers
2. Click on "OAuth Apps"
3. Find your app with Client ID: `Iv23liwzwgaRkVKkGlpu`
4. Click to edit it

### Step 2: Configure Redirect URIs

**Add these exact URLs to "Authorization callback URL":**

**For Development:**
```
http://localhost:3000/api/auth/callback/github
```

**For Production:**
```
https://recoder.xyz/api/auth/callback/github
https://www.recoder.xyz/api/auth/callback/github
```

### Step 3: Configure Homepage URL

**Set "Homepage URL" to:**
```
https://recoder.xyz
```

### Step 4: Save Changes

Click "Update application"

### ✅ Verification

Test the GitHub OAuth flow:
1. Go to `http://localhost:3000/auth/signin`
2. Click "Continue with GitHub"
3. Should redirect to GitHub → authorize → back to your app
4. If it fails, check the redirect URL matches exactly

---

## 🔧 Google OAuth Setup

### Step 1: Access Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID: `716966330476-4rbi96edvjus5e4q3u7bilvthi8gmvb4.apps.googleusercontent.com`
3. Click to edit it

### Step 2: Configure Authorized Redirect URIs

**Add these exact URLs to "Authorized redirect URIs":**

**For Development:**
```
http://localhost:3000/api/auth/callback/google
```

**For Production:**
```
https://recoder.xyz/api/auth/callback/google
https://www.recoder.xyz/api/auth/callback/google
```

### Step 3: Configure Authorized JavaScript Origins

**Add these to "Authorized JavaScript origins":**

**For Development:**
```
http://localhost:3000
```

**For Production:**
```
https://recoder.xyz
https://www.recoder.xyz
```

### Step 4: Save Changes

Click "Save"

### ✅ Verification

Test the Google OAuth flow:
1. Go to `http://localhost:3000/auth/signin`
2. Click "Continue with Google"
3. Should redirect to Google → select account → back to your app
4. If it fails, check:
   - Redirect URI matches exactly
   - JavaScript origin is configured
   - Google Cloud project is active

---

## 🔍 Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause**: The redirect URI in your request doesn't match what's configured in GitHub/Google.

**Fix**:
1. Check the error message - it shows the exact URI that was sent
2. Copy that URI exactly
3. Add it to your GitHub/Google OAuth settings
4. Try again

### Error: "Application not configured"

**Cause**: OAuth app credentials not set in environment variables.

**Fix**: Check your `.env` file has:
```bash
# GitHub
GITHUB_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_CLIENT_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85

# Google
GOOGLE_CLIENT_ID=716966330476-4rbi96edvjus5e4q3u7bilvthi8gmvb4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
```

### Error: "Access blocked: This app's request is invalid"

**Cause**: Google OAuth screen not configured or app not published.

**Fix**:
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Complete the OAuth consent screen setup
3. Add test users (for development)
4. Or publish the app (for production)

---

## 📋 Quick Checklist

### GitHub OAuth
- [ ] Added `http://localhost:3000/api/auth/callback/github`
- [ ] Added `https://recoder.xyz/api/auth/callback/github`
- [ ] Set homepage URL to `https://recoder.xyz`
- [ ] Saved changes

### Google OAuth
- [ ] Added redirect URI: `http://localhost:3000/api/auth/callback/google`
- [ ] Added redirect URI: `https://recoder.xyz/api/auth/callback/google`
- [ ] Added JavaScript origin: `http://localhost:3000`
- [ ] Added JavaScript origin: `https://recoder.xyz`
- [ ] OAuth consent screen configured
- [ ] Test users added (if in development mode)
- [ ] Saved changes

### Environment Variables
- [ ] `GITHUB_CLIENT_ID` set
- [ ] `GITHUB_CLIENT_SECRET` set
- [ ] `GOOGLE_CLIENT_ID` set
- [ ] `GOOGLE_CLIENT_SECRET` set
- [ ] Restarted dev server after changing `.env`

---

## 🚀 Testing OAuth

### Test GitHub OAuth:
```bash
# 1. Start dev server
npm run dev

# 2. Open browser
open http://localhost:3000/auth/signin

# 3. Click "Continue with GitHub"
# 4. Should redirect to GitHub
# 5. Authorize the app
# 6. Should redirect back to /dashboard
```

### Test Google OAuth:
```bash
# Same steps as GitHub but click "Continue with Google"
```

### Expected Flow:
```
User clicks OAuth button
  ↓
Redirect to GitHub/Google
  ↓
User authorizes
  ↓
Redirect to /api/auth/callback/github (or /google)
  ↓
Better Auth processes callback
  ↓
Creates/updates user in database
  ↓
Creates session
  ↓
Redirects to /dashboard
```

---

## 🔐 Security Notes

### Never commit secrets to git:
```bash
# .env should be in .gitignore
# Check with:
cat .gitignore | grep .env
```

### Rotate secrets if exposed:
1. GitHub: Generate new Client Secret in GitHub settings
2. Google: Generate new Client Secret in Google Cloud Console
3. Update `.env` files
4. Restart servers

### Production considerations:
- Use different OAuth apps for dev/staging/production
- Enable 2FA on GitHub/Google accounts that own OAuth apps
- Monitor OAuth app usage in dashboards
- Set up proper CORS policies

---

## 📚 References

- **Better Auth Docs**: https://www.better-auth.com/docs/integrations/oauth
- **GitHub OAuth Docs**: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps
- **Google OAuth Docs**: https://developers.google.com/identity/protocols/oauth2

---

## ✅ Done?

Once you've configured both OAuth providers:

1. Test sign-in with GitHub
2. Test sign-in with Google
3. Test sign-in with email/password
4. Verify users appear in database
5. Verify sessions work across page refreshes

All three methods should work seamlessly!
