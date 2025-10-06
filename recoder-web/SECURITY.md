# 🔒 SECURITY GUIDELINES - RECODER WEB

## Environment Security

### ✅ Secure Configuration Applied
- **Strong Secrets**: All JWT and session secrets are 64+ character random strings
- **Secure Database**: Database password is cryptographically secure
- **Git Protection**: All `.env*` files are excluded from version control
- **Environment Isolation**: Separate configurations for development/production

### 🚨 Critical Security Rules

1. **NEVER commit environment files** - All `.env*` files are in `.gitignore`
2. **Use strong secrets** - All secrets are 32+ characters and cryptographically secure
3. **Rotate secrets regularly** - Generate new secrets for each environment
4. **Environment isolation** - Use different secrets for dev/staging/production
5. **Principle of least privilege** - Only provide necessary environment variables

### 🔑 Secret Generation

Generate secure secrets using OpenSSL:
```bash
# JWT Secret (64 characters)
openssl rand -base64 64

# Session Secret (64 characters) 
openssl rand -base64 64

# NextAuth Secret (32 characters)
openssl rand -base64 32

# Database Password (32 characters)
openssl rand -base64 32
```

### 📋 Environment Setup

1. **Copy template**: `cp .env.example .env.local`
2. **Generate secrets**: Use commands above
3. **Configure providers**: Add real API keys
4. **Test configuration**: Verify all services work
5. **Document secrets**: Store securely (1Password, AWS Secrets Manager, etc.)

### 🛡️ Production Security

#### Required for Production:
- [ ] All secrets rotated and unique
- [ ] API keys from real provider accounts
- [ ] Database credentials are strong
- [ ] HTTPS enforced (NEXTAUTH_URL uses https://)
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Security headers implemented
- [ ] Environment variables validated

#### Secret Management:
- Use AWS Secrets Manager, Azure Key Vault, or similar
- Never log environment variables
- Implement secret rotation policies
- Monitor for secret exposure
- Use environment-specific secrets

### 🔍 Security Scanning

Regular security checks:
```bash
# Check for vulnerabilities
npm audit

# Check for exposed secrets (install git-secrets)
git secrets --scan

# Check environment configuration
npm run security:check
```

### 🚨 Incident Response

If secrets are compromised:
1. **Immediately rotate** all affected secrets
2. **Update all deployments** with new secrets
3. **Revoke compromised API keys** from provider consoles
4. **Check logs** for unauthorized access
5. **Document incident** and improve security

### 📝 Security Checklist

#### Development:
- [ ] `.env.local` never committed
- [ ] Strong secrets generated
- [ ] Local services secured
- [ ] No hardcoded credentials in code

#### Production:
- [ ] Environment-specific secrets
- [ ] API keys from production accounts
- [ ] HTTPS enforced everywhere
- [ ] Security monitoring enabled
- [ ] Regular security audits
- [ ] Backup and recovery procedures

### ⚡ Quick Security Commands

```bash
# Generate all secrets at once
echo "JWT_SECRET=$(openssl rand -base64 64)"
echo "SESSION_SECRET=$(openssl rand -base64 64)" 
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"

# Check git status for env files
git status | grep -E "\.env"

# Verify no secrets in git history
git log --all --full-history -- "*.env*"
```

### 🔗 Resources
- [OWASP Environment Security](https://owasp.org/www-project-top-ten/)
- [NextAuth.js Security](https://next-auth.js.org/configuration/options#secret)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---
*Last updated: 2025-09-29*
*Security configuration applied by Claude Code*