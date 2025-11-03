# 🚀 Quick Start: Authentication & Email Setup

## Current Status ✓

✅ All authentication code is implemented
✅ Session persistence configured (30-day cookies)
✅ Forgot password flow ready
✅ Email signup with temporary passwords ready
✅ Change password in settings ready

## What You Need to Do

### Step 1: Email Service Setup (Choose One)

#### Option A: Quick Test (No Setup - Use Console Logs)
**Current Setup:** Emails are logged to console for testing

**How to test:**
1. Start dev server: `npm run dev`
2. Sign up at http://localhost:3000/auth/signup
3. Check "Send me a temporary password via email"
4. Look in terminal for email output like:
   ```
   📧 ==================== EMAIL ====================
   To: user@example.com
   Subject: Your Temporary Password - Recoder.xyz
   TEMPORARY PASSWORD: abc123def456
   ================================================
   ```
5. Copy the password and sign in!

#### Option B: Resend Setup (5 minutes - Recommended)
**Free tier: 3,000 emails/month**

1. **Sign up:** Go to https://resend.com
2. **Get API Key:**
   - Click "API Keys" in dashboard
   - Click "Create API Key"
   - Copy the key (starts with `re_`)
3. **Add to `.env`:**
   ```bash
   RESEND_API_KEY=re_your_actual_api_key_here
   EMAIL_FROM=onboarding@resend.dev
   ```
4. **Restart server:** `npm run dev`

That's it! Real emails will now be sent.

#### Option C: Gmail SMTP (10 minutes)

1. **Enable 2-Step Verification:**
   - https://myaccount.google.com/security
   - Turn on 2-Step Verification

2. **Create App Password:**
   - https://myaccount.google.com/apppasswords
   - Select "Mail" → "Other (Custom name)" → "Recoder"
   - Copy the 16-character password

3. **Add to `.env`:**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-16-char-password-no-spaces
   SMTP_FROM=noreply@recoder.xyz
   ```

4. **Restart server:** `npm run dev`

---

### Step 2: Restart Development Server

**IMPORTANT:** Changes to `.env` and auth config require a restart!

```bash
# Kill current server (Ctrl+C in terminal)
# Then start again:
npm run dev
```

---

### Step 3: Test Authentication Flows

#### Test 1: Session Persistence ✓
1. Sign in at http://localhost:3000/auth/signin
2. Close browser completely
3. Reopen and go to http://localhost:3000/dashboard
4. **Expected:** Should still be logged in (30-day session)

#### Test 2: Email Signup with Temporary Password ✓
1. Go to http://localhost:3000/auth/signup
2. Check ✅ "Send me a temporary password via email"
3. Enter name and email
4. Click "Create Account"
5. **Check console logs or email** for temporary password
6. Sign in with that password
7. Go to http://localhost:3000/settings/security
8. Change your password

#### Test 3: Forgot Password ✓
1. Go to http://localhost:3000/auth/forgot-password
2. Enter your email
3. Click "Send Reset Link"
4. **Check console logs or email** for reset URL
5. Click the link (or copy URL to browser)
6. Enter new password
7. Sign in with new password

#### Test 4: Change Password in Settings ✓
1. Sign in
2. Go to http://localhost:3000/settings/security
3. Enter current password
4. Enter new password (twice)
5. Click "Change Password"
6. **Expected:** Redirected to signin, must use new password

---

### Step 4: Check for Errors

If something doesn't work:

1. **Check Terminal for Errors:**
   ```bash
   # Look for red error messages
   # Common issues:
   # - Prisma connection errors
   # - Email sending errors
   # - Auth configuration errors
   ```

2. **Check Browser Console:**
   ```bash
   # Press F12 → Console tab
   # Look for red errors
   ```

3. **Verify Database Connection:**
   ```bash
   cd /Users/arhansubasi/recoder.xyz/app
   npx prisma studio
   # Should open database viewer
   # Check if users/sessions tables exist
   ```

4. **Test Email Configuration:**
   ```bash
   # Create test file:
   cat > test-email.js << 'TESTEOF'
   const { sendTemporaryPasswordEmail } = require('./lib/email');
   
   sendTemporaryPasswordEmail('your-email@example.com', 'TEST123456')
     .then(() => console.log('✅ Email sent!'))
     .catch(err => console.error('❌ Error:', err));
   TESTEOF
   
   # Run test:
   node test-email.js
   ```

---

## Troubleshooting

### Problem: Session doesn't persist
**Solution:**
1. Clear browser cookies: Settings → Privacy → Clear browsing data → Cookies
2. Restart dev server
3. Sign in again
4. Check if cookie `recoder.session_token` is set (F12 → Application → Cookies)

### Problem: "Unauthorized" on every page
**Solution:**
1. Check terminal for database errors
2. Verify DATABASE_URL in .env is correct
3. Run: `npx prisma generate && npx prisma db push`
4. Restart server

### Problem: Emails not arriving
**Solution:**
1. **Console Mode:** Check terminal output for email logs
2. **Resend:** Verify API key is correct, check Resend dashboard for errors
3. **SMTP:** Check spam folder, verify credentials are correct

### Problem: "Invalid token" on password reset
**Solution:**
1. Token expires in 1 hour - generate new reset email
2. Make sure you copied the full URL from email/console
3. Check database: tokens are stored in `verifications` table

---

## Quick Commands

```bash
# Start dev server
npm run dev

# Check database
npx prisma studio

# Generate Prisma client (if errors)
npx prisma generate

# Push schema changes
npx prisma db push

# View logs
npm run dev | grep -E "Email|Error|✅|❌"

# Test database connection
npx prisma db execute --stdin <<< "SELECT NOW();"
```

---

## Current Configuration Summary

- ✅ **Better Auth**: Configured with 30-day sessions
- ✅ **Database**: PostgreSQL (Neon) connected
- ✅ **Email**: Logs to console (ready for Resend/SMTP)
- ✅ **Endpoints Ready:**
  - `/auth/signin` - Sign in
  - `/auth/signup` - Sign up (with email-only option)
  - `/auth/forgot-password` - Request reset
  - `/auth/reset-password?token=xxx` - Reset password
  - `/settings/security` - Change password
  - `/api/auth/verify-email` - Verify email
  - `/api/auth/signup-email` - Email-only signup
  - `/api/user/change-password` - Change password

---

## Next Steps After Testing

Once everything works locally:

1. **Set up Resend for production:**
   - Verify your domain at resend.com
   - Update EMAIL_FROM to use your domain
   
2. **Configure production environment variables**

3. **Set up DNS records** (SPF, DKIM, DMARC)

4. **Monitor email delivery** in Resend dashboard

---

**Need help?** Check the terminal logs first - they'll show exactly what's happening!

**Last Updated:** 2025-01-27
