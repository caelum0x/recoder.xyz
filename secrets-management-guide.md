# Production Secrets Management Guide

## 🔐 Environment Variables Security

### Required Production Secrets

```bash
# Generate secure secrets (run locally):
# Database password (32 chars)
export DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Redis password (32 chars) 
export REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# JWT secret (64 chars)
export JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)

# JWT refresh secret (64 chars - DIFFERENT from JWT_SECRET)
export JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)

# Encryption key (exactly 32 chars for AES-256)
export ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Grafana admin password
export GRAFANA_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-24)
```

### AI Provider API Keys (Priority Order)

```bash
# 1. Together AI (FREE models - Primary)
export TOGETHER_API_KEY="your_together_ai_key_here"

# 2. Groq (Fast inference - Secondary)  
export GROQ_API_KEY="your_groq_key_here"

# 3. Google Gemini (Multimodal - Tertiary)
export GOOGLE_API_KEY="your_google_gemini_key_here"

# 4. Anthropic Claude (Premium - Quaternary) 
export ANTHROPIC_API_KEY="your_claude_key_here"

# 5. OpenAI (Fallback only - Last resort)
export OPENAI_API_KEY="your_openai_key_here"
```

### Domain & SSL Configuration

```bash
# Domain settings
export DOMAIN="recoder.xyz"
export WEB_URL="https://recoder.xyz"
export API_URL="https://api.recoder.xyz"
export CHAT_URL="https://chat.recoder.xyz"

# SSL certificate email (REQUIRED)
export ACME_EMAIL="admin@recoder.xyz"
```

### Payment Processing (Optional)

```bash
# Stripe API keys
export STRIPE_SECRET_KEY="sk_live_your_stripe_secret"
export STRIPE_PUBLISHABLE_KEY="pk_live_your_stripe_publishable"
export STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"
```

## 🛡️ Security Best Practices

### 1. Secret Generation

```bash
#!/bin/bash
# generate-secrets.sh - Generate all required secrets

echo "=== Generating Production Secrets ==="
echo ""

echo "# Core Database & Cache"
echo "DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""

echo "# Security & JWT" 
echo "JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""

echo "# Monitoring"
echo "GRAFANA_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-24)"
echo ""

echo "IMPORTANT: Copy these values to .env.production and NEVER commit them to git!"
```

### 2. File Permissions

```bash
# Secure environment file
chmod 600 .env.production
chown root:root .env.production

# Restrict access to deployment scripts
chmod 755 deploy-production.sh
chmod 644 docker-compose.production-enhanced.yml
```

### 3. Docker Secrets (Alternative)

```bash
# Create Docker secrets for sensitive data
echo "your_db_password" | docker secret create db_password -
echo "your_redis_password" | docker secret create redis_password -
echo "your_jwt_secret" | docker secret create jwt_secret -
```

### 4. Environment Isolation

```bash
# Development
.env.development    # Local development secrets

# Staging  
.env.staging       # Staging environment secrets

# Production
.env.production    # Production secrets (NEVER in git)
```

## 🔄 Secret Rotation Strategy

### Monthly Rotation (Recommended)

```bash
# 1. Generate new secrets
./scripts/generate-secrets.sh > .env.production.new

# 2. Update database password
docker-compose exec postgres psql -U recoder -c "ALTER USER recoder PASSWORD 'new_password';"

# 3. Rolling update
docker-compose -f docker-compose.production-enhanced.yml restart backend
docker-compose -f docker-compose.production-enhanced.yml restart web
docker-compose -f docker-compose.production-enhanced.yml restart chat

# 4. Verify functionality
curl -f https://api.recoder.xyz/api/health

# 5. Replace old environment file
mv .env.production.new .env.production
chmod 600 .env.production
```

## 🚨 Emergency Procedures

### Compromised API Key Response

```bash
# 1. Immediately revoke compromised key at provider
# 2. Update environment variable
# 3. Restart affected services
docker-compose restart backend production-engine

# 4. Check logs for unauthorized usage
docker-compose logs backend | grep "ERROR\|UNAUTHORIZED"

# 5. Rotate related secrets if necessary
```

### Full Security Reset

```bash
# 1. Generate completely new secrets
./scripts/generate-secrets.sh > .env.production.emergency

# 2. Stop all services
docker-compose -f docker-compose.production-enhanced.yml down

# 3. Backup current database
docker run --rm -v recoder-postgres-prod:/source -v $(pwd)/backups:/backup alpine tar czf /backup/emergency-backup.tar.gz -C /source .

# 4. Update secrets
mv .env.production.emergency .env.production

# 5. Start with new configuration
./deploy-production.sh
```

## 📋 Security Checklist

### Pre-Deployment
- [ ] All required secrets generated with proper entropy
- [ ] API keys tested and confirmed working
- [ ] Environment file permissions set to 600
- [ ] No secrets in git repository or logs
- [ ] SSL email configured for Let's Encrypt

### Post-Deployment  
- [ ] SSL certificates automatically issued
- [ ] All health checks passing
- [ ] Monitoring alerts configured
- [ ] Backup processes running
- [ ] Log aggregation working

### Ongoing Maintenance
- [ ] Monthly secret rotation scheduled
- [ ] API key usage monitoring active
- [ ] Security patches applied regularly
- [ ] Access logs reviewed weekly
- [ ] Backup integrity tested monthly

## 🔗 Integration with Cloud Providers

### AWS Secrets Manager

```bash
# Store secrets in AWS
aws secretsmanager create-secret --name recoder-production --secret-string file://.env.production

# Retrieve in production
aws secretsmanager get-secret-value --secret-id recoder-production --query SecretString --output text > .env.production
```

### Azure Key Vault

```bash
# Store in Azure Key Vault
az keyvault secret set --vault-name recoder-vault --name db-password --value "$DB_PASSWORD"

# Retrieve in production
DB_PASSWORD=$(az keyvault secret show --vault-name recoder-vault --name db-password --query value -o tsv)
```

### Google Secret Manager

```bash
# Store in Google Secret Manager
echo -n "$DB_PASSWORD" | gcloud secrets create db-password --data-file=-

# Retrieve in production  
DB_PASSWORD=$(gcloud secrets versions access latest --secret="db-password")
```

---

## 📞 Emergency Contact

**Security Incident Response:**
- Email: security@recoder.xyz
- Slack: #security-incidents  
- Phone: +1-XXX-XXX-XXXX (24/7)

**Remember: Security is not a feature, it's a foundation.**