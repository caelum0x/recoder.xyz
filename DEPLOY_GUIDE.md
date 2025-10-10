# 🚀 Recoder.xyz Deployment Guide

## Quick Deploy to Vercel (5 minutes)

### Prerequisites
- Vercel account (free tier is fine)
- Domain `recoder.xyz` pointed to Vercel
- OAuth credentials (already configured)

---

## Step 1: Deploy via Vercel CLI

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Install Vercel CLI if needed
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

**OR** Deploy via Vercel Dashboard:
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Set root directory to `app`
4. Click "Deploy"

---

## Step 2: Configure Environment Variables in Vercel

Go to your Vercel project → Settings → Environment Variables

### Add these variables:

#### Application Settings
```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://recoder.xyz
NEXT_PUBLIC_SITE_URL=https://recoder.xyz
NEXT_PUBLIC_APP_NAME=Recoder.xyz
```

#### Authentication Secrets (Generate New for Production!)
```bash
# Generate these with: openssl rand -base64 32
NEXTAUTH_SECRET=<paste-generated-secret>
NEXTAUTH_URL=https://recoder.xyz
SESSION_SYNC_SECRET=<paste-generated-secret>
JWT_SECRET=<paste-generated-secret>
```

To generate secrets:
```bash
openssl rand -base64 32  # Run 3 times for each secret
```

#### GitHub OAuth
```bash
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=<get-from-github-oauth-app-settings>
NEXT_PUBLIC_GITHUB_ID=Ov23liVrw6X0xO8m2jPy
```

**ACTION REQUIRED**: Get GitHub Secret
1. Go to https://github.com/settings/developers
2. Click on your OAuth App
3. Generate new client secret
4. Copy and paste above

#### Google OAuth
```bash
GOOGLE_CLIENT_ID=716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c
GOOGLE_CLIENT_SECRET=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
NEXT_PUBLIC_GOOGLE_CLIENT_ID=716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c
```

#### Database (Vercel Postgres)
```bash
DATABASE_URL=<from-vercel-postgres-dashboard>
```

**ACTION REQUIRED**: Create Database
1. In Vercel Dashboard → Storage tab
2. Click "Create Database"
3. Select "Postgres"
4. Copy the `DATABASE_URL`
5. Paste above

#### Payment Providers (Optional for Now)
```bash
# Paddle
PADDLE_VENDOR_ID=
PADDLE_API_KEY=
PADDLE_PUBLIC_KEY=
PADDLE_WEBHOOK_SECRET=
NEXT_PUBLIC_PADDLE_VENDOR_ID=
NEXT_PUBLIC_PADDLE_ENVIRONMENT=production

# DODO Pay
DODO_PAY_API_KEY=
DODO_PAY_SECRET=
DODO_PAY_WEBHOOK_SECRET=
DODO_PAY_BASE_URL=https://api.dodo.dev
```

#### Security
```bash
# Generate with: openssl rand -hex 32
API_ENCRYPTION_KEY=<paste-generated-key>
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Step 3: Configure OAuth Redirect URLs

### GitHub OAuth
1. Go to https://github.com/settings/developers
2. Click your OAuth App
3. Update "Authorization callback URL" to:
   ```
   https://recoder.xyz/auth/oauth-success
   ```
4. Save changes

### Google OAuth
1. Go to https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Add to "Authorized redirect URIs":
   ```
   https://recoder.xyz/auth/oauth-success
   ```
4. Save changes

---

## Step 4: Set Up Database (After Deployment)

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Install Prisma CLI if needed
npm install -D prisma

# Create Prisma schema
npx prisma init

# Push schema to database (creates tables)
npx prisma db push

# Generate Prisma Client
npx prisma generate
```

**Schema to use**: See `AUTHENTICATION_IMPLEMENTATION_PLAN.md` for complete database schema

---

## Step 5: Verify Deployment

### Test These URLs:
1. ✅ Homepage: https://recoder.xyz
2. ✅ Sign In: https://recoder.xyz/auth/signin
3. ✅ Sign Up: https://recoder.xyz/auth/signup
4. ✅ Docs: https://recoder.xyz/docs
5. ✅ Blog: https://recoder.xyz/blog
6. ✅ Pricing: https://recoder.xyz/pricing
7. ✅ CLI: https://recoder.xyz/cli

### Check These Work:
- [ ] Pages load with proper styling (black/orange/purple theme)
- [ ] No PostCSS errors
- [ ] OAuth buttons appear
- [ ] Forms are styled correctly

### Test OAuth (Once Backend is Ready):
- [ ] GitHub login button works
- [ ] Google login button works
- [ ] Email/password sign up works
- [ ] Email/password sign in works

---

## Common Issues & Fixes

### Issue 1: "This site can't be reached"
**Fix**: Check domain DNS settings
```bash
# Verify DNS is pointing to Vercel
dig recoder.xyz

# Should show Vercel's IP address
```

### Issue 2: Site shows but no styling (looks like pure HTML)
**Fix**: PostCSS not building correctly
```bash
# In Vercel build settings:
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

### Issue 3: "Internal Server Error" 500
**Fix**: Check Vercel logs
1. Go to Vercel Dashboard
2. Click "Deployments"
3. Click latest deployment
4. Click "View Function Logs"
5. Look for errors

### Issue 4: OAuth not working
**Fix**: Check redirect URLs match exactly
- GitHub: Must be `https://recoder.xyz/auth/oauth-success`
- Google: Must be `https://recoder.xyz/auth/oauth-success`
- No trailing slashes!

### Issue 5: "Authentication Error: secretOrPrivateKey must have a value"
**Fix**: Environment variables not set properly
1. Verify in Vercel Dashboard → Settings → Environment Variables
2. Make sure `SESSION_SYNC_SECRET` is set
3. Redeploy after adding env vars

---

## Monitoring & Logs

### View Real-Time Logs
```bash
# Install Vercel CLI
npm i -g vercel

# Follow logs
vercel logs --follow
```

### Check Build Logs
1. Vercel Dashboard → Deployments
2. Click on latest deployment
3. View "Building" tab for build logs
4. View "Functions" tab for runtime logs

---

## Performance Optimization

### Enable Analytics (Free)
1. Vercel Dashboard → Analytics
2. Toggle on "Enable Analytics"
3. View real-time metrics

### Enable Speed Insights (Free)
1. Vercel Dashboard → Speed Insights
2. Toggle on "Enable Speed Insights"
3. Monitor page load performance

---

## Security Checklist

Before going live:
- [ ] All secrets are strong (32+ characters)
- [ ] Secrets are different from development
- [ ] OAuth redirect URLs are correct
- [ ] Database has proper access controls
- [ ] Rate limiting is enabled
- [ ] HTTPS is enforced (automatic with Vercel)
- [ ] No secrets in git repository
- [ ] Environment variables are set in Vercel only

---

## Rollback Strategy

If something breaks:
1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." menu → "Promote to Production"
4. Previous version goes live instantly

---

## Custom Domain Setup (Already Done)

Your domain `recoder.xyz` is already configured on Vercel. If you need to verify:

1. Vercel Dashboard → Settings → Domains
2. Should show:
   - `recoder.xyz` ✅
   - `www.recoder.xyz` ✅

If not configured:
1. Click "Add"
2. Enter `recoder.xyz`
3. Follow DNS configuration instructions
4. Wait for propagation (5-60 minutes)

---

## Post-Deployment Checklist

### Immediately After Deploy
- [ ] Visit https://recoder.xyz (should load)
- [ ] Check all pages load with proper styling
- [ ] Test navigation between pages
- [ ] Verify no console errors in browser
- [ ] Check Vercel logs for server errors

### Within 1 Hour
- [ ] Test sign up form (won't work until backend implemented)
- [ ] Test sign in form (won't work until backend implemented)
- [ ] Test OAuth buttons (won't work until backend implemented)
- [ ] Share with team for feedback
- [ ] Monitor Vercel logs for errors

### Within 24 Hours
- [ ] Implement auth backend
- [ ] Test complete sign up/sign in flow
- [ ] Set up payment system
- [ ] Create user dashboard
- [ ] Add monitoring alerts

---

## Next Steps After Deployment

1. **Implement Auth Backend** (See `AUTHENTICATION_IMPLEMENTATION_PLAN.md`)
2. **Set Up Paddle/DODO Pay** for payments
3. **Create User Dashboard** at `/dashboard`
4. **Implement CLI Authentication** for terminal access
5. **Add Documentation Content** to `/docs` pages
6. **Write Blog Posts** for `/blog`
7. **Add Legal Pages** (Terms, Privacy)

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **Project Docs**: See `AUTHENTICATION_IMPLEMENTATION_PLAN.md`

---

## Quick Commands Reference

```bash
# Deploy to production
vercel --prod

# View logs
vercel logs --follow

# Check deployment status
vercel ls

# Pull environment variables locally
vercel env pull

# Redeploy (if env vars changed)
vercel --prod --force

# Rollback to previous deployment
# (Do in Vercel Dashboard → Deployments)
```

---

## 🎉 You're Ready!

Once you deploy and configure the environment variables, your website will be live at https://recoder.xyz with:

✅ Beautiful black/orange/purple design
✅ All pages styled consistently  
✅ OAuth buttons ready
✅ Responsive on all devices
✅ Fast performance with Vercel Edge Network

The backend just needs to be implemented to make sign up/sign in actually work!

**Estimated time to deploy**: 10-15 minutes
**Estimated time to add backend**: 2-4 hours

Let's launch! 🚀
