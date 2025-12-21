# Secrets Rotation Guide - Post-Malware Incident

**Priority**: 🔴 HIGH
**Status**: ⚠️ PENDING
**Date Required**: ASAP (Post-Compromise Protocol)

---

## 🚨 Why This Is Critical

After the malware incident on your server (processes `ndggdmi1nm`, `31oo1j3cpobeeki`, infected PM2 module `extrareqp2`), **all secrets must be considered compromised** until proven otherwise.

**Security Best Practice**: Assume breach = rotate everything.

---

## 🔑 Secrets to Rotate

### 1. Database Credentials (HIGHEST PRIORITY)

**Current Status**: Using Neon PostgreSQL
**Risk**: Malware had root access - could have read environment variables

**Actions Required**:

```bash
# Current database (from your setup)
DATABASE_URL="postgresql://neondb_owner@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"

# Actions:
# 1. Create new Neon database or rotate password
# 2. Migrate data to new database
# 3. Update all services with new DATABASE_URL
# 4. Revoke old credentials
```

**Where to Update**:
- `/app/.env` or `/app/.env.local`
- `/app/.env.production`
- `/recoder-web/.env`
- Environment variables in deployment (Hetzner server, Vercel, etc.)

---

### 2. AI Provider API Keys

**Providers in Use**:
- OpenRouter
- Anthropic (Claude)
- OpenAI
- Google (Gemini)
- Groq

**Actions Required**:

```bash
# Current keys (ROTATE ALL):
OPENROUTER_API_KEY=sk-or-v1-...
ANTHROPIC_API_KEY=sk-ant-api...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
GROQ_API_KEY=...

# Steps:
# 1. Generate new API keys from each provider's dashboard
# 2. Update environment variables
# 3. Revoke old keys immediately after updating
```

**Where to Update**:
- CLI: `~/.recoder/config.json` or environment variables
- Web: `/recoder-web/.env`
- App: `/app/.env.local`

---

### 3. Authentication Secrets

**JWT & Session Secrets**:

```bash
# These MUST be rotated:
NEXTAUTH_SECRET=...
BETTER_AUTH_SECRET=...
JWT_SECRET=...
AUTH_SECRET=...

# Generate new secrets:
openssl rand -base64 32  # Run this for each secret

# Update in:
# - /app/.env.local
# - /app/.env.production
```

**Important**: Rotating these will log out all users. Schedule appropriately.

---

### 4. GitHub OAuth Credentials

**If using GitHub for authentication**:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Actions:
# 1. Go to GitHub Developer Settings
# 2. Create new OAuth App or regenerate secret
# 3. Update callback URLs if needed
# 4. Update environment variables
```

---

### 5. Google OAuth Credentials

**If using Google Sign-In**:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Actions:
# 1. Go to Google Cloud Console
# 2. Rotate OAuth 2.0 credentials
# 3. Update authorized redirect URIs
# 4. Update environment variables
```

---

### 6. Encryption Keys

**Used for encrypting user API keys in database**:

```bash
# Check these files:
ENCRYPTION_KEY=...
API_KEY_ENCRYPTION_SECRET=...

# Generate new encryption key:
openssl rand -hex 32

# ⚠️ WARNING: Rotating this requires re-encrypting all stored API keys
# Plan migration carefully
```

**Migration Required**:
1. Decrypt all existing API keys with old key
2. Re-encrypt with new key
3. Update database records

---

### 7. Redis/Cache Credentials

**If using Redis for caching**:

```bash
REDIS_URL=redis://...
REDIS_PASSWORD=...

# Actions:
# 1. Update Redis password
# 2. Update all services
```

---

### 8. Deployment Secrets

**SSH Keys**:
```bash
# Your Hetzner server SSH key:
# File: /Users/arhansubasi/Downloads/ssh-key-2025-12-04.key
# Password: [REDACTED - Use environment variables]

# Actions:
# 1. Generate new SSH key pair
# 2. Add to Hetzner server
# 3. Remove old key from authorized_keys
# 4. Delete compromised key file
```

**PM2 Ecosystem**:
```bash
# Since PM2 was infected, verify:
# 1. PM2 reinstalled globally (already done)
# 2. No PM2 keymetrics or monitoring tokens exposed
```

---

## 📋 Rotation Checklist

### Phase 1: Immediate (Do Today)
- [ ] Generate new database password on Neon
- [ ] Update DATABASE_URL in all services
- [ ] Test database connectivity
- [ ] Rotate JWT/session secrets
- [ ] Generate new SSH key for server access

### Phase 2: High Priority (This Week)
- [ ] Rotate OpenRouter API key
- [ ] Rotate Anthropic API key
- [ ] Rotate OpenAI API key
- [ ] Rotate Google API key (if used)
- [ ] Rotate Groq API key (if used)
- [ ] Update CLI config files
- [ ] Test AI functionality after rotation

### Phase 3: Medium Priority (This Week)
- [ ] Rotate GitHub OAuth credentials
- [ ] Rotate Google OAuth credentials
- [ ] Update OAuth callback URLs
- [ ] Test authentication flows

### Phase 4: Lower Priority (Next Week)
- [ ] Plan encryption key migration
- [ ] Backup existing encrypted data
- [ ] Rotate encryption key with migration
- [ ] Verify all API keys still work

---

## 🔧 Rotation Procedures

### Procedure 1: Database Rotation (Neon)

```bash
# 1. Login to Neon dashboard
# 2. Navigate to your project
# 3. Go to Settings > Reset Password
# 4. Copy new connection string

# 5. Update on Hetzner server:
sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP << 'EOF'
  cd /home/recoder/recoder.xyz/app

  # Backup current .env
  cp .env.local .env.local.backup

  # Update DATABASE_URL (use sed or manually edit)
  nano .env.local

  # Restart services
  pm2 restart recoder-app
EOF

# 6. Verify connectivity:
psql "postgresql://new-connection-string" -c "SELECT 1;"
```

---

### Procedure 2: AI API Keys

```bash
# Example: Rotating OpenRouter Key

# 1. Get new key from https://openrouter.ai/keys
# 2. Update locally:
export OPENROUTER_API_KEY="sk-or-v1-NEW_KEY"

# 3. Update on server:
sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP << 'EOF'
  # Update recoder-web
  cd /home/recoder/recoder.xyz/recoder-web
  echo "OPENROUTER_API_KEY=sk-or-v1-NEW_KEY" >> .env
  pm2 restart recoder-web

  # Update main app
  cd /home/recoder/recoder.xyz/app
  echo "OPENROUTER_API_KEY=sk-or-v1-NEW_KEY" >> .env.local
  pm2 restart recoder-app
EOF

# 4. Revoke old key at OpenRouter dashboard
# 5. Test AI generation
```

---

### Procedure 3: JWT Secrets

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update on server
sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP << 'EOF'
  cd /home/recoder/recoder.xyz/app

  # Update .env.local
  sed -i 's/^NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET='$NEW_SECRET'/' .env.local
  sed -i 's/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET='$NEW_SECRET'/' .env.local

  # Restart
  pm2 restart recoder-app
EOF

# ⚠️ NOTE: This will log out all users
```

---

## 🧪 Testing After Rotation

### Test 1: Database Connectivity
```bash
# From server:
PGPASSWORD="new_password" psql "postgresql://new-connection" -c "SELECT COUNT(*) FROM users;"
```

### Test 2: AI Functionality
```bash
# Test CLI:
recoder-code auth login  # Should work with new keys

# Test web:
curl https://recoder.xyz/api/chat-history  # Should connect to DB
```

### Test 3: Authentication
```bash
# Try logging in via web
# Try OAuth flows
# Verify sessions work
```

---

## 📊 Post-Rotation Verification

### Checklist
- [ ] All services restart successfully
- [ ] Database queries work
- [ ] AI generation works (test each provider)
- [ ] Authentication works (email, OAuth)
- [ ] API key decryption works
- [ ] CLI can authenticate
- [ ] Web IDE functions normally

### Rollback Plan
Keep backup of old `.env` files for 48 hours in case rollback needed:
```bash
# Backups at:
/home/recoder/recoder.xyz/app/.env.local.backup
/home/recoder/recoder.xyz/recoder-web/.env.backup
```

---

## 🔐 Security Enhancements (Post-Rotation)

### 1. Add Secrets Management
Consider using:
- **Vault** (HashiCorp)
- **AWS Secrets Manager**
- **Doppler**

### 2. Enable Audit Logging
```bash
# Log all secret accesses
# Alert on unusual patterns
# Monitor for new compromises
```

### 3. Implement Secret Rotation Policy
- Rotate every 90 days
- Automate where possible
- Document rotation procedures

### 4. Harden Server Access
```bash
# Disable password authentication
# Use only SSH keys
# Enable fail2ban
# Regular security audits
```

---

## ⚠️ Important Notes

1. **Schedule Downtime**: Some rotations require brief downtime
2. **Communicate**: Notify users if sessions will be invalidated
3. **Document**: Keep record of what was rotated and when
4. **Test Thoroughly**: Don't rotate production without testing
5. **Monitor**: Watch logs after rotation for issues

---

## 📞 Emergency Contacts

If issues arise during rotation:
- **Database (Neon)**: Check dashboard or support
- **OpenRouter**: support@openrouter.ai
- **Server Access**: Hetzner support

---

## ✅ Completion Checklist

Once all rotations complete:
- [ ] All secrets rotated
- [ ] All services tested
- [ ] Old credentials revoked
- [ ] Documentation updated
- [ ] Team notified
- [ ] Mark issue as resolved in CURRENT_ISSUES.md

---

**Last Updated**: 2025-12-12
**Status**: 🔴 **PENDING EXECUTION** - Ready for immediate implementation
