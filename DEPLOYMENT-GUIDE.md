# 🚀 RECODER.XYZ DEPLOYMENT & TESTING GUIDE

## 📋 Table of Contents

1. [🎯 Overview](#-overview)
2. [⚙️ Prerequisites](#-prerequisites)
3. [🔑 Environment Setup](#-environment-setup)
4. [🚀 Deployment Steps](#-deployment-steps)
5. [🧪 Testing Each Project](#-testing-each-project)
6. [💰 Payment Flow Testing](#-payment-flow-testing)
7. [🔍 Launch Readiness Checklist](#-launch-readiness-checklist)

---

## 🎯 Overview

Recoder.xyz consists of 5 integrated products:
- **CLI Router** (`packages/recoder-cli-router`) - Main CLI entry point
- **CLI Tool** (`packages/cli`) - Core AI-powered CLI
- **VS Code Extension** (`recoder-extension`) - IDE integration
- **Web Platform** (`recoder-web`) - Browser-based interface
- **Chat Platform** (`recoder-chat`) - Conversational AI interface

---

## ⚙️ Prerequisites

### Required Accounts & Services:
- **Dodo Pay**: Payment processing (API key provided)
- **Vercel**: Web hosting and deployment
- **PostgreSQL**: Database (Supabase/Neon recommended)
- **AI Providers**: Claude, Groq, Gemini, OpenAI, etc.

### Development Tools:
```bash
# Node.js 18+ and pnpm
node --version  # Should be 18+
npm install -g pnpm

# Vercel CLI
npm install -g vercel

# Docker (for local database)
docker --version
```

---

## 🔑 Environment Setup

### 1. Core Environment Variables

Create `.env.production` in root directory:

```bash
# Database
DATABASE_URL="postgresql://username:password@host:5432/recoder"
DIRECT_URL="postgresql://username:password@host:5432/recoder"

# Authentication
NEXTAUTH_URL="https://recoder.xyz"
NEXTAUTH_SECRET="your-super-secret-key-here"

# Dodo Pay (CONFIGURED)
DODO_PAYMENTS_API_KEY="walGG6HxdNDTWvKX.Ib9syRwCL1NFzXZyM2leDRKHQC_9Ra35DKHu1mMAFqX8l"
DODO_API_BASE_URL="https://api.dodopayments.com"
DODO_WEBHOOK_SECRET="your_webhook_secret_here"
NEXT_PUBLIC_RETURN_URL="https://recoder.xyz/subscription/success"

# AI Providers (ADD YOUR KEYS)
ANTHROPIC_API_KEY="sk-ant-xxxxx"
GROQ_API_KEY="gsk_xxxxx"
GOOGLE_API_KEY="AIzxxxxx" 
OPENAI_API_KEY="sk-xxxxx"
MISTRAL_API_KEY="xxxxx"
TOGETHER_API_KEY="xxxxx"
OPENROUTER_API_KEY="sk-or-xxxxx"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Storage & CDN
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### 2. Database Setup

```bash
# Initialize database
cd recoder-web
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

---

## 🚀 Deployment Steps

### 1. Deploy Web Platform (Main App)

```bash
cd recoder-web
vercel --prod

# Set environment variables in Vercel dashboard
vercel env add ANTHROPIC_API_KEY
vercel env add DODO_PAYMENTS_API_KEY
# ... add all environment variables
```

### 2. Deploy Chat Platform

```bash
cd recoder-chat  
vercel --prod

# Link to same environment variables
vercel env pull
```

### 3. Deploy CLI to NPM

```bash
cd packages/cli
npm version patch
npm publish

# Test installation
npm install -g recoder-cli
recoder --version
```

### 4. Deploy VS Code Extension

```bash
cd recoder-extension/src
npm run package
vsce publish

# Or manual upload to Visual Studio Marketplace
```

### 5. Configure DNS

Point domains to Vercel deployments:
```bash
recoder.xyz          → Main web platform
chat.recoder.xyz     → Chat platform  
api.recoder.xyz      → API endpoints
docs.recoder.xyz     → Documentation
```

---

## 🧪 Testing Each Project

### 1. CLI Tool Testing

```bash
# Install and authenticate
npm install -g recoder-cli
recoder auth login

# Test basic functionality
recoder "create a simple React component"
recoder "generate a Python function to sort an array"
recoder --help

# Test with different AI providers
recoder --model claude "complex logic problem" 
recoder --model groq "simple web component"
```

**Expected Results:**
- ✅ Authentication works
- ✅ Code generation produces valid output
- ✅ Multiple AI providers accessible
- ✅ Usage limits enforced per subscription

### 2. VS Code Extension Testing

```bash
# Install from marketplace or local VSIX
code --install-extension recoder.vsix

# Test features:
# 1. Command palette: "Recoder: Generate Code"
# 2. Right-click context menu
# 3. Inline suggestions
# 4. Authentication sync with web
```

**Expected Results:**
- ✅ Extension activates without errors
- ✅ Authentication syncs with web platform
- ✅ Code suggestions work in real-time
- ✅ Usage tracking reflects in dashboard

### 3. Web Platform Testing

Navigate to `https://recoder.xyz`:

```bash
# Test user flows:
1. Sign up / Sign in
2. Free tier functionality
3. Subscription upgrade flow
4. Dashboard usage tracking
5. Product integration links
```

**Expected Results:**
- ✅ User registration/login works
- ✅ Dashboard shows accurate usage
- ✅ AI chat interface functional
- ✅ Project management works
- ✅ Links to other products work

### 4. Chat Platform Testing  

Navigate to `https://chat.recoder.xyz`:

```bash
# Test features:
1. Real-time AI chat
2. Code artifact generation
3. Multi-model switching
4. Chat history sync
5. Usage limit enforcement
```

**Expected Results:**
- ✅ Real-time messaging works
- ✅ Code artifacts render correctly
- ✅ Model switching functional
- ✅ Usage syncs across platforms

---

## 💰 Payment Flow Testing

### End-to-End Payment Test:

1. **Start Free Trial**
   ```bash
   # Create account on recoder.xyz
   # Use free tier (20 CLI requests, 30 chat messages)
   # Verify limits are enforced
   ```

2. **Upgrade to Premium ($20/month)**
   ```bash
   # Go to /pricing
   # Click "Subscribe to PREMIUM"
   # Complete Dodo Pay checkout
   # Verify redirect to success page
   ```

3. **Webhook Processing**
   ```bash
   # Check /api/subscription/webhook endpoint
   # Verify subscription status updates
   # Confirm usage limits increased
   ```

4. **Usage Tracking**
   ```bash
   # Use CLI, Extension, Web, Chat
   # Check dashboard for accurate usage
   # Verify cross-platform sync
   ```

### Test Payment Scenarios:

- ✅ **Successful Payment**: Premium upgrade works
- ✅ **Failed Payment**: Graceful error handling
- ✅ **Cancellation**: Subscription cancelled correctly
- ✅ **Webhook Issues**: Manual verification process

---

## 🔍 Launch Readiness Checklist

### ✅ Infrastructure
- [ ] All domains configured and SSL active
- [ ] Database migrations complete and seeded
- [ ] Environment variables set in production
- [ ] CDN/storage configured
- [ ] Monitoring and logging active

### ✅ AI Integration  
- [ ] All AI provider APIs working
- [ ] Smart routing implemented
- [ ] Usage tracking accurate
- [ ] Rate limiting enforced
- [ ] Cost monitoring in place

### ✅ Authentication & Security
- [ ] OAuth providers configured
- [ ] Session management working
- [ ] Cross-platform auth sync
- [ ] API authentication secure
- [ ] CORS policies correct

### ✅ Payment System
- [ ] Dodo Pay integration complete
- [ ] All subscription tiers working
- [ ] Webhook processing reliable  
- [ ] Usage limits enforced
- [ ] Billing sync accurate

### ✅ User Experience
- [ ] All 5 products accessible
- [ ] Dashboard shows real data
- [ ] Onboarding flow smooth
- [ ] Documentation complete
- [ ] Error handling graceful

### ✅ Performance
- [ ] Page load times < 2s
- [ ] API response times < 500ms
- [ ] Database queries optimized
- [ ] Caching implemented
- [ ] CDN distributing assets

---

## 🚨 Known Issues & Solutions

### Issue 1: AI Provider Rate Limits
**Problem**: Hitting rate limits during peak usage
**Solution**: Implement exponential backoff and model fallbacks

### Issue 2: Webhook Delivery Failures  
**Problem**: Dodo Pay webhooks not delivering
**Solution**: Manual subscription verification API endpoint

### Issue 3: Cross-Platform Auth Sync
**Problem**: CLI not syncing with web authentication
**Solution**: Token refresh mechanism and manual re-auth

---

## 📞 Support & Troubleshooting

### Emergency Contacts:
- **Technical Issues**: dev@recoder.xyz
- **Payment Issues**: billing@recoder.xyz  
- **Enterprise Sales**: sales@recoder.xyz

### Debug Commands:
```bash
# Check CLI authentication
recoder auth status

# Test API connectivity
curl -H "Authorization: Bearer $TOKEN" https://api.recoder.xyz/health

# Verify database connection
npx prisma studio

# Check payment webhook logs
vercel logs --project recoder-web --since 1h
```

---

## 🎉 Launch Sequence

### Go-Live Steps (Execute in Order):

1. **Final Environment Check** (5 minutes)
   ```bash
   ./scripts/pre-launch-check.sh
   ```

2. **Deploy All Services** (10 minutes)
   ```bash
   ./deploy.sh production
   ```

3. **DNS Cutover** (5 minutes)
   - Update DNS records to point to production
   - Verify SSL certificates active

4. **Payment System Activation** (2 minutes)
   - Configure Dodo Pay webhook URL
   - Test one live transaction

5. **Monitoring Activation** (3 minutes)
   - Enable error tracking
   - Set up usage alerts
   - Activate uptime monitoring

6. **Announcement** (1 minute)
   - Update status page to "Live"
   - Send launch announcement
   - Monitor for first users

**Total Launch Time: 26 minutes** ⏱️

---

## 🏆 Success Metrics

Track these metrics post-launch:

- **User Registrations**: Target 100+ in first week
- **Conversion Rate**: Free → Paid (target 5%)
- **System Uptime**: 99.9%+
- **API Response Times**: <500ms average  
- **Payment Success Rate**: 98%+
- **User Satisfaction**: Monitor support tickets

---

**🚀 You're ready to launch the next generation of AI development tools!**