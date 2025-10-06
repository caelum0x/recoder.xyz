# Vercel Deployment Guide - Recoder.xyz

## 🎉 Your App is Already Deployed!

**Deployment:** `app-d00it4xvq-arhansubas-projects.vercel.app`  
**Production Domains:**
- ✅ `recoder.xyz`
- ✅ `www.recoder.xyz`

**Status:** Ready ✅  
**Created:** Aug 23 by arhansuba

---

## ⚡ Quick Setup (5 Minutes)

### Step 1: Add Environment Variables

Visit your Vercel dashboard:
https://vercel.com/arhansubas-projects/app/settings/environment-variables

### Step 2: Add These Required Variables

```bash
# Authentication (Required)
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=https://recoder.xyz

# Database (Required)
DATABASE_URL=postgresql://user:password@host:5432/recoder_production

# Security (Required)
API_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
JWT_SECRET=<generate with: openssl rand -base64 32>

# App URL (Required)
NEXT_PUBLIC_APP_URL=https://recoder.xyz
```

### Step 3: Run Database Migrations

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Pull environment variables
vercel env pull .env.local

# Run migrations
npx prisma migrate deploy
```

### Step 4: Redeploy

```bash
vercel --prod
```

---

## 🚀 Or Use the Automated Script

```bash
cd /Users/arhansubasi/recoder.xyz
./deploy-to-vercel.sh
```

This script will:
- ✅ Install Vercel CLI (if needed)
- ✅ Generate all security secrets
- ✅ Prompt for environment variables
- ✅ Deploy to production
- ✅ Show next steps

---

## 🔗 Production URLs

Once configured, these will work:

- **Website:** https://recoder.xyz
- **OAuth:** https://recoder.xyz/api/auth/cli
- **Device Auth:** https://recoder.xyz/auth/device
- **API Keys:** https://recoder.xyz/settings/api-keys
- **Health Check:** https://recoder.xyz/api/health

---

## ✅ Test CLI Authentication

### Test Web OAuth
```bash
cd /Users/arhansubasi/recoder.xyz/packages/cli
recoder auth login --web
```
Should open: https://recoder.xyz/api/auth/cli

### Test Device Flow
```bash
recoder auth login --device-flow
```
Shows code to enter at: https://recoder.xyz/auth/device

### Test API Key
```bash
# Generate key at: https://recoder.xyz/settings/api-keys
recoder auth login --api-key <your-key>
```

---

## 🗄️ Database Setup

### Option 1: Vercel Postgres (Easiest)

```bash
# In your project directory
vercel postgres create

# Automatically sets DATABASE_URL
# Run migrations
npx prisma migrate deploy
```

### Option 2: External Database (Neon, Supabase)

1. Create database at https://neon.tech (recommended)
2. Copy connection string
3. Add to Vercel:
   ```bash
   vercel env add DATABASE_URL production
   # Paste your connection string
   ```
4. Run migrations:
   ```bash
   DATABASE_URL="your-string" npx prisma migrate deploy
   ```

---

## 📊 Monitor Your Deployment

### Vercel Dashboard
https://vercel.com/arhansubas-projects/app

### View Logs
```bash
# Real-time
vercel logs --follow

# Recent errors
vercel logs --filter error
```

### Check Health
```bash
curl https://recoder.xyz/api/health
```

---

## 🐛 Common Issues & Fixes

### Issue: "NEXTAUTH_SECRET is not defined"

```bash
# Generate secret
openssl rand -base64 32

# Add to Vercel
vercel env add NEXTAUTH_SECRET production

# Redeploy
vercel --prod
```

### Issue: "Database connection failed"

```bash
# Verify DATABASE_URL is set
vercel env ls

# Test connection locally
DATABASE_URL="your-url" npx prisma db push
```

### Issue: OAuth callback errors

Update callback URLs in OAuth providers:
- GitHub: `https://recoder.xyz/api/auth/callback/github`
- Google: `https://recoder.xyz/api/auth/callback/google`
- Discord: `https://recoder.xyz/api/auth/callback/discord`

---

## 🎯 Production Checklist

- [ ] Environment variables added to Vercel
- [ ] Database created and migrations run
- [ ] HTTPS enabled (automatic with Vercel ✅)
- [ ] OAuth providers configured
- [ ] Test web OAuth flow
- [ ] Test device flow
- [ ] Test API key generation
- [ ] Monitor logs for errors

---

## 🔐 Security Notes

✅ **HTTPS:** Automatic with Vercel  
✅ **Environment Variables:** Stored securely  
✅ **DDoS Protection:** Built-in  
✅ **Rate Limiting:** Configured in code  

---

## 📞 Quick Links

- Dashboard: https://vercel.com/arhansubas-projects/app
- Settings: https://vercel.com/arhansubas-projects/app/settings
- Logs: https://vercel.com/arhansubas-projects/app/logs
- Production: https://recoder.xyz

---

## 🎉 You're Ready!

Your Vercel deployment is configured. Just add environment variables and test!

**Next:** Run `./deploy-to-vercel.sh` or follow the steps above.
