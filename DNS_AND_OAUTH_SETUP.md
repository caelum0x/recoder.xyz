# DNS and OAuth Setup Guide

## 1. Namecheap DNS Configuration

1. Login to Namecheap: https://www.namecheap.com
2. Go to Domain List → Find "recoder.xyz" → Click "Manage"
3. Go to "Advanced DNS" tab
4. Add these A Records:

| Type | Host | Value        | TTL       |
|------|------|--------------|-----------|
| A    | @    | 77.42.23.19  | Automatic |
| A    | www  | 77.42.23.19  | Automatic |
| A    | web  | 77.42.23.19  | Automatic |
| A    | api  | 77.42.23.19  | Automatic |

5. Wait 5-10 minutes for DNS propagation
6. Test: `ping recoder.xyz` should show 77.42.23.19

## 2. Update Environment Variables (After DNS Works)

SSH to server and update the URLs:

```bash
ssh root@77.42.23.19

# Update app .env
nano /home/recoder/recoder.xyz/app/.env
```

Change these lines:
```
NEXT_PUBLIC_APP_URL=https://recoder.xyz
NEXT_PUBLIC_API_URL=https://recoder.xyz
NEXTAUTH_URL=https://recoder.xyz
NEXT_PUBLIC_WEB_IDE_URL=https://web.recoder.xyz
```

```bash
# Update recoder-web .env
nano /home/recoder/recoder.xyz/recoder-web/.env.production
```

Change these lines:
```
BASE_URL=https://web.recoder.xyz
APP_URL=https://recoder.xyz
```

Restart services:
```bash
systemctl restart recoder-app recoder-web
```

## 3. Setup SSL Certificates (HTTPS)

After DNS is working:

```bash
ssh root@77.42.23.19

# Install certbot (if not already installed)
apt install -y certbot python3-certbot-nginx

# Get SSL certificates for all domains
certbot --nginx -d recoder.xyz -d www.recoder.xyz -d web.recoder.xyz -d api.recoder.xyz

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)
```

Certbot will automatically:
- Get SSL certificates
- Update Nginx config to use HTTPS
- Setup auto-renewal

## 4. Google OAuth Setup

### Step 1: Update Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Click Edit
4. Under "Authorized redirect URIs", add:
   ```
   https://recoder.xyz/api/auth/callback/google
   https://recoder.xyz/auth/callback/google
   http://77.42.23.19/api/auth/callback/google
   ```

### Step 2: Enable OAuth in .env

```bash
ssh root@77.42.23.19
nano /home/recoder/recoder.xyz/app/.env
```

Change:
```
ENABLE_OAUTH=true

# Add Google OAuth credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Restart:
```bash
systemctl restart recoder-app
```

## 5. GitHub OAuth Setup

Your current GitHub App settings:
- App ID: 2079807
- Client ID: Iv23liwzwgaRkVKkGlpu

### Update Callback URLs:

1. Go to: https://github.com/settings/apps
2. Find your app "recoder-xyz"
3. Update these URLs:
   - Homepage URL: `https://recoder.xyz`
   - Callback URL: `https://recoder.xyz/api/auth/callback/github`
   - Setup URL: Leave blank or `https://recoder.xyz/onboarding`

4. Also add to "Authorized redirect URIs":
   ```
   https://recoder.xyz/api/auth/callback/github
   https://recoder.xyz/auth/callback/github
   https://web.recoder.xyz/auth/callback/github
   http://77.42.23.19/api/auth/callback/github
   ```

## 6. Current Services

All services are running on:

| Service | URL | Port |
|---------|-----|------|
| Main App (Next.js) | http://77.42.23.19 | 3000 |
| Web IDE (Remix) | http://77.42.23.19:3001 | 3001 |
| Docker Backend | http://77.42.23.19:3100 | 3100 |

After DNS + SSL:
- Main: https://recoder.xyz
- Web IDE: https://web.recoder.xyz
- API: https://api.recoder.xyz (if you set it up)

## 7. Check Services

```bash
# SSH to server
ssh root@77.42.23.19

# Check status
systemctl status recoder-app recoder-web docker-backend

# View logs
journalctl -u recoder-app -f
journalctl -u recoder-web -f
journalctl -u docker-backend -f

# Restart if needed
systemctl restart recoder-app recoder-web docker-backend
```

## 8. Troubleshooting

### "Unknown auth page"
This happens because the app is redirecting to hardcoded URLs. After you:
1. Set up DNS (recoder.xyz → 77.42.23.19)
2. Get SSL certificates
3. Update .env files with correct URLs

This should resolve itself.

### "Google Auth not working"
OAuth is currently disabled (`ENABLE_OAUTH=false`). Follow step 4 above to enable it.

### "Page tried to open Vercel"
Old URLs are hardcoded in the build. After you update .env files and restart, rebuild:

```bash
# On your local machine
cd /Users/arhansubasi/recoder.xyz/recoder-web
pnpm run build

# Upload new build
rsync -avz build/ root@77.42.23.19:/home/recoder/recoder.xyz/recoder-web/build/

# Restart
ssh root@77.42.23.19 "systemctl restart recoder-web"
```

## 9. Quick Setup Order

**Right now (before DNS):**
1. ✅ Services are running on IP
2. Test: http://77.42.23.19

**After you set up DNS:**
1. Add A records in Namecheap (takes 5-10 min)
2. Run certbot to get SSL
3. Update .env files with https:// URLs
4. Update OAuth redirect URLs in Google/GitHub
5. Restart services
6. Test: https://recoder.xyz

Everything should work perfectly then!
