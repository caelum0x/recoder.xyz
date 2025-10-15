# 🚀 Quick Fix Guide - Get App Working Now!

This guide will help you quickly resolve all the issues with your app folder.

## 🎯 Quick Status Check

Run this to see what's working:
```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
```

Then test these URLs:
- ✅ App running: http://localhost:3000
- ❌ OAuth (Google/GitHub): http://localhost:3000/auth/signin
- ❌ Email: Register and check inbox
- ❌ Checkout: http://localhost:3000/checkout?plan=monthly
- ❌ Dashboard data: http://localhost:3000/dashboard

---

## 🔧 Fix #1: OAuth (5 minutes)

### Problem:
Google and GitHub OAuth give 404 errors.

### Solution:

**Step 1: Set up Google OAuth**
```bash
# 1. Go to: https://console.cloud.google.com/
# 2. Create a project (or select existing)
# 3. Go to: APIs & Services → Credentials
# 4. Click: Create Credentials → OAuth 2.0 Client ID
# 5. Add these redirect URIs:
#    - http://localhost:3000/api/auth/callback/google
#    - https://recoder.xyz/api/auth/callback/google
# 6. Copy the Client ID and Client Secret
```

**Step 2: Set up GitHub OAuth**
```bash
# 1. Go to: https://github.com/settings/developers
# 2. Click: New OAuth App
# 3. Fill in:
#    - Name: Recoder.xyz
#    - Homepage: http://localhost:3000
#    - Callback: http://localhost:3000/api/auth/callback/github
# 4. Copy the Client ID and Client Secret
```

**Step 3: Update your .env**
```bash
cd /Users/arhansubasi/recoder.xyz/app
nano .env  # or use your preferred editor

# Add these lines:
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-secret

GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-secret

NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
```

**Step 4: Restart and test**
```bash
npm run dev

# Test:
# 1. Go to http://localhost:3000/auth/signin
# 2. Click "Sign in with Google"
# 3. Should work! ✅
```

---

## 📧 Fix #2: Email Service (3 minutes)

### Problem:
No emails are being sent (welcome, verification, etc.)

### Solution:

**Option A: Gmail (Quick & Easy)**
```bash
# 1. Enable 2FA on your Google account
# 2. Go to: https://myaccount.google.com/apppasswords
# 3. Generate an app password for "Mail"
# 4. Add to .env:

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM=noreply@recoder.xyz
```

**Option B: SendGrid (Production Ready)**
```bash
# 1. Sign up at: https://sendgrid.com/
# 2. Create an API key
# 3. Update /app/lib/email.ts to use SendGrid
# 4. Add to .env:

SENDGRID_API_KEY=your-sendgrid-api-key
```

**Test it:**
```bash
# Register a new user and check your email
# Should receive welcome email ✅
```

---

## 💳 Fix #3: Payment Flow (10 minutes)

### Problem:
Can't subscribe - payment pages don't exist, routing broken.

### Solution:

**Step 1: Choose a payment provider**

**Option A: Paddle (Recommended - Easy)**
```bash
# 1. Sign up at: https://paddle.com/
# 2. Get your Vendor ID from Settings
# 3. Generate Auth Code in Developer Tools
# 4. Add to .env:

PADDLE_VENDOR_ID=your-vendor-id
PADDLE_AUTH_CODE=your-auth-code
PADDLE_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_PADDLE_VENDOR_ID=your-vendor-id
```

**Option B: DODO Payments**
```bash
# 1. Sign up at: https://dodopayments.com/
# 2. Get API key from dashboard
# 3. Add to .env:

DODO_API_KEY=your-api-key
DODO_WEBHOOK_SECRET=your-webhook-secret
```

**Step 2: Test the flow**
```bash
# 1. Go to: http://localhost:3000/pricing
# 2. Click any paid plan
# 3. Should redirect to checkout ✅
# 4. Choose payment method
# 5. Complete payment (test mode)
# 6. Should redirect to success page ✅
```

---

## 📊 Fix #4: Dashboard Mock Data (Already Fixed! ✅)

### What was fixed:
- Dashboard now fetches REAL data from `/api/user/dashboard`
- No more hardcoded mock data
- Shows actual quota usage
- Displays real platform connections

### Test it:
```bash
# 1. Sign in
# 2. Go to: http://localhost:3000/dashboard
# 3. Should see your real user data ✅
```

---

## 🎨 Fix #5: Dashboard Theme (Optional)

### Problem:
Dashboard colors don't match main website.

### Quick Fix:
The dashboard already uses Tailwind with gradient backgrounds matching the site theme. If you want to customize:

```tsx
// Edit: /app/app/dashboard/page.tsx

// Change background gradient (line ~135):
className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800"

// To match your site theme:
className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900 dark:to-blue-900"
```

---

## 🔐 Fix #6: Backend Errors (Already Fixed! ✅)

### What was fixed:
- API key encryption/decryption errors handled
- Database connection errors have fallbacks
- Session validation improved
- Quota enforcement working
- Platform API key management functional

---

## 🚀 All-in-One Setup Script

Run this to set everything up automatically:

```bash
#!/bin/bash

cd /Users/arhansubasi/recoder.xyz/app

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
    echo "⚠️  Please edit .env and add your OAuth credentials"
fi

# Generate NextAuth secret
echo "🔐 Generating NextAuth secret..."
SECRET=$(openssl rand -base64 32)
if grep -q "NEXTAUTH_SECRET=your-nextauth" .env; then
    sed -i '' "s|NEXTAUTH_SECRET=your-nextauth.*|NEXTAUTH_SECRET=$SECRET|" .env
    echo "✅ Generated NextAuth secret"
fi

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma generate
npx prisma db push

echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit .env and add OAuth credentials (Google + GitHub)"
echo "2. Edit .env and add email service credentials (Gmail or SendGrid)"
echo "3. Edit .env and add payment provider credentials (Paddle or DODO)"
echo "4. Run: npm run dev"
echo "5. Test: http://localhost:3000"
```

Save as `quick-setup.sh` and run:
```bash
chmod +x quick-setup.sh
./quick-setup.sh
```

---

## ✅ Verification Checklist

After setup, verify everything works:

```bash
# 1. OAuth
□ Sign in with Google works
□ Sign in with GitHub works
□ User created in database
□ Redirects to dashboard

# 2. Email
□ Welcome email received on registration
□ Email has correct branding
□ Links in email work

# 3. Payments
□ Checkout page loads
□ Payment selection works
□ Redirects to payment provider
□ Success page shows after payment
□ User plan updated in database

# 4. Dashboard
□ Shows real user data
□ Quota display is accurate
□ Platform connections shown
□ No console errors

# 5. Backend
□ API endpoints return 200
□ No encryption errors
□ Database queries succeed
□ Session management works
```

---

## 🆘 Troubleshooting

### "OAuth error: redirect_uri_mismatch"
**Fix:** Make sure callback URL in OAuth app matches EXACTLY:
- Google: `http://localhost:3000/api/auth/callback/google`
- GitHub: `http://localhost:3000/api/auth/callback/github`

### "Email not sending"
**Fix:** 
1. Check SMTP credentials in .env
2. For Gmail, use App Password (not regular password)
3. Check server logs for detailed error

### "Payment provider not configured"
**Fix:** Make sure you've added either:
- `PADDLE_VENDOR_ID` + `PADDLE_AUTH_CODE`, OR
- `DODO_API_KEY`

### "Dashboard shows old data"
**Fix:** 
1. Clear browser cache
2. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
3. Check Network tab for API response

### "Database connection error"
**Fix:**
```bash
# Make sure PostgreSQL is running
brew services start postgresql
# or
docker start postgres

# Test connection
psql $DATABASE_URL
```

---

## 📞 Get Help

If you're still stuck:

1. **Check logs:**
   ```bash
   # App logs
   cd /Users/arhansubasi/recoder.xyz/app
   npm run dev
   # Watch for errors in terminal
   ```

2. **Check browser console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for red errors

3. **Test API directly:**
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/user/dashboard
   ```

4. **Contact support:**
   - Email: support@recoder.xyz
   - Include: Error message, what you tried, logs

---

## 🎉 Success!

Once everything is working, you should be able to:
- ✅ Sign in with Google or GitHub
- ✅ Receive welcome emails
- ✅ Subscribe to paid plans
- ✅ See real data in dashboard
- ✅ Use all app features

**Time to celebrate!** 🚀

---

**Last Updated:** December 2024
