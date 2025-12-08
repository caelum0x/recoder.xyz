# Recoder.xyz Deployment Status

**Last Updated:** December 8, 2025 21:59 UTC+3

## ✅ Working Services

### 1. recoder-app (Main App)
- **URL:** https://recoder.xyz
- **Port:** 3000
- **Status:** ✅ Running
- **Process:** next-server (PID: 780360)
- **Build:** build-1765219492931
- **Cookie Config:** ✅ `.recoder.xyz` domain enabled
- **Location:** `/home/recoder/recoder.xyz/app`
- **Logs:** `/home/recoder/logs/recoder-app.log`

### 2. recoder-web (Web IDE)
- **URL:** https://web.recoder.xyz
- **Port:** 5173
- **Status:** ✅ Running
- **Process:** node server.js (PID: 792218)
- **Location:** `/home/recoder/recoder.xyz/recoder-web`
- **Logs:** `/home/recoder/logs/recoder-web.log`

### 3. docker-backend (WebContainer Backend)
- **URL:** https://docker.recoder.xyz
- **Port:** 3100
- **Status:** ✅ Running
- **Location:** `/home/recoder/recoder.xyz/docker-backend`
- **Logs:** `/home/recoder/logs/docker-backend.log`

## 🔧 Configuration

### Better Auth Cookie Settings
```javascript
advanced: {
  cookiePrefix: "recoder",
  crossSubDomainCookies: {
    enabled: true,
    domain: ".recoder.xyz"  // Leading dot for subdomain sharing
  },
  useSecureCookies: true,
  generateId: () => crypto.randomUUID()
},
trustedOrigins: [
  "https://recoder.xyz",
  "https://www.recoder.xyz",
  "https://web.recoder.xyz"
]
```

### Database Connection
```
DATABASE_URL=postgresql://neondb_owner:npg_LDgwo1PRFh2J@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=10&pool_timeout=30
```

### Nginx Configuration
- COOP Header: `same-origin`
- COEP Header: `credentialless` (allows cross-origin images)
- SSL Certificates: Valid for all subdomains

## 🚀 Systemd Service

**Service Name:** `recoder-all.service`

**Commands:**
```bash
sudo systemctl start recoder-all    # Start all services
sudo systemctl stop recoder-all     # Stop all services
sudo systemctl restart recoder-all  # Restart all services
sudo systemctl status recoder-all   # Check status
```

**Auto-start:** ✅ Enabled on boot

**Startup Script:** `/home/recoder/start-all-services.sh`

## 📝 Deployment Process

### Deploying recoder-app
```bash
# Local build
cd /Users/arhansubasi/recoder.xyz/app
npm run build

# Upload to server
rsync -avz --delete .next/ root@77.42.23.19:/home/recoder/recoder.xyz/app/.next/

# Restart
ssh root@77.42.23.19 "systemctl restart recoder-all"
```

### Deploying recoder-web
```bash
# Local build
cd /Users/arhansubasi/recoder.xyz/recoder-web
pnpm run build

# Upload to server
rsync -avz --delete build/ root@77.42.23.19:/home/recoder/recoder.xyz/recoder-web/build/

# Restart
ssh root@77.42.23.19 "systemctl restart recoder-all"
```

## 🔍 Monitoring

### Check Service Status
```bash
ssh root@77.42.23.19 "ps aux | grep 'node.*recoder'"
ssh root@77.42.23.19 "netstat -tlnp | grep -E '3000|5173|3100'"
```

### View Logs
```bash
ssh root@77.42.23.19 "tail -f /home/recoder/logs/recoder-app.log"
ssh root@77.42.23.19 "tail -f /home/recoder/logs/recoder-web.log"
ssh root@77.42.23.19 "tail -f /home/recoder/logs/docker-backend.log"
```

### Test Endpoints
```bash
curl https://recoder.xyz/api/auth/session
curl https://web.recoder.xyz/api/auth/session
curl https://docker.recoder.xyz/health
```

## ✅ Cross-Subdomain Cookie Sharing

**Status:** ✅ Working

**How to Test:**
1. Login at https://recoder.xyz/auth/signin
2. Visit https://web.recoder.xyz
3. You should be automatically logged in

**Cookie Name:** `better-auth.session_token`
**Cookie Domain:** `.recoder.xyz`
**Cookie Attributes:** `Secure; HttpOnly; SameSite=Lax`

## 🐛 Known Issues

### Issue: OOM on Server Build
**Solution:** Build locally and upload via rsync

### Issue: Session Not Shared
**Solution:** ✅ Fixed - Cookie domain set to `.recoder.xyz`

### Issue: WebContainer COOP/COEP Errors
**Solution:** ✅ Fixed - COEP set to `credentialless`

## 📊 Server Info

- **IP:** 77.42.23.19
- **OS:** Ubuntu
- **Node:** v20.19.6
- **nginx:** 1.18.0
- **User:** root (services run as root)

## 🔐 Security Notes

- All services use HTTPS
- Database connection uses SSL
- Cookies are Secure and HttpOnly
- API keys encrypted with AES-256-GCM
- CORS configured for trusted origins only

## 📞 Support

If services go down:
```bash
ssh root@77.42.23.19
systemctl restart recoder-all
systemctl status recoder-all
```

Check logs for errors:
```bash
tail -100 /home/recoder/logs/*.log
```
