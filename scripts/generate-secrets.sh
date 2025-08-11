#!/bin/bash

# Production Secrets Generator for Recoder.xyz
# Generates cryptographically secure secrets for production deployment

set -e

echo "🔐 Generating Production Secrets for Recoder.xyz"
echo "================================================"
echo ""

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is required but not installed"
    exit 1
fi

echo "# Generated on: $(date)"
echo "# IMPORTANT: Keep these secrets secure and never commit to git"
echo ""

echo "#======================================"
echo "# Core Database & Cache"
echo "#======================================"
echo "DB_NAME=recoder_production"
echo "DB_USER=recoder"
echo "DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""
echo "REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""

echo "#======================================"
echo "# Security & JWT"
echo "#======================================"
JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)

# Ensure JWT secrets are different
while [ "$JWT_SECRET" = "$JWT_REFRESH_SECRET" ]; do
    JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
done

echo "JWT_SECRET=$JWT_SECRET"
echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""

echo "#======================================"
echo "# AI Providers (Fill in your actual API keys)"
echo "#======================================"
echo ""
echo "# Together AI (FREE MODELS - Primary Provider)"
echo "TOGETHER_API_KEY=your_together_ai_api_key_here"
echo ""
echo "# Groq (Fast Inference - Secondary)"
echo "GROQ_API_KEY=your_groq_api_key_here"
echo ""
echo "# Google Gemini (Multimodal - Tertiary)"
echo "GOOGLE_API_KEY=your_google_gemini_api_key_here"
echo ""
echo "# Anthropic Claude (Premium - Quaternary)"
echo "ANTHROPIC_API_KEY=your_anthropic_api_key_here"
echo ""
echo "# OpenAI (Fallback Only - Last Resort)"
echo "OPENAI_API_KEY=your_openai_api_key_here"
echo ""

echo "#======================================"
echo "# Domain & SSL Configuration"
echo "#======================================"
echo "DOMAIN=recoder.xyz"
echo "WEB_URL=https://recoder.xyz"
echo "API_URL=https://api.recoder.xyz"
echo "CHAT_URL=https://chat.recoder.xyz"
echo "MONITOR_DOMAIN=monitor.recoder.xyz"
echo ""
echo "# SSL Certificate Email (Required for Let's Encrypt)"
echo "ACME_EMAIL=admin@recoder.xyz"
echo ""

echo "#======================================"
echo "# OAuth Providers (Optional)"
echo "#======================================"
echo "GOOGLE_CLIENT_ID=your_google_oauth_client_id"
echo "GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret"
echo ""
echo "GITHUB_CLIENT_ID=your_github_oauth_client_id"
echo "GITHUB_CLIENT_SECRET=your_github_oauth_client_secret"
echo ""

echo "#======================================"
echo "# Payment Processing (Optional)"
echo "#======================================"
echo "STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key"
echo "STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key"
echo "STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret"
echo ""

echo "#======================================"
echo "# Monitoring & Logging"
echo "#======================================"
echo "GRAFANA_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-24)"
echo ""
echo "# Sentry (Optional Error Tracking)"
echo "SENTRY_DSN=your_sentry_dsn_here"
echo ""

echo "#======================================"
echo "# Email Configuration (Optional)"
echo "#======================================"
echo "EMAIL_SMTP_HOST=smtp.gmail.com"
echo "EMAIL_SMTP_PORT=587"
echo "EMAIL_SMTP_USER=your_email@gmail.com"
echo "EMAIL_SMTP_PASS=your_email_app_password"
echo ""

echo "#======================================"
echo "# Performance & Scaling"
echo "#======================================"
echo "RATE_LIMIT_WINDOW_MS=900000"
echo "RATE_LIMIT_MAX_REQUESTS=1000"
echo "LOG_LEVEL=info"
echo ""
echo "# Node.js Memory Limits (Optional)"
echo "NODE_OPTIONS=--max-old-space-size=2048"

# Footer with instructions
echo ""
echo "🔐 Secrets generated successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Copy the output above to .env.production"
echo "2. Replace placeholder API keys with your actual keys"
echo "3. Set proper file permissions: chmod 600 .env.production"
echo "4. NEVER commit .env.production to git"
echo "5. Test deployment with: ./deploy-production.sh"
echo ""
echo "⚠️  Security Reminders:"
echo "   • Rotate these secrets monthly"
echo "   • Use different secrets for staging/production"
echo "   • Monitor API key usage regularly"
echo "   • Keep backups of working configurations"