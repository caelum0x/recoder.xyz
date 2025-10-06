# Security Incident Response - GitGuardian Alert

**Date**: January 6, 2025
**Severity**: HIGH
**Status**: RESOLVED

## Incident Summary

GitGuardian detected 4 internal secret incidents in commit `c0d1d1c` in the file `.claude/settings.local.json`.

### Exposed Secrets

1. **OpenRouter API Key** - Detected in WebFetch permission
2. **PostgreSQL URI** (3 instances) - Database connection strings with embedded credentials
3. **Generic Password** (4 occurrences) - PostgreSQL password `npg_giGdQ9T1FsUC`

### Affected File

- `.claude/settings.local.json` (Claude Code configuration file)

## Actions Taken

### 1. Immediate Mitigation ✅

- Added `.claude/settings.local.json` to `.gitignore`
- Removed file from Git tracking using `git rm --cached`
- Created sanitized example file: `.claude/settings.local.example.json`
- Created `.claude/README.md` with security guidelines

### 2. Required Next Steps 🚨

**CRITICAL: You must rotate these secrets immediately!**

#### OpenRouter API Key
1. Go to https://openrouter.ai/keys
2. Revoke the exposed API key
3. Generate a new API key
4. Update your local `.claude/settings.local.json` with the new key
5. Update any other places where this key is used

#### PostgreSQL Database (Neon)
1. Go to your Neon console: https://console.neon.tech
2. Navigate to the project: `ep-restless-bird-adezgw23`
3. Reset the database password for user `neondb_owner`
4. Update your local `.claude/settings.local.json` with new credentials
5. Update environment variables in:
   - `.env.local` files
   - Backend configuration
   - Production engine configuration
   - Any deployed services

### 3. Git History Cleanup (Optional but Recommended)

The secrets are still in Git history. To completely remove them:

```bash
# Using git filter-repo (recommended)
git filter-repo --path .claude/settings.local.json --invert-paths

# Or using BFG Repo-Cleaner
bfg --delete-files settings.local.json
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push to update remote
git push origin --force --all
```

⚠️ **Warning**: This will rewrite Git history. Coordinate with team members.

### 4. Prevention Measures ✅

- [x] Added `.claude/settings.local.json` to `.gitignore`
- [x] Created example template file
- [x] Added security documentation
- [ ] Rotate all exposed secrets
- [ ] Consider using secret management tools (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Add pre-commit hooks to scan for secrets
- [ ] Enable GitGuardian monitoring for all commits

## Verification Checklist

- [x] File removed from Git tracking
- [x] Added to .gitignore
- [x] Example file created
- [x] Documentation added
- [ ] Secrets rotated
- [ ] Services updated with new secrets
- [ ] Git history cleaned (optional)

## Secret Rotation Guide

### OpenRouter API Key

```bash
# After generating new key on openrouter.ai
echo "Update .claude/settings.local.json with new key"
# No restart needed for Claude Code
```

### Neon Database

```bash
# After resetting password in Neon console
# Update all .env.local files
find . -name ".env.local" -type f | while read file; do
  echo "Update DATABASE_URL in: $file"
done

# Restart all services
npm run stop
npm run dev:all
```

## Related Files to Check

After rotating secrets, verify these files don't contain the exposed credentials:

```bash
# Search for potential secret files
find . -type f \( -name "*.env*" -o -name "*.local" \) -not -path "*/node_modules/*" | xargs grep -l "npg_giGdQ9T1FsUC" 2>/dev/null
```

## Contact

For security concerns, contact the security team immediately.

## References

- [GitGuardian Alert](https://dashboard.gitguardian.com)
- [OpenRouter API Keys](https://openrouter.ai/keys)
- [Neon Console](https://console.neon.tech)
- [Git History Rewriting Guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
