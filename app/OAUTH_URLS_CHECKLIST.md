# OAuth URLs Configuration Checklist

## 🎯 Quick Reference

All OAuth providers need callback URLs updated from `localhost` to `recoder.xyz`.

---

## 🔵 Google OAuth

### Current Configuration

**Production (recoder.xyz):**
- Client ID: `716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c`
- Secret: `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`

**Localhost (development):**
- Client ID: `716966330476-bs6grcbb7oblkeeg4e61t21koqfusi7f`
- Secret: `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`

### Required Callback URLs

#### For Production Client
```
https://recoder.xyz/api/auth/callback/google
https://www.recoder.xyz/api/auth/callback/google
```

#### For Development Client
```
http://localhost:3000/api/auth/callback/google
http://localhost:3002/api/auth/callback/google
http://localhost:3001/api/auth/callback/google
```

### Where to Update
1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your project
3. Click on the OAuth 2.0 Client ID
4. Add "Authorized redirect URIs"
5. Save

**Authorized JavaScript origins** (if needed):
```
https://recoder.xyz
https://www.recoder.xyz
http://localhost:3000
http://localhost:3002
```

---

## 🟣 GitHub OAuth App

### Current Configuration
- Client ID: `Ov23liVrw6X0xO8m2jPy`
- Secret: *Need to add from GitHub*

### Required Callback URL

GitHub OAuth Apps only support **one** callback URL. Choose:

**For Production:**
```
https://recoder.xyz/api/auth/callback/github
```

**Alternative:** Create separate OAuth app for development:
```
http://localhost:3002/api/auth/callback/github
```

### Where to Update
1. Go to: https://github.com/settings/developers
2. Click on your OAuth App
3. Update "Authorization callback URL"
4. For development, consider creating a separate OAuth app

### Recommended: Two OAuth Apps

**Production App:**
- Callback: `https://recoder.xyz/api/auth/callback/github`
- Use this Client ID in production

**Development App:**
- Callback: `http://localhost:3002/api/auth/callback/github`
- Use this Client ID locally

---

## 🟢 GitHub App

### Current Configuration
- App ID: `2079807`
- Client ID: `Iv23liwzwgaRkVKkGlpu`
- Private Key: `recoder-xyz.2025-10-07.private-key.pem`

### Required Callback URL

**Production:**
```
https://recoder.xyz/api/auth/callback/github-app
```

**Development:**
```
http://localhost:3002/api/auth/callback/github-app
```

### Where to Update
1. Go to: https://github.com/settings/apps
2. Click on "recoder-xyz" app
3. Update "Callback URL"
4. Update "Setup URL" (if using):
   - Production: `https://recoder.xyz/setup`
   - Development: `http://localhost:3002/setup`

### Public Page URL
```
https://github.com/apps/recoder-xyz
```

---

## 🔧 Environment Variable Configuration

### For Production (Vercel)

Based on your current URL, the app should use:

```bash
# Core URLs
NEXTAUTH_URL=https://recoder.xyz
NEXT_PUBLIC_SITE_URL=https://recoder.xyz
NEXT_PUBLIC_APP_URL=https://recoder.xyz

# Google OAuth (use production credentials)
GOOGLE_CLIENT_ID=716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c
GOOGLE_CLIENT_SECRET=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

# GitHub OAuth
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=your-github-secret-here

# GitHub App
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_APP_PRIVATE_KEY=your-base64-encoded-key
```

### For Development (Local)

```bash
# Core URLs
NEXTAUTH_URL=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Google OAuth (use localhost credentials)
GOOGLE_CLIENT_ID=716966330476-bs6grcbb7oblkeeg4e61t21koqfusi7f
GOOGLE_CLIENT_SECRET=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

# GitHub OAuth (if separate dev app)
GITHUB_ID=your-dev-github-id
GITHUB_SECRET=your-dev-github-secret

# GitHub App (same for dev/prod)
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_APP_PRIVATE_KEY_PATH=./recoder-xyz.2025-10-07.private-key.pem
```

---

## ✅ Action Items

### Immediate Tasks

- [ ] **Google OAuth Production**: Verify callback URLs include `recoder.xyz`
  - Go to Google Cloud Console
  - Add `https://recoder.xyz/api/auth/callback/google`
  - Add `https://www.recoder.xyz/api/auth/callback/google`

- [ ] **Google OAuth Development**: Verify localhost URLs
  - Should already have `http://localhost:3000/api/auth/callback/google`
  - Add `http://localhost:3002/api/auth/callback/google` if missing

- [ ] **GitHub OAuth**: Get the secret and update `.env`
  - Go to https://github.com/settings/developers
  - Copy secret for `Ov23liVrw6X0xO8m2jPy`
  - Add to `.env`: `GITHUB_SECRET=xxx`

- [ ] **GitHub OAuth**: Update callback URL
  - Change to: `https://recoder.xyz/api/auth/callback/github`
  - Or create separate dev app for localhost

- [ ] **GitHub App**: Update callback URL
  - Go to https://github.com/settings/apps/recoder-xyz
  - Update callback to: `https://recoder.xyz/api/auth/callback/github-app`

- [ ] **Vercel Environment Variables**: Add all secrets
  - Google credentials (production)
  - GitHub OAuth credentials
  - GitHub App credentials
  - JWT secrets

---

## 🧪 Testing Checklist

### Local Development Test

```bash
# Start app
cd /Users/arhansubasi/recoder.xyz/app
npm run dev

# Test OAuth providers
# 1. Visit: http://localhost:3002/auth/signin
# 2. Try "Sign in with Google" ✓
# 3. Try "Sign in with GitHub" ✓
```

### Production Test

```bash
# After deploying to Vercel
# Visit: https://recoder.xyz/auth/signin
# Test each OAuth provider
```

---

## 🚨 Common Issues

### "Redirect URI mismatch"
**Fix**: Update callback URLs in OAuth provider settings to match exactly

### "Invalid client"
**Fix**: Check that Client ID and Secret are correct in environment variables

### "secretOrPrivateKey must have a value"
**Fix**: Missing `GITHUB_SECRET` or `NEXTAUTH_SECRET` in environment

### OAuth works locally but not in production
**Fix**: 
1. Check Vercel environment variables are set
2. Verify production callback URLs in OAuth provider
3. Make sure `NEXTAUTH_URL=https://recoder.xyz` in Vercel

---

## 📋 Summary

| Provider | Local Client ID | Prod Client ID | Callback URL |
|----------|----------------|----------------|--------------|
| Google | `716966330476-bs6grcbb7oblkeeg4e61t21koqfusi7f` | `716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c` | `/api/auth/callback/google` |
| GitHub OAuth | Same or separate | `Ov23liVrw6X0xO8m2jPy` | `/api/auth/callback/github` |
| GitHub App | Same | Same (`2079807`) | `/api/auth/callback/github-app` |

---

## 🎯 Next Steps

1. Complete the action items above
2. Test locally with all providers
3. Deploy to Vercel with environment variables
4. Test production with all providers
5. Monitor sign-in success rates
6. Update documentation with screenshots

Need help? Check the detailed guides:
- `GITHUB_OAUTH_SETUP.md` - GitHub OAuth setup
- `.env.example` - All environment variables
- NextAuth docs: https://next-auth.js.org/providers/github
