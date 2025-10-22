# GitHub Authentication Security & Configuration Guide

## ⚠️ CRITICAL SECURITY ACTIONS REQUIRED

### Actions Taken
✅ Removed private key from git tracking  
✅ Added `*.pem` files to `.gitignore`  
✅ Identified environment variable mismatch  

### Required Next Steps

#### 1. Fix Environment Variable Names (CRITICAL - Auth Currently Broken!)
Your authentication code expects different variable names:

**Problem:**
- `.env` has: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Code expects: `GITHUB_ID` and `GITHUB_SECRET` (in `app/lib/auth.ts` line 32-33)

**Solution:** Add these to your `.env` file:
```bash
GITHUB_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85
```

#### 2. Regenerate GitHub App Private Key (CRITICAL)
Your private key was exposed in git, so you MUST regenerate it:

1. Go to: https://github.com/settings/apps
2. Find your app (App ID: 2079807)
3. Navigate to "Private keys" → "Revoke" current key
4. Generate new private key
5. Download and save as `app/recoder-xyz.2025-10-13.private-key.pem`
6. Set permissions: `chmod 600 app/recoder-xyz.2025-10-13.private-key.pem`

#### 3. Rotate GitHub Secrets (Recommended)
Since your secrets are in git history, consider rotating:

**GitHub OAuth App:**
1. Go to: https://github.com/settings/developers
2. Find your OAuth App
3. Generate new client secret
4. Update both `GITHUB_SECRET` and `GITHUB_CLIENT_SECRET` in `.env`

**Note:** Same Client ID can be used for both OAuth App and GitHub App

#### 4. Clean Git History (Optional but Recommended)
```bash
# Remove from all git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch app/recoder-xyz.2025-10-13.private-key.pem" \
  --prune-empty --tag-name-filter cat -- --all

# Or use BFG (easier):
brew install bfg
bfg --delete-files recoder-xyz.2025-10-13.private-key.pem

# Force push (⚠️ team coordination required):
git push origin --force --all
```

## Current Configuration

### Environment Variables (.env)
```bash
# OAuth Authentication (NextAuth)
GITHUB_ID=Iv23liwzwgaRkVKkGlpu                      # ⚠️ MISSING - ADD THIS
GITHUB_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85  # ⚠️ MISSING - ADD THIS

# GitHub App (Advanced API Access)
GITHUB_APP_ID=2079807
GITHUB_APP_CLIENT_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_APP_CLIENT_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85
GITHUB_APP_PRIVATE_KEY_PATH=./recoder-xyz.2025-10-13.private-key.pem  # ⚠️ REGENERATE KEY
```

### Where Variables Are Used

**OAuth (NextAuth):**
- File: `app/lib/auth.ts` (lines 32-33)
- Expects: `GITHUB_ID` and `GITHUB_SECRET`
- Purpose: User sign-in with GitHub

**GitHub App:**
- File: `app/lib/config.ts` (lines 34-36)
- Uses: `GITHUB_CLIENT_ID`, `GITHUB_APP_CLIENT_ID`, etc.
- Purpose: Advanced GitHub API operations

## Quick Fix

Add these two lines to your `app/.env` file NOW to fix authentication:

```bash
# Add after line 28 in your .env:
GITHUB_ID=Iv23liwzwgaRkVKkGlpu
GITHUB_SECRET=89cdd0bff7385fe4f51c35ec80450af483908e85
```

Then regenerate your private key as described above.

## Security Best Practices

### Files to Never Commit
```bash
# Already in .gitignore ✅
.env
.env.*
*.pem
*.private-key.pem
```

### File Permissions
```bash
# Set restrictive permissions on sensitive files
chmod 600 app/.env
chmod 600 app/recoder-xyz.2025-10-13.private-key.pem
```

### Production Deployment
For production (Vercel, AWS, etc.), use environment variables instead of files:

```bash
# Convert private key to base64
cat app/recoder-xyz.2025-10-13.private-key.pem | base64 | tr -d '\n'

# Then set in hosting platform:
GITHUB_APP_PRIVATE_KEY=<base64-encoded-key>
```

## Testing Authentication

### Test GitHub OAuth Sign-In
```bash
# Start the app
cd app && npm run dev

# Visit in browser:
http://localhost:3000/auth/signin
# Click "Sign in with GitHub"
```

### Verify Environment Variables
```bash
cd app && node -e "
require('dotenv').config();
console.log('GITHUB_ID:', process.env.GITHUB_ID ? '✅ Set' : '❌ Missing');
console.log('GITHUB_SECRET:', process.env.GITHUB_SECRET ? '✅ Set' : '❌ Missing');
console.log('GITHUB_APP_ID:', process.env.GITHUB_APP_ID ? '✅ Set' : '❌ Missing');
console.log('Private Key File:', require('fs').existsSync('./recoder-xyz.2025-10-13.private-key.pem') ? '✅ Exists' : '❌ Missing');
"
```

## GitHub App Permissions

Verify your GitHub App has these permissions (if needed):

**Repository permissions:**
- Contents: Read & Write
- Metadata: Read (required)
- Pull requests: Read & Write
- Issues: Read & Write

**User permissions:**
- Email addresses: Read
- Profile: Read

Check at: https://github.com/settings/apps/YOUR_APP/permissions

## Callback URLs

Make sure these are configured in GitHub:

**OAuth App:**
- Development: `http://localhost:3000/api/auth/callback/github`
- Production: `https://recoder.xyz/api/auth/callback/github`

**GitHub App:**
- Callback URL: `https://recoder.xyz/api/auth/callback/github`
- Setup URL: `https://recoder.xyz/setup` (optional)

## Troubleshooting

### "OAuth app not found" error
→ Add `GITHUB_ID` and `GITHUB_SECRET` to `.env`

### "Bad credentials" error  
→ Verify Client ID and Secret are correct  
→ Check if private key is valid (not expired)

### "Callback URL mismatch" error
→ Check callback URLs in GitHub settings match your app

### Private key errors
→ Ensure file exists and has correct permissions (600)  
→ Check file format (should start with `-----BEGIN RSA PRIVATE KEY-----`)

## References

- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps)
- [GitHub Apps](https://docs.github.com/en/apps/creating-github-apps)
- [NextAuth GitHub Provider](https://next-auth.js.org/providers/github)

---
**Last Updated:** 2025-01-19  
**Security Level:** CRITICAL
