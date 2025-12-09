# 🚨 SECURITY INCIDENT RESPONSE - December 9, 2025

## Incident Summary
**Date**: December 8, 2025 8:42 PM UTC  
**Severity**: CRITICAL  
**Type**: Secret Exposure in Public Repository  
**Commit**: a104474

## Compromised Secrets
1. **SSH Password** - 2 occurrences
2. **PostgreSQL URI** - 1 occurrence  
3. **Total**: 9 occurrences across multiple files

## Immediate Actions Taken
- ✅ Files deleted from repository
- ✅ Enhanced .gitignore created
- ✅ Pre-commit hook installed to prevent future leaks

## ⚠️ CRITICAL ACTIONS REQUIRED (DO NOW)

### 1. Rotate All Compromised Credentials
```bash
# SSH Password
# On server:
sudo passwd root
sudo passwd recoder

# Update all services that use SSH
# Update deployment scripts with new password
```

### 2. Rotate PostgreSQL Credentials
```bash
# Connect to database
psql $DATABASE_URL

# Change password
ALTER USER your_user WITH PASSWORD 'new_secure_password';

# Update all services with new DATABASE_URL
# - recoder-app/.env
# - recoder-web/.env
# - docker-backend/.env
# - backend/.env
```

### 3. Check for Unauthorized Access
```bash
# Check SSH login attempts
sudo grep "Accepted password" /var/log/auth.log
sudo grep "Failed password" /var/log/auth.log | tail -100

# Check database connections
# In PostgreSQL:
SELECT * FROM pg_stat_activity;
SELECT * FROM pg_stat_database;

# Check for suspicious queries in logs
sudo grep "ERROR" /var/log/postgresql/*.log | tail -100
```

### 4. Review Git History
```bash
# Check if secrets are in git history
git log --all --full-history -- "*.env"
git log --all --full-history -- "*.pem"

# If found, use BFG Repo-Cleaner or git filter-branch
# WARNING: This rewrites history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch *.env *.pem" \
  --prune-empty --tag-name-filter cat -- --all
```

## Prevention Measures Implemented

### 1. Enhanced .gitignore
- SSH keys (*.pem, *.key, *.pub)
- Database URIs and credentials
- API keys and tokens
- Environment files

### 2. Pre-commit Hook
- Scans for secret patterns
- Blocks commits with .env files
- Blocks commits with SSH keys
- Provides clear error messages

### 3. Testing the Hook
```bash
# Test that hook works
echo "password=secret123" > test.txt
git add test.txt
git commit -m "test"
# Should be BLOCKED

# Clean up
rm test.txt
git reset
```

## Best Practices Going Forward

### DO:
- ✅ Use environment variables for all secrets
- ✅ Commit only .env.example files
- ✅ Use secret management tools (AWS Secrets Manager, HashiCorp Vault)
- ✅ Rotate credentials regularly
- ✅ Use SSH keys instead of passwords
- ✅ Enable 2FA on all services

### DON'T:
- ❌ Never commit .env files
- ❌ Never commit SSH keys or certificates
- ❌ Never commit database connection strings
- ❌ Never commit API keys or tokens
- ❌ Never commit passwords

## Monitoring

### Set up alerts for:
- Failed SSH login attempts
- Unusual database connections
- High database query volume
- Unauthorized API access

### Tools to consider:
- GitGuardian (already detected this)
- git-secrets
- truffleHog
- detect-secrets

## Incident Timeline

| Time | Action |
|------|--------|
| 2025-12-08 20:42 UTC | Secrets committed to GitHub (commit a104474) |
| 2025-12-08 20:42 UTC | GitGuardian detected breach |
| 2025-12-09 01:58 UTC | User notified of breach |
| 2025-12-09 02:04 UTC | Files deleted from repo |
| 2025-12-09 02:04 UTC | .gitignore enhanced |
| 2025-12-09 02:04 UTC | Pre-commit hook installed |
| **PENDING** | Credentials rotation |
| **PENDING** | Access log review |
| **PENDING** | Git history cleanup |

## Status: ⚠️ INCOMPLETE
**Next Steps**: Rotate all credentials and verify no unauthorized access occurred.
