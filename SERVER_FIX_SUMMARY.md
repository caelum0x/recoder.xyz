# 502 Bad Gateway Fix - Complete Resolution

**Date:** December 7, 2025  
**Server:** 77.42.23.19 (ubuntu-16gb-hel1-1)  
**Issue:** 502 Bad Gateway - nginx couldn't connect to Next.js backend

## Root Cause
The Next.js application on port 3000 was not running. Nginx was properly configured but had no upstream service to proxy to.

## Resolution Steps

### 1. SSH Access Setup
- Initial password authentication was failing
- Set up SSH key authentication for passwordless access
- Key location: `~/.ssh/recoder_deploy`

### 2. Diagnosis
```bash
# Nginx was running but backend was down
systemctl status nginx  # ✅ Active
netstat -tlnp | grep :3000  # ❌ Nothing listening
```

### 3. Fixed Permissions
```bash
chown -R recoder:recoder /home/recoder/recoder.xyz
```

### 4. Rebuilt Application
```bash
cd /home/recoder/recoder.xyz/app
rm -rf node_modules .next
pnpm install --force
pnpm prisma generate
pnpm build
```

### 5. Deployed with PM2
```bash
# Installed PM2 globally
npm install -g pm2

# Started app with PM2
pm2 start 'pnpm start' --name recoder-app --max-memory-restart 1G

# Configured auto-restart on boot
pm2 save
pm2 startup systemd -u recoder
```

## Current Status ✅

### Services Running
- **Nginx:** Active on ports 80/443
- **Next.js App:** Running on port 3000 via PM2
- **Backend API:** Running on separate process (PID 39262)

### Verification
```bash
# Direct access
curl -I http://77.42.23.19:3000  # 200 OK

# Via nginx
curl -I https://recoder.xyz  # 200 OK
```

### PM2 Management
```bash
# View status
pm2 list

# View logs
pm2 logs recoder-app

# Restart app
pm2 restart recoder-app

# Stop app
pm2 stop recoder-app
```

## Server Credentials
- **IP:** 77.42.23.19
- **User:** root
- **SSH Key:** ~/.ssh/recoder_deploy
- **Connection:** `ssh -i ~/.ssh/recoder_deploy root@77.42.23.19`

## Monitoring Commands
```bash
# Check all services
ssh -i ~/.ssh/recoder_deploy root@77.42.23.19 << 'EOF'
systemctl status nginx
su - recoder -c "pm2 list"
netstat -tlnp | grep -E ':(80|443|3000)'
EOF

# View nginx errors
ssh -i ~/.ssh/recoder_deploy root@77.42.23.19 "tail -50 /var/log/nginx/error.log"

# View app logs
ssh -i ~/.ssh/recoder_deploy root@77.42.23.19 "su - recoder -c 'pm2 logs recoder-app --lines 50'"
```

## Auto-Restart Configuration
PM2 is configured to:
- Auto-restart on crashes
- Auto-restart on memory limit (1GB)
- Start on server boot via systemd service `pm2-recoder.service`

## Next Steps (Optional)
1. Set up monitoring/alerting
2. Configure log rotation for PM2 logs
3. Add health check endpoint monitoring
4. Consider using PM2 cluster mode for load balancing
5. Set up automated backups

## Files Modified
- `/etc/systemd/system/pm2-recoder.service` - PM2 startup service
- `/home/recoder/recoder.xyz/app/package.json` - Updated dependencies
- `~/.ssh/recoder_deploy` - SSH key for deployment

## Issue Resolved ✅
The website https://recoder.xyz is now accessible and returning 200 OK responses.
