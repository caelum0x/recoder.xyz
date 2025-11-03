# Email Service Setup Guide

This guide will help you configure email sending for authentication emails (password reset, temporary passwords, verification emails).

## Email Services Supported

The application supports two email services:
1. **Resend** (Recommended for production)
2. **SMTP** (Gmail, Outlook, custom SMTP servers)

## Quick Setup

### Option 1: Resend (Recommended)

**Why Resend?**
- ✅ Simple API, no SMTP configuration
- ✅ Better deliverability
- ✅ Easy to set up
- ✅ Free tier: 3,000 emails/month
- ✅ Built for developers

**Setup Steps:**

1. **Create Resend Account**
   - Go to [resend.com](https://resend.com)
   - Sign up with your email/GitHub

2. **Get API Key**
   - Go to [API Keys](https://resend.com/api-keys)
   - Click "Create API Key"
   - Give it a name (e.g., "Recoder.xyz Production")
   - Copy the API key (starts with `re_...`)

3. **Configure Environment**
   ```bash
   # In your .env file
   RESEND_API_KEY=re_your_api_key_here
   EMAIL_FROM=noreply@recoder.xyz
   ```

4. **Verify Domain (Optional for Production)**
   - Go to [Domains](https://resend.com/domains)
   - Add your domain (e.g., recoder.xyz)
   - Add DNS records provided by Resend
   - Once verified, update EMAIL_FROM to use your domain

That's it! 🎉

### Option 2: SMTP (Gmail Example)

**Setup Steps:**

1. **Enable 2-Step Verification** (Gmail)
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification

2. **Create App Password**
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and your device
   - Click "Generate"
   - Copy the 16-character password

3. **Configure Environment**
   ```bash
   # In your .env file
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-16-char-app-password
   SMTP_FROM=noreply@recoder.xyz
   ```

**Other SMTP Providers:**

- **Outlook/Hotmail:**
  ```bash
  SMTP_HOST=smtp-mail.outlook.com
  SMTP_PORT=587
  SMTP_USER=your-email@outlook.com
  SMTP_PASSWORD=your-password
  ```

- **Custom SMTP:**
  ```bash
  SMTP_HOST=smtp.your-domain.com
  SMTP_PORT=587  # or 465 for SSL
  SMTP_USER=your-username
  SMTP_PASSWORD=your-password
  ```

## Development Mode

**No Configuration Required!**

If you don't set up any email service in development, emails will be logged to the console instead:

```
📧 ==================== EMAIL ====================
To: user@example.com
Subject: Reset Your Password
From: Recoder.xyz <noreply@recoder.xyz>
HTML content length: 2847
================================================
```

You can copy the password/verification URL from the console logs for testing.

## Testing Email Setup

After configuration, test your setup:

1. **Sign Up with Email**
   - Go to `/auth/signup`
   - Check "Send me a temporary password via email"
   - Enter name and email
   - Check your email inbox

2. **Forgot Password**
   - Go to `/auth/forgot-password`
   - Enter your email
   - Check inbox for reset link

3. **Check Logs**
   ```bash
   # In development, check terminal output
   npm run dev

   # Look for:
   ✅ Email sent via Resend: abc123...
   # or
   ✅ Email sent via SMTP: <message-id>
   ```

## Troubleshooting

### Resend Issues

**Problem:** "API key is invalid"
- ✅ Check your API key starts with `re_`
- ✅ Make sure you copied the full key
- ✅ Regenerate if needed

**Problem:** "Domain not verified"
- ✅ For development, use resend.dev domain (works without verification)
- ✅ For production, verify your domain in Resend dashboard

### SMTP Issues

**Problem:** "Invalid login" (Gmail)
- ✅ Use App Password, not your regular password
- ✅ Enable 2-Step Verification first

**Problem:** "Connection timeout"
- ✅ Check SMTP_PORT (587 for TLS, 465 for SSL)
- ✅ Check your firewall/network settings

**Problem:** "Self-signed certificate"
- ✅ For development only, you can disable SSL verification
- ✅ Don't do this in production!

### General Issues

**Problem:** Emails not arriving
- ✅ Check spam folder
- ✅ Wait a few minutes (some providers have delays)
- ✅ Check console logs for errors
- ✅ Verify FROM email address is valid

**Problem:** "Development mode" in production
- ✅ Make sure you set NODE_ENV=production
- ✅ Make sure RESEND_API_KEY or SMTP credentials are set

## Email Templates

The application includes beautiful, branded email templates for:

- ✅ **Temporary Password** - Sent when user signs up with email-only option
- ✅ **Password Reset** - Sent when user requests password reset
- ✅ **Email Verification** - Sent to verify email addresses
- ✅ **Welcome Email** - Sent after successful registration

All templates include:
- Recoder.xyz branding (orange/purple gradient)
- Mobile-responsive design
- Clear call-to-action buttons
- Security warnings where appropriate

## Production Checklist

Before going live, ensure:

- [ ] Email service configured (Resend or SMTP)
- [ ] Domain verified (if using Resend)
- [ ] FROM email address is professional
- [ ] Test all email flows (signup, reset, verification)
- [ ] Check spam score (use [Mail Tester](https://www.mail-tester.com/))
- [ ] Set up SPF, DKIM, DMARC records for your domain
- [ ] Monitor email delivery in Resend dashboard
- [ ] Set up alerts for bounced emails

## Cost Estimates

### Resend
- Free: 3,000 emails/month, 100 emails/day
- Pro: $20/month for 50,000 emails
- Business: $150/month for 500,000 emails

### SMTP (Gmail)
- Free: Up to 500 emails/day
- Google Workspace: 2,000 emails/day per user
- Costs: $6/user/month

## Support

If you encounter issues:
1. Check console logs for detailed error messages
2. Verify environment variables are set correctly
3. Test with a different email provider
4. Contact Resend support (resend.com/support) or check SMTP provider docs

---

**Last Updated:** 2025-01-27
**Version:** 1.0.0
