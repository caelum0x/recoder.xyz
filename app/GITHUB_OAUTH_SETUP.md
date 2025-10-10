# GitHub OAuth Setup Guide

## ✅ What's Configured

### GitHub OAuth App
- **Client ID**: `Ov23liVrw6X0xO8m2jPy`
- **Status**: Credentials added to `.env`

### GitHub App (Advanced Features)
- **App ID**: `2079807`
- **Client ID**: `Iv23liwzwgaRkVKkGlpu`
- **Private Key**: `recoder-xyz.2025-10-07.private-key.pem` (stored in `/app`)

## 🔧 Environment Variables Added

The following variables have been added to your `.env` file:

```bash
# GitHub OAuth App
NEXT_PUBLIC_GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=your-github-oauth-secret-here  # ⚠️ ADD THIS

# GitHub App (for advanced features)
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_APP_PRIVATE_KEY_PATH=./recoder-xyz.2025-10-07.private-key.pem
```

## ⚠️ ACTION REQUIRED

### 1. Add GitHub OAuth Secret

You need to add the GitHub OAuth App secret to your `.env` file. Get it from:
- Go to: https://github.com/settings/developers
- Find your OAuth App: `Ov23liVrw6X0xO8m2jPy`
- Copy the Client Secret
- Update line in `.env`: `GITHUB_SECRET=your-secret-here`

### 2. Update GitHub OAuth App Callback URLs

Make sure your GitHub OAuth App has these callback URLs configured:

**Development:**
```
http://localhost:3002/api/auth/callback/github
http://localhost:3000/api/auth/callback/github
```

**Production:**
```
https://recoder.xyz/api/auth/callback/github
https://www.recoder.xyz/api/auth/callback/github
```

**To update:**
1. Go to: https://github.com/settings/developers
2. Click on your OAuth App
3. Update "Authorization callback URL" field
4. Save changes

### 3. Update GitHub App Callback URLs (Optional)

If you want to use GitHub App features (repo access, etc.), update these URLs:

**Development:**
```
http://localhost:3002/api/auth/callback/github-app
http://localhost:3000/api/auth/callback/github-app
```

**Production:**
```
https://recoder.xyz/api/auth/callback/github-app
https://www.recoder.xyz/api/auth/callback/github-app
```

**To update:**
1. Go to: https://github.com/settings/apps
2. Click on "recoder-xyz" app
3. Update "Callback URL" field
4. Save changes

## 🎯 How It Works

### OAuth Flow

1. User clicks "Sign in with GitHub" button
2. Redirected to GitHub for authorization
3. GitHub redirects back to: `https://recoder.xyz/api/auth/callback/github`
4. NextAuth creates session
5. User is logged in!

### Already Configured in Code

The GitHub provider is already set up in `/lib/auth.ts`:

```typescript
GitHubProvider({
  clientId: process.env.GITHUB_ID || '',
  clientSecret: process.env.GITHUB_SECRET || '',
}),
```

## 🧪 Testing

### Test Locally

1. Make sure `.env` has GitHub secret
2. Run: `npm run dev`
3. Visit: http://localhost:3002/auth/signin
4. Click "Sign in with GitHub"
5. Authorize the app
6. Should redirect back logged in

### Test Production

1. Deploy to Vercel with environment variables
2. Visit: https://recoder.xyz/auth/signin
3. Click "Sign in with GitHub"
4. Should work!

## 📊 OAuth Providers Status

| Provider | Status | Client ID | Secret |
|----------|--------|-----------|--------|
| **Google (Production)** | ✅ Configured | `716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c` | ✅ Added |
| **Google (Localhost)** | ✅ Configured | `716966330476-bs6grcbb7oblkeeg4e61t21koqfusi7f` | ✅ Added |
| **GitHub OAuth** | ⚠️ Need Secret | `Ov23liVrw6X0xO8m2jPy` | ❌ Missing |
| **GitHub App** | ✅ Configured | `Iv23liwzwgaRkVKkGlpu` | ✅ Private Key |

## 🔒 Security Notes

1. **Private Key Security**: The `.pem` file is sensitive - never commit to Git
2. **Secrets**: Keep all secrets in environment variables only
3. **Production**: Use different OAuth apps for dev vs prod
4. **HTTPS**: Always use HTTPS in production for OAuth callbacks

## 🚀 Vercel Deployment

Add these environment variables to Vercel:

```bash
# In Vercel Dashboard → Settings → Environment Variables

# GitHub OAuth
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=your-github-oauth-secret

# GitHub App (if using)
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu

# For private key, either:
# Option 1: Upload file and set path
GITHUB_APP_PRIVATE_KEY_PATH=./recoder-xyz.2025-10-07.private-key.pem

# Option 2: Set content as base64 string
GITHUB_APP_PRIVATE_KEY=base64-encoded-private-key-content
```

## ✅ Next Steps

1. [ ] Add GitHub OAuth secret to `.env`
2. [ ] Update GitHub OAuth callback URLs
3. [ ] Test sign in locally
4. [ ] Add secrets to Vercel
5. [ ] Test sign in on production
6. [ ] Done! 🎉

## 🆘 Troubleshooting

### Error: "secretOrPrivateKey must have a value"

This means `GITHUB_SECRET` is not set. Add it to `.env`.

### Error: "Redirect URI mismatch"

Your callback URL doesn't match what's registered on GitHub. Update the URLs in GitHub OAuth App settings.

### Can't find OAuth App

Go to: https://github.com/settings/developers

### Can't find GitHub App

Go to: https://github.com/settings/apps
