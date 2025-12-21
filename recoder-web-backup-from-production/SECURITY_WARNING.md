# 🚨 URGENT SECURITY WARNING 🚨

## Your GitHub Token Was Exposed!

You just shared your GitHub Personal Access Token in a chat message. This is a serious security issue.

---

## What This Means

Anyone who saw that token can:
- ❌ Access your GitHub repositories
- ❌ Read your private code
- ❌ Make commits as you
- ❌ Delete repositories
- ❌ Access organization data (if you have org access)

---

## IMMEDIATE ACTIONS REQUIRED

### Step 1: Revoke the Compromised Token (NOW!)

1. Go to: https://github.com/settings/tokens
2. Find the token: `github_pat_REDACTED`
3. Click the **Delete** or **Revoke** button
4. Confirm deletion

**Do this RIGHT NOW before continuing!**

---

### Step 2: Generate a New Token

1. Still on https://github.com/settings/tokens
2. Click "Generate new token" → Choose "Classic"
3. Settings:
   - **Note:** "Recoder Development"
   - **Expiration:** Choose appropriate duration
   - **Scopes:** Select `repo` (Full control of private repositories)
4. Click "Generate token" at bottom
5. **COPY THE TOKEN** (you can't see it again!)
6. **DO NOT share this token anywhere!**

---

### Step 3: Update Your .dev.vars File

```bash
# Edit the file
nano /Users/arhansubasi/bolt.new/.dev.vars

# Find this line:
GITHUB_TOKEN=github_pat_11A7ANSVY00M3IZT8M4tgi...

# Replace with your NEW token:
GITHUB_TOKEN=your_new_token_here

# Save: Ctrl+O, Enter, Ctrl+X
```

---

### Step 4: Verify .gitignore

Make sure `.dev.vars` is in `.gitignore`:

```bash
# Check if it's ignored
cd /Users/arhansubasi/bolt.new
grep ".dev.vars" .gitignore
```

It should show: `.dev.vars` is in the ignore list.

---

### Step 5: Check Git History

Make sure you never committed `.dev.vars`:

```bash
# Check if file was ever committed
git log --all --full-history -- .dev.vars
```

If it shows any commits, you need to remove it from git history!

---

## Security Best Practices Going Forward

### ❌ NEVER Do This:
- Share tokens in chat, email, Slack, etc.
- Commit tokens to git repositories
- Store tokens in unencrypted files
- Use the same token for multiple projects
- Share screenshots containing tokens

### ✅ ALWAYS Do This:
- Use environment variables (`.env`, `.dev.vars`)
- Add `.env*` to `.gitignore`
- Use separate tokens for each project
- Rotate tokens regularly (every 90 days)
- Use minimal required scopes
- Revoke unused tokens immediately

---

## What to Check After Revoking

1. **Check GitHub Activity:**
   - Go to: https://github.com/settings/security-log
   - Look for any suspicious activity
   - Look for API requests from unknown IPs

2. **Check Repository Access:**
   - Review recent commits to your repos
   - Check for any unauthorized changes
   - Look at repository settings

3. **Enable 2FA:**
   - If not already enabled: https://github.com/settings/security
   - Add two-factor authentication

---

## How to Safely Share Code

If you need to share config files:

### Option 1: Use Placeholders
```bash
GITHUB_TOKEN=your_token_here
API_KEY=your_api_key_here
```

### Option 2: Use Example Files
Create `.env.example`:
```bash
# Copy this to .env and fill in your values
GITHUB_TOKEN=
API_KEY=
DATABASE_URL=
```

### Option 3: Share Structure Only
```bash
# Required variables:
# - GITHUB_TOKEN: GitHub Personal Access Token
# - API_KEY: OpenAI API Key
# Get tokens from: [links to documentation]
```

---

## Checklist

- [ ] Revoked old token on GitHub
- [ ] Generated new token with minimal scopes
- [ ] Updated `.dev.vars` with new token
- [ ] Verified `.dev.vars` is in `.gitignore`
- [ ] Checked git history for exposed secrets
- [ ] Reviewed GitHub security log
- [ ] Enabled 2FA on GitHub (if not already)
- [ ] Understood best practices

---

## After Securing

Once you've completed all steps above:

1. Restart your dev server:
   ```bash
   pnpm run dev
   ```

2. GitHub cloning should now work without rate limits

3. Your account is secured

---

## Need Help?

If you're unsure about any step or notice suspicious activity:

1. Contact GitHub Support: https://support.github.com/
2. Review GitHub's security guide: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure

---

**Remember:** Tokens are like passwords. Treat them with the same level of security!

🔒 Stay safe! 🔒
