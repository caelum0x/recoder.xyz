# 🚨 URGENT ACTION REQUIRED - Secret Rotation

## Status: IMMEDIATE ATTENTION NEEDED

Your GitGuardian alerts have been addressed, but **you must rotate the exposed secrets NOW**.

## 2-Step Action Plan (Do This Immediately)

### Step 1: Rotate OpenRouter API Key (5 minutes)

1. **Revoke old key**: https://openrouter.ai/keys
2. **Generate new key**
3. **Update local file**:
   ```bash
   nano .claude/settings.local.json
   # Update the WebFetch permission with new key
   ```

### Step 2: Rotate Neon Database Password (10 minutes)

1. **Reset password**: https://console.neon.tech (project: ep-restless-bird-adezgw23)
2. **Update all local files**:
   ```bash
   # Update these 4 files with new password:
   nano .claude/settings.local.json
   nano recoder-chat/.env.local
   nano recoder-web/.env.local
   nano recoder-web/prisma/.env
   ```
3. **Restart services**:
   ```bash
   npm run stop
   npm run dev:all
   ```

## What's Already Been Fixed ✅

- ✅ `.claude/settings.local.json` removed from Git tracking
- ✅ File added to `.gitignore` (won't be committed again)
- ✅ Example template created for safe sharing
- ✅ Documentation created

## Why This Matters

The secrets were exposed in Git commit `c0d1d1c` which is public in your repository. Anyone with access to your repo can see:
- Your OpenRouter API key → Could use your API credits
- Your Neon DB password → Could access/modify your database

**Rotating the secrets makes the exposed ones useless.**

## Verification After Rotation

```bash
# Test database connection
npm run test:db

# Verify file is still ignored
git check-ignore -v .claude/settings.local.json
```

## Questions?

See detailed guides in:
- `SECURITY_FIX_SUMMARY.md` - Complete overview
- `SECURITY_INCIDENT_RESPONSE.md` - Detailed incident report
- `.claude/README.md` - Claude settings documentation

---

**Time to complete: ~15 minutes**  
**Priority: HIGH - Do this before pushing any more commits**
