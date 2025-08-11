# 🌐 Domain & SSL Setup Guide for Recoder.xyz

## 🎯 Overview

This guide walks you through setting up `recoder.xyz` domain with SSL certificates and CDN for production deployment.

## 📋 Prerequisites

- Domain purchased: `recoder.xyz`
- Server with public IP address
- SSH access to your production server
- DNS management access for your domain

## 🔧 Step 1: Server Setup

### VPS/Cloud Server Requirements
```bash
# Minimum Requirements for Production
RAM: 8GB minimum (16GB recommended)
CPU: 4 cores minimum (8 cores recommended)  
Storage: 100GB SSD minimum (500GB recommended)
Network: 1Gbps connection
OS: Ubuntu 22.04 LTS (recommended)
```

### Popular VPS Providers
```bash
# Recommended providers (in order of preference)
1. DigitalOcean ($40-80/month for production specs)
2. AWS EC2 ($50-100/month)
3. Google Cloud Compute ($45-90/month)
4. Vultr ($40-80/month)
5. Linode ($40-80/month)
```

## 🌍 Step 2: DNS Configuration

### Required DNS Records
```bash
# A Records (replace YOUR_SERVER_IP with actual IP)
Type    Name                Value               TTL
A       recoder.xyz         YOUR_SERVER_IP      300
A       www.recoder.xyz     YOUR_SERVER_IP      300
A       api.recoder.xyz     YOUR_SERVER_IP      300
A       chat.recoder.xyz    YOUR_SERVER_IP      300
A       monitor.recoder.xyz YOUR_SERVER_IP      300

# Optional: CNAME Records (alternative to A records)
CNAME   www                 recoder.xyz         300
CNAME   api                 recoder.xyz         300
CNAME   chat                recoder.xyz         300
CNAME   monitor             recoder.xyz         300
```

### DNS Provider Instructions

#### Cloudflare (Recommended)
```bash
1. Add domain to Cloudflare
2. Update nameservers at domain registrar
3. Add DNS records above
4. Set SSL/TLS mode to "Full (strict)"
5. Enable "Always Use HTTPS"
```

#### AWS Route 53
```bash
1. Create hosted zone for recoder.xyz
2. Add DNS records above
3. Update nameservers at domain registrar
4. Configure health checks (optional)
```

#### Google Cloud DNS
```bash
1. Create DNS zone for recoder.xyz
2. Add DNS records above  
3. Update nameservers at domain registrar
```

## 🚀 Step 3: Server Deployment

### Deploy Production Infrastructure
```bash
# 1. Clone repository on server
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz

# 2. Generate production secrets
./scripts/generate-secrets.sh > .env.production

# 3. Edit environment file with your API keys
nano .env.production

# 4. Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 5. Deploy production environment
sudo ./deploy-production.sh
```

## 🔒 Step 4: SSL Certificate Automation

The Docker setup includes automatic SSL certificates via Let's Encrypt:

```bash
# SSL certificates are automatically generated for:
- recoder.xyz
- www.recoder.xyz  
- api.recoder.xyz
- chat.recoder.xyz
- monitor.recoder.xyz

# Certificates auto-renew every 90 days
# Check certificate status:
sudo docker-compose -f docker-compose.production-enhanced.yml logs certbot
```

### Manual SSL Setup (if needed)
```bash
# If automated SSL fails, manually run:
sudo docker-compose -f docker-compose.production-enhanced.yml exec certbot certbot certonly \
  --webroot -w /var/www/html \
  --email admin@recoder.xyz \
  --agree-tos --no-eff-email \
  -d recoder.xyz \
  -d www.recoder.xyz \
  -d api.recoder.xyz \
  -d chat.recoder.xyz \
  -d monitor.recoder.xyz
```

## 🌐 Step 5: CDN Setup (Optional but Recommended)

### Cloudflare CDN (FREE)
```bash
# If using Cloudflare for DNS:
1. Enable "Proxied" status for DNS records
2. Configure caching rules:
   - Cache static assets (JS/CSS/images): 1 month
   - Cache HTML: 2 hours
   - API responses: No cache

# Cloudflare settings:
- SSL/TLS: Full (strict)
- Always Use HTTPS: ON
- Auto Minify: ON (JS, CSS, HTML)
- Brotli Compression: ON
- HTTP/2: ON
- HTTP/3 (QUIC): ON
```

### AWS CloudFront
```bash
# Create CloudFront distribution
1. Origin: recoder.xyz (custom origin)
2. Cache behaviors:
   - Default: Cache for 24 hours
   - /api/*: No cache, forward all headers
   - /_next/static/*: Cache for 1 year
3. Enable HTTP/2 and HTTP/3
4. Add all domains as aliases
5. Use ACM certificate
```

## 🔥 Step 6: Firewall Configuration

### UFW Firewall Setup
```bash
# Configure server firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### Security Hardening
```bash
# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Setup fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Setup automatic security updates  
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

## 📊 Step 7: Monitoring Setup

### Access Monitoring Services
```bash
# After deployment, access monitoring:
- Grafana Dashboard: https://monitor.recoder.xyz
  Login: admin / [GRAFANA_PASSWORD from .env.production]

- Prometheus: http://YOUR_SERVER_IP:9090 (internal)
- Application logs: docker-compose logs -f

# Health check endpoints:
- Web Platform: https://recoder.xyz/api/health
- Chat Platform: https://chat.recoder.xyz/api/health  
- Backend API: https://api.recoder.xyz/api/health
```

## 🧪 Step 8: Testing & Validation

### Production Testing Checklist
```bash
# Test all platforms
✓ https://recoder.xyz - Web platform loads
✓ https://chat.recoder.xyz - Chat platform loads
✓ https://api.recoder.xyz/api/health - API responds
✓ https://monitor.recoder.xyz - Monitoring accessible

# Test SSL certificates
curl -I https://recoder.xyz
curl -I https://api.recoder.xyz

# Test AI integration
✓ Together AI (FREE models) working
✓ Provider fallback working
✓ Local AI detection working

# Performance testing
✓ Page load times < 3 seconds
✓ API response times < 500ms
✓ SSL handshake < 100ms
```

## 🚨 Step 9: Backup & Recovery

### Automated Backups
```bash
# Database backups (daily at 2 AM)
sudo docker-compose -f docker-compose.production-enhanced.yml --profile backup up -d

# Manual backup
sudo docker-compose -f docker-compose.production-enhanced.yml exec postgres \
  pg_dump -U recoder recoder_production | gzip > backup-$(date +%Y%m%d).sql.gz

# Backup to cloud storage (recommended)
# Configure AWS S3 or Google Cloud Storage sync
```

## 📞 Step 10: Domain Registrar Configuration

### Popular Domain Registrars
```bash
# If using Cloudflare for DNS management:
1. Keep domain registered with current registrar (GoDaddy, Namecheap, etc.)
2. Change nameservers to Cloudflare nameservers:
   - name1.cloudflare.com
   - name2.cloudflare.com

# Direct DNS management at registrar:
1. Access DNS management panel
2. Add A records as shown in Step 2
3. Set TTL to 300 seconds for faster propagation
```

## ⚡ Quick Deployment Commands

### One-Command Production Setup
```bash
# Complete production deployment
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz
./scripts/generate-secrets.sh > .env.production
# Edit .env.production with your API keys
sudo ./deploy-production.sh
```

### DNS Propagation Check
```bash
# Check DNS propagation
dig recoder.xyz
nslookup api.recoder.xyz
curl -I https://recoder.xyz

# Global DNS propagation check
# Visit: https://www.whatsmydns.net/#A/recoder.xyz
```

## 🎯 Success Metrics

### Production Ready Checklist
```bash
✅ Domain resolves to server IP
✅ SSL certificates installed and valid
✅ All platforms accessible via HTTPS
✅ Monitoring dashboards working
✅ AI providers functional
✅ Database backups automated
✅ Security hardening complete
✅ CDN/caching configured
✅ Health checks passing
✅ Performance within targets
```

## 🆘 Troubleshooting

### Common Issues

#### SSL Certificate Issues
```bash
# Check certificate status
sudo docker-compose -f docker-compose.production-enhanced.yml exec nginx nginx -t
sudo docker-compose -f docker-compose.production-enhanced.yml logs certbot

# Manual certificate generation
sudo docker-compose -f docker-compose.production-enhanced.yml exec certbot certbot renew --dry-run
```

#### DNS Issues  
```bash
# Check DNS propagation
dig @8.8.8.8 recoder.xyz
dig @1.1.1.1 api.recoder.xyz

# Flush local DNS cache
sudo systemctl flush-dns
```

#### Performance Issues
```bash
# Check server resources
htop
df -h
free -m

# Check application logs
sudo docker-compose -f docker-compose.production-enhanced.yml logs --tail=100 web
sudo docker-compose -f docker-compose.production-enhanced.yml logs --tail=100 backend
```

## 📞 Support

### Emergency Contacts
```bash
Domain Issues: Contact domain registrar support
DNS Issues: Contact DNS provider support  
Server Issues: Contact VPS provider support
SSL Issues: Check Let's Encrypt status page

# Logs for debugging
sudo docker-compose -f docker-compose.production-enhanced.yml logs [service-name]
```

---

## 🎉 Final Step: Go Live!

Once all steps are complete:
1. ✅ DNS resolves correctly
2. ✅ SSL certificates are valid  
3. ✅ All platforms are accessible
4. ✅ Monitoring is working
5. ✅ AI providers are functional

**Your production Recoder.xyz deployment is LIVE!** 🚀

Visit https://recoder.xyz to see your AI-powered development platform in action!