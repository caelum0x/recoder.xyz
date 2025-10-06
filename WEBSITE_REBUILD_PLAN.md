# Website Rebuild Plan - Recoder.xyz

## 🎯 Current Status

### ✅ What Works
- Homepage with black/orange/purple theme looks awesome
- Basic auth infrastructure exists (95% complete from CLI_AUTH_STATUS.md)
- Pricing page structure exists
- Documentation page structure exists
- Backend API ready at https://recoder.xyz

### ❌ What Needs Fixing

1. **Theme Inconsistency**
   - Sign-in page: Using blue/slate colors (needs black/orange/purple)
   - Docs page: Using blue/slate colors (needs black/orange/purple)
   - CLI page: Not matching homepage theme

2. **Missing Pages**
   - Blog page
   - Terms of Service
   - Privacy Policy
   - Actual documentation content

3. **Pricing Updates Needed**
   - Add yearly billing option
   - Monthly: $20/month or $18/month (paid yearly = $216/year)
   - Pro: $100/month or $90/month (paid yearly = $1,080/year)
   - Integrate Paddle and DodoPay payment systems

4. **Authentication**
   - Sign-in/sign-up pages need enterprise-grade redesign
   - Must match black/orange/purple theme
   - Add proper documentation

5. **Get Started Flow**
   - CLI page opens but theme doesn't match
   - Need clear onboarding experience

---

## 🎨 Design System

### Colors
- **Primary Black**: `#000000`
- **Orange**: `#f97316` (orange-500), `#ea580c` (orange-600)
- **Purple**: `#9333ea` (purple-600), `#7c3aed` (purple-500)
- **Gray/White**: For text and borders
  - Text: `#d1d5db` (gray-300)
  - Muted: `#6b7280` (gray-500)
  - Borders: `rgba(255, 255, 255, 0.1)`

### Component Patterns
```tsx
// Header
fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl

// Button Primary
bg-orange-500 hover:bg-orange-600 rounded-lg

// Button Secondary  
border border-white/10 hover:border-white/20 rounded-lg

// Card
rounded-2xl border border-white/10 bg-black/50

// Gradient Text
bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent
```

---

## 💳 Pricing Structure

### Plans

1. **Free**
   - $0/forever
   - 100 AI tokens/month
   - 50 API calls/month
   - 1 active project
   - Basic AI models
   - Community support

2. **Weekly**
   - $10/week
   - 5,000 AI tokens/week
   - 500 API calls/week
   - Unlimited projects
   - All AI models
   - Priority support

3. **Monthly**
   - $20/month OR $18/month billed yearly ($216/year - 10% off)
   - 20,000 AI tokens/month
   - 2,000 API calls/month
   - Unlimited projects
   - All AI models
   - Priority support
   - Team collaboration (5 members)
   - **MOST POPULAR**

4. **Pro**
   - $100/month OR $90/month billed yearly ($1,080/year - 10% off)
   - 100,000 AI tokens/month (5x usage)
   - 10,000 API calls/month (5x)
   - Unlimited projects
   - All AI models + Beta access
   - Priority support + Slack
   - Team collaboration (15 members)
   - Custom AI models
   - Dedicated account manager

5. **Enterprise**
   - Custom pricing
   - Contact sales: sales@recoder.xyz
   - Unlimited everything
   - On-premise deployment
   - SLA guarantees
   - Custom integrations

---

## 🔐 Payment Integration

### Paddle Integration
```typescript
// lib/payment/paddle.ts
import { PaddleSDK } from '@paddle/paddle-js';

export const paddle = new PaddleSDK({
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
  token: process.env.PADDLE_API_KEY,
  sellerMode: 'live'
});

export const PADDLE_PRODUCT_IDS = {
  weekly: 'pri_01j...',
  monthly: 'pri_01j...',
  monthly_yearly: 'pri_01j...',
  pro: 'pri_01j...',
  pro_yearly: 'pri_01j...',
};
```

### DodoPay Integration (Backup)
```typescript
// lib/payment/dodo-pay.ts
export async function createDodoPayment(amount: number, plan: string) {
  const response = await fetch('https://api.dodopay.com/v1/payment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DODOPAY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount,
      currency: 'USD',
      plan,
      success_url: 'https://recoder.xyz/payment/success',
      cancel_url: 'https://recoder.xyz/pricing'
    })
  });
  return response.json();
}
```

---

## 📋 Implementation Phases

### Phase 1: Fix Theme Consistency (2-3 hours)
1. Update sign-in/sign-up pages to black/orange/purple theme
2. Update docs page to match theme
3. Update CLI page to match theme
4. Ensure all pages use consistent header/footer

### Phase 2: Complete Pricing (2-3 hours)
1. Add yearly billing toggle
2. Show savings for yearly plans
3. Integrate Paddle SDK
4. Integrate DodoPay as fallback
5. Add payment success/failure pages
6. Connect to backend for subscription management

### Phase 3: Build Missing Pages (3-4 hours)
1. Blog page with sample posts
2. Terms of Service page
3. Privacy Policy page
4. Individual documentation pages
5. About page
6. Contact page

### Phase 4: Complete Authentication (2-3 hours)
1. Enterprise-grade sign-in/sign-up redesign
2. Add forgot password flow
3. Add email verification
4. Add API key management UI
5. Add user dashboard

### Phase 5: Documentation (2-3 hours)
1. Getting Started guide
2. CLI documentation
3. Web platform docs
4. API reference
5. Code examples

---

## 📝 Content Requirements

### Blog Posts (Initial 3-5)
1. "Introducing Recoder: AI-Powered Production Code"
2. "CLI vs Web: Choosing Your Development Platform"
3. "Multi-AI Integration: Claude, GPT-4, and Gemini Working Together"
4. "From Idea to Deployment in 5 Minutes"
5. "Security Best Practices with AI Code Generation"

### Documentation Sections
1. **Getting Started**
   - Installation
   - First project
   - Authentication
   - Basic usage

2. **CLI Reference**
   - Commands
   - Natural language
   - Configuration
   - Examples

3. **Web Platform**
   - Interface overview
   - Project management
   - Collaboration features
   - Deployment

4. **API Documentation**
   - Authentication
   - Endpoints
   - Rate limits
   - SDKs

---

## 🚀 Deployment Checklist

### Before Launch
- [ ] All pages themed consistently
- [ ] Paddle/DodoPay integrated and tested
- [ ] Authentication fully functional
- [ ] Database connected (not mock)
- [ ] Email service configured
- [ ] Error tracking (Sentry)
- [ ] Analytics (Posthog/Mixpanel)
- [ ] Terms of Service live
- [ ] Privacy Policy live
- [ ] SSL certificates valid
- [ ] DNS configured correctly

### Testing
- [ ] Sign up flow
- [ ] Sign in flow
- [ ] Password reset
- [ ] Payment processing
- [ ] Subscription management
- [ ] CLI authentication
- [ ] API key generation
- [ ] Cross-browser testing
- [ ] Mobile responsive
- [ ] Performance testing

---

## ⏱️ Timeline

### Quick Path (12 hours total)
- Day 1 (6 hours): Phase 1 + Phase 2
- Day 2 (6 hours): Phase 3 + Phase 4

### Complete Path (15 hours total)
- Day 1 (5 hours): Phase 1 - Theme fixes
- Day 2 (5 hours): Phase 2 - Pricing + Payments
- Day 3 (5 hours): Phase 3 - Missing pages + Phase 4 - Auth polish

### Production Ready (20 hours total)
- All phases + thorough testing + documentation

---

## 🎯 Priority Order

1. **CRITICAL** - Fix sign-in/docs theme (users see inconsistency)
2. **HIGH** - Add yearly pricing + payment integration (revenue)
3. **HIGH** - Complete authentication (security)
4. **MEDIUM** - Add blog and documentation (SEO/help)
5. **MEDIUM** - Terms/Privacy pages (legal compliance)
6. **LOW** - Polish and additional features

---

## 📧 Contact Configuration

- **Support Email**: support@recoder.xyz
- **Sales Email**: sales@recoder.xyz
- **General Contact**: contact@recoder.xyz
- **GitHub**: https://github.com/recoder-xyz (placeholder for now)

---

## 🔒 Security Considerations

1. **Payment Security**
   - Use Paddle's hosted checkout (PCI compliant)
   - Never store credit card data
   - Use webhook signatures for verification

2. **Authentication**
   - Implement rate limiting
   - Use secure session management
   - Enable 2FA for enterprise plans
   - Audit logs for sensitive actions

3. **API Security**
   - Rate limit by plan tier
   - Use API key rotation
   - Monitor for abuse
   - Encrypt sensitive data

---

## 📊 Success Metrics

- Conversion rate from free to paid
- Churn rate per plan
- Average revenue per user (ARPU)
- Time to first payment
- Support ticket volume
- User satisfaction (NPS)

---

## 🚦 Next Steps

**Choose your path:**

A. **Fast Track** (Start revenue ASAP)
   1. Fix sign-in theme
   2. Add yearly pricing
   3. Integrate Paddle
   4. Deploy and test
   5. Get first customer!

B. **Complete** (Professional launch)
   1. All theme fixes
   2. Full payment integration
   3. All missing pages
   4. Complete documentation
   5. Comprehensive testing
   6. Marketing launch

C. **MVP** (Minimum viable)
   1. Just fix themes
   2. Basic Paddle integration
   3. Terms/Privacy pages
   4. Deploy
   5. Iterate based on feedback

**Recommendation: Start with Fast Track (A), then iterate to Complete (B)**
