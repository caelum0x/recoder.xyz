# OAuth Quick Start - 5 Minutes Setup

## ✅ What's Done

Your OAuth credentials are already in `.env`:

```bash
✅ Google (Production) - Ready
✅ Google (Localhost) - Ready  
⚠️ GitHub OAuth - Need secret
✅ GitHub App - Ready
```

---

## ⚡ Quick Setup (3 Steps)

### Step 1: Get GitHub OAuth Secret (2 min)

1. Visit: https://github.com/settings/developers
2. Find OAuth App: `Ov23liVrw6X0xO8m2jPy`
3. Copy the "Client Secret"
4. Open `/Users/arhansubasi/recoder.xyz/app/.env`
5. Update line 31:
   ```bash
   GITHUB_SECRET=paste-secret-here
   ```

### Step 2: Update Callback URLs (2 min)

**Google Cloud Console**
- Visit: https://console.cloud.google.com/apis/credentials
- Add these URLs to **BOTH** OAuth clients:

Production client (`...u9b9p6bi7u5...`):
```
https://recoder.xyz/api/auth/callback/google
https://www.recoder.xyz/api/auth/callback/google
```

Development client (`...bs6grcbb7o...`):
```
http://localhost:3002/api/auth/callback/google
```

**GitHub Settings**
- Visit: https://github.com/settings/developers
- Update callback URL to:
```
https://recoder.xyz/api/auth/callback/github
```

### Step 3: Test It (1 min)

```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
```

Visit: http://localhost:3002/auth/signin

Try signing in with Google and GitHub!

---

## 🚀 Deploy to Production

### Add to Vercel Environment Variables

```bash
# Go to: https://vercel.com/your-project/settings/environment-variables

# Google OAuth (Production)
GOOGLE_CLIENT_ID=716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c
GOOGLE_CLIENT_SECRET=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

# GitHub OAuth
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=your-github-secret

# GitHub App
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_APP_PRIVATE_KEY=base64-encoded-key

# URLs
NEXTAUTH_URL=https://recoder.xyz
NEXT_PUBLIC_SITE_URL=https://recoder.xyz
```

Then redeploy!

---

## 📊 Status Dashboard

| Component | Status | Action |
|-----------|--------|--------|
| `.env` file | ✅ Updated | Add GitHub secret |
| Google OAuth | ✅ Ready | Verify URLs |
| GitHub OAuth | ⚠️ Secret needed | Get from GitHub |
| GitHub App | ✅ Ready | Good to go |
| Callback URLs | ⚠️ Need update | 2 min task |
| Code integration | ✅ Already done | No changes needed |

---

## 🆘 Need Help?

Check detailed guides:
- `GITHUB_OAUTH_SETUP.md` - Full GitHub setup
- `OAUTH_URLS_CHECKLIST.md` - Complete URL reference

---

## 💡 Pro Tips

1. **Use separate OAuth apps** for dev/prod to avoid conflicts
2. **Test locally first** before deploying
3. **Keep secrets secure** - never commit to Git
4. **Monitor sign-ins** with analytics after launch

---

That's it! You're ready to go. 🎉
