# Recoder.xyz Deployment Checklist

## 🎯 Overview

This checklist guides you through deploying the complete Recoder.xyz ecosystem with authentication, payments, and usage tracking.

---

## ✅ Pre-Deployment (Local Testing)

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# Minimum required for local testing:
- DATABASE_URL (from Vercel/Neon Postgres)
- NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
- JWT_SECRET
- API_KEY_ENCRYPTION_SECRET (from: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. Database Migrations
```bash
cd app

# Validate schema
npx prisma validate

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed test data
npx prisma db seed

# Verify with Prisma Studio
npx prisma studio
# Opens at http://localhost:5555
```

### 3. Local Testing
```bash
# Start development server
npm run dev
# Should start on http://localhost:3002

# Test authentication page
open http://localhost:3002/api/auth/cli

# Test device flow page
open http://localhost:3002/auth/device

# Test health endpoint
curl http://localhost:3002/api/health
```

---

## 🔐 OAuth Provider Setup

### GitHub OAuth (15 minutes)

1. **Create OAuth App**
   - Visit: https://github.com/settings/developers
   - Click "New OAuth App"
   - Fill in:
     - **Application name**: Recoder.xyz
     - **Homepage URL**: https://recoder.xyz
     - **Authorization callback URL**: https://recoder.xyz/api/auth/callback/github
   - Click "Register application"

2. **Get Credentials**
   - Copy **Client ID**
   - Generate **Client secret**
   - Save both to your `.env`:
     ```bash
     GITHUB_CLIENT_ID=Iv1.abc123...
     GITHUB_CLIENT_SECRET=abc123def456...
     ```

3. **Test**
   ```bash
   # Visit in browser
   open https://recoder.xyz/api/auth/signin
   # Click "Sign in with GitHub"
   # Should redirect to GitHub → authorize → redirect back
   ```

### Google OAuth (15 minutes)

1. **Create OAuth Client**
   - Visit: https://console.cloud.google.com/apis/credentials
   - Create Project (if needed)
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: Recoder.xyz
   - Authorized redirect URIs:
     - https://recoder.xyz/api/auth/callback/google
     - http://localhost:3002/api/auth/callback/google (for testing)
   - Click "Create"

2. **Get Credentials**
   - Copy **Client ID** (ends with .apps.googleusercontent.com)
   - Copy **Client secret**
   - Save to `.env`:
     ```bash
     GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
     ```

3. **Configure OAuth Consent Screen**
   - Add app name, logo, privacy policy URL
   - Add scopes: email, profile
   - Add test users (during development)

4. **Test**
   ```bash
   open https://recoder.xyz/api/auth/signin
   # Click "Sign in with Google"
   ```

### Discord OAuth (Optional, 10 minutes)

1. **Create Application**
   - Visit: https://discord.com/developers/applications
   - Click "New Application"
   - Name: Recoder.xyz

2. **Configure OAuth2**
   - Go to OAuth2 → General
   - Add Redirect:
     - https://recoder.xyz/api/auth/callback/discord
   - Copy Client ID and Client Secret

3. **Save Credentials**
   ```bash
   DISCORD_CLIENT_ID=123456789012345678
   DISCORD_CLIENT_SECRET=abc123def456ghi789
   ```

---

## 💳 Payment Provider Setup

### Paddle Setup (30-60 minutes)

1. **Create Account**
   - Visit: https://paddle.com
   - Sign up for Paddle account
   - Choose plan (Classic or Billing)

2. **Create Products**
   - Go to: Catalog → Products
   - Create 3 products:
     
     **Product 1: Weekly**
     - Name: Recoder Weekly
     - Price: $10/week
     - Billing: Recurring (weekly)
     - Copy Product ID
     
     **Product 2: Monthly**
     - Name: Recoder Monthly  
     - Price: $20/month
     - Billing: Recurring (monthly)
     - Copy Product ID
     
     **Product 3: Pro**
     - Name: Recoder Pro
     - Price: $100/month
     - Billing: Recurring (monthly)
     - Copy Product ID

3. **Configure Webhook**
   - Go to: Developer Tools → Webhooks
   - Add Endpoint: https://recoder.xyz/api/paddle/webhooks
   - Select events:
     - `subscription.created`
     - `subscription.updated`
     - `subscription.cancelled`
     - `subscription.payment_succeeded`
     - `subscription.payment_failed`
   - Copy Webhook Secret

4. **Get API Keys**
   - Go to: Developer Tools → Authentication
   - Create API key
   - Copy API key and Vendor ID

5. **Save Credentials**
   ```bash
   PADDLE_VENDOR_ID=12345
   PADDLE_API_KEY=abc123def456...
   PADDLE_WEBHOOK_SECRET=pbx_wh_abc123...
   PADDLE_PRODUCT_WEEKLY=pro_01abc123
   PADDLE_PRODUCT_MONTHLY=pro_01def456
   PADDLE_PRODUCT_PRO=pro_01ghi789
   NEXT_PUBLIC_PADDLE_VENDOR_ID=12345
   NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
   # Change to 'production' when ready
   ```

6. **Test**
   - Use Sandbox environment first
   - Test card: 4242 4242 4242 4242
   - Visit: https://recoder.xyz/pricing
   - Click "Subscribe" → Complete checkout
   - Check webhook received in Paddle dashboard

### DODO Pay Setup (30 minutes)

**Note**: DODO Pay is a standard payment SDK, not cryptocurrency-specific.

1. **Create Account**
   - Visit: https://dodopay.com (or actual domain)
   - Sign up for account
   - Verify email and business details

2. **Get API Credentials**
   - Go to: Developer → API Keys
   - Create API key for Production
   - Create API key for Test
   - Copy both keys

3. **Configure Webhook**
   - Add endpoint: https://recoder.xyz/api/dodo/webhook
   - Select events:
     - `payment.succeeded`
     - `payment.failed`
     - `subscription.created`
     - `subscription.cancelled`
   - Copy Webhook Secret

4. **Save Credentials**
   ```bash
   DODO_PAY_API_KEY=dp_live_abc123...
   DODO_PAY_SECRET=dp_sec_abc123...
   DODO_PAY_WEBHOOK_SECRET=dp_wh_abc123...
   DODO_PAY_BASE_URL=https://api.dodopay.com/v1
   ```

5. **Test**
   - Use test mode first
   - Test payment flow
   - Verify webhook received

---

## 🚀 Deploy to Production

### Option 1: Vercel (Recommended for Next.js)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy App**
   ```bash
   cd app
   vercel login
   vercel --prod
   ```

3. **Configure Environment Variables**
   ```bash
   # Via CLI
   vercel env add DATABASE_URL production
   vercel env add NEXTAUTH_SECRET production
   # ... add all other env vars

   # Or via Vercel Dashboard:
   # https://vercel.com/your-project/settings/environment-variables
   ```

4. **Configure Domains**
   - Add custom domain: recoder.xyz
   - Vercel handles SSL automatically

5. **Deploy Backend API (if separate)**
   ```bash
   cd backend
   vercel --prod
   ```

6. **Configure API Domain**
   - Add custom domain: api.recoder.xyz

### Option 2: Railway

1. **Create Account**
   - Visit: https://railway.app
   - Sign up with GitHub

2. **Deploy via GitHub**
   - Connect your repo
   - Railway auto-detects Next.js
   - Set environment variables in dashboard
   - Custom domain: recoder.xyz

3. **Deploy Backend**
   - Create new project for backend
   - Connect repo
   - Set env vars
   - Custom domain: api.recoder.xyz

### Option 3: Docker + Your Server

1. **Build Docker Image**
   ```bash
   cd app
   docker build -t recoder-web:latest .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e DATABASE_URL="$DATABASE_URL" \
     -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
     # ... other env vars
     --name recoder-web \
     recoder-web:latest
   ```

3. **Set Up Nginx Reverse Proxy**
   ```nginx
   server {
     listen 80;
     server_name recoder.xyz;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

4. **Enable SSL with Certbot**
   ```bash
   sudo certbot --nginx -d recoder.xyz
   ```

---

## 🌐 DNS Configuration

### Cloudflare (Recommended)

1. **Add Domain**
   - Add recoder.xyz to Cloudflare
   - Update nameservers at domain registrar

2. **Create DNS Records**
   ```
   Type  Name     Target
   ────  ────     ──────
   A     @        <vercel-ip>
   A     web      <vercel-ip>
   A     api      <api-server-ip>
   
   OR use CNAME:
   CNAME @        cname.vercel-dns.com
   CNAME web      cname.vercel-dns.com
   CNAME api      api-deployment.vercel.app
   ```

3. **SSL/TLS Settings**
   - SSL/TLS mode: Full (strict)
   - Always Use HTTPS: ON
   - HSTS: Enable

4. **Enable Proxy**
   - Orange cloud icon for DDoS protection
   - Caching for static assets

### Without Cloudflare

1. **Add A Records**
   ```
   @ (root domain)      → Your server IP
   web.recoder.xyz      → Your server IP  
   api.recoder.xyz      → Your API server IP
   ```

2. **SSL Certificates**
   - Use Certbot for Let's Encrypt
   - Or use Vercel's automatic SSL

---

## 🧪 Post-Deployment Testing

### 1. Authentication Tests

```bash
# Test registration
curl -X POST https://recoder.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }'

# Expected: 200 OK with user data and tokens

# Test login
curl -X POST https://recoder.xyz/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'

# Expected: 200 OK with access_token

# Test OAuth (manual)
open https://recoder.xyz/api/auth/signin
# Click GitHub → Should authorize → Redirect back

# Test CLI auth page
open https://recoder.xyz/api/auth/cli?client_id=recoder-cli&redirect_uri=http://localhost:8080/callback&response_type=code&state=test123

# Test device flow
curl -X POST https://recoder.xyz/api/auth/cli \
  -H "Content-Type: application/json" \
  -d '{
    "action": "device_flow",
    "client_id": "recoder-cli"
  }'

# Expected: device_code, user_code, verification_uri
```

### 2. Payment Tests

```bash
# Test Paddle checkout (manual)
open https://recoder.xyz/pricing
# Click "Subscribe to Pro"
# Use Paddle test card: 4242 4242 4242 4242
# Complete checkout
# Verify webhook received

# Check user subscription updated
curl https://recoder.xyz/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: subscription_plan: "pro"
```

### 3. Usage Tracking Tests

```bash
# Make authenticated request
curl https://api.recoder.xyz/v1/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a React button",
    "model": "claude-3-sonnet"
  }'

# Check usage recorded
curl https://recoder.xyz/api/user/usage/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: usage stats with request count, tokens, cost
```

### 4. Quota Enforcement Tests

```bash
# Test FREE user quota
# Make 1,001 requests (over limit)
# Expected: 429 error with upgrade message

# Test PRO user
# Verify can make 50,000 requests
```

---

## 📊 Monitoring Setup

### 1. Vercel Analytics (Built-in)
- Already enabled with Vercel deployment
- View at: https://vercel.com/your-project/analytics

### 2. Sentry (Error Tracking)
```bash
npm install @sentry/nextjs

# Initialize
npx @sentry/wizard@latest -i nextjs
```

Add to `.env`:
```bash
SENTRY_DSN=https://...@sentry.io/...
```

### 3. PostHog (User Analytics)
```bash
npm install posthog-js

# Add to app
import posthog from 'posthog-js'
posthog.init('YOUR_KEY', { api_host: 'https://app.posthog.com' })
```

### 4. Database Monitoring
- Use Prisma Studio in production
- Set up database alerts (connection pool, slow queries)
- Monitor with DataDog or similar

---

## 🔒 Security Checklist

- [ ] All secrets are environment variables (not hardcoded)
- [ ] HTTPS enabled on all domains
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] SQL injection prevented (using Prisma)
- [ ] XSS protection enabled
- [ ] CSRF tokens used
- [ ] OAuth secrets rotated regularly
- [ ] Database backups configured
- [ ] Webhook signatures validated
- [ ] API keys encrypted at rest
- [ ] Session tokens expire (30 days)
- [ ] Refresh tokens rotate on use

---

## 🆘 Troubleshooting

### Database Connection Failed
```bash
# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host/db?sslmode=require

# Test connection
npx prisma db pull

# Check database logs
# Verify IP whitelisting (if using Vercel Postgres)
```

### OAuth Not Working
```bash
# Verify callback URLs EXACT match:
# GitHub: https://recoder.xyz/api/auth/callback/github
# Google: https://recoder.xyz/api/auth/callback/google

# Check environment variables
echo $GITHUB_CLIENT_ID
echo $GITHUB_CLIENT_SECRET

# Test OAuth URL
open https://recoder.xyz/api/auth/signin
```

### Paddle Webhook Not Received
```bash
# Check webhook URL in Paddle dashboard
# Should be: https://recoder.xyz/api/paddle/webhooks

# Test webhook manually
curl -X POST https://recoder.xyz/api/paddle/webhooks \
  -H "Content-Type: application/json" \
  -d '{"alert_name":"subscription_created"}'

# Check Paddle webhook logs
# Verify signature validation
```

### High Error Rate
```bash
# Check Sentry dashboard
# Review error logs
# Check database performance
# Verify API rate limits
```

---

## ✅ Launch Checklist

### Pre-Launch
- [ ] All tests passing
- [ ] Database migrations run
- [ ] OAuth providers configured
- [ ] Payment providers configured
- [ ] All environment variables set
- [ ] Domains configured with SSL
- [ ] Monitoring tools set up
- [ ] Backup system configured

### Launch Day
- [ ] Deploy to production
- [ ] Verify all pages load
- [ ] Test authentication flows
- [ ] Test payment checkout
- [ ] Monitor error rates
- [ ] Check webhook logs
- [ ] Test CLI authentication
- [ ] Verify email sending (if configured)

### Post-Launch (Week 1)
- [ ] Monitor user signups
- [ ] Check conversion rates
- [ ] Review error logs daily
- [ ] Optimize slow queries
- [ ] Fix critical bugs
- [ ] Collect user feedback

---

## 📞 Support Contacts

### Services Support
- **Vercel**: https://vercel.com/support
- **Paddle**: support@paddle.com
- **DODO Pay**: support@dodopay.com
- **GitHub OAuth**: https://support.github.com
- **Google OAuth**: https://support.google.com/cloud

### Internal
- **Development Issues**: GitHub Issues
- **User Support**: support@recoder.xyz
- **Emergency**: [Your phone/pager]

---

**Last Updated**: 2024-01-15  
**Version**: 1.0.0  
**Status**: Production Ready
