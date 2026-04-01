---
title: Self-Hosting Guide
description: Deploy Recoder on your own infrastructure.
---

Recoder runs on a single server with Docker Compose. Minimum requirements: 4 vCPU, 16GB RAM.

## Prerequisites

- Docker + Docker Compose v2
- PostgreSQL 17 (can be on the same server or external)
- Domain with DNS pointed to your server
- SSL certificates (Cloudflare or Let's Encrypt)

## Quick Start

```bash
git clone https://github.com/recoder-xyz/recoder.git
cd recoder

# Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials, API keys, and domain

# Start all services
docker compose -f docker-compose.deploy.yml up -d
```

## Services Overview

The platform runs ~15 containers:

| Service | Port | RAM | Purpose |
|---------|------|-----|---------|
| docker-backend | 3100 | 512M | Core API + A2A bridge |
| redis | 6379 | 256M | Task state + pub/sub |
| qdrant | 6333 | 1G | Vector store (memory + code search) |
| meilisearch | 7700 | 512M | Full-text search |
| nats | 4222 | 64M | Event bus (JetStream) |
| victoriametrics | 9090 | 256M | Metrics (Prometheus-compatible) |
| grafana | 3003 | 128M | Dashboards |
| chatwoot | 3005 | 1G | Omnichannel inbox |
| openmeter | 8888 | 256M | Usage metering |
| flagsmith | 8001 | 512M | Feature flags |
| umami | 3006 | 256M | Web analytics |

## Environment Variables

Key variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql://recoder:password@localhost:5432/recoder_main

# Auth
BETTER_AUTH_SECRET=<random-64-chars>

# AI providers
OPENROUTER_API_KEY=sk-or-...

# Services
MEILI_MASTER_KEY=<random-key>
CHATWOOT_SECRET=<random-key>
FLAGSMITH_SECRET=<random-key>
UMAMI_SECRET=<random-key>
REDIS_PASSWORD=<password>

# Domain
DOMAIN=yourdomain.com
```

## nginx Configuration

Each surface needs a server block. Example for `agents.yourdomain.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name agents.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.com.pem;
    ssl_certificate_key /etc/ssl/private/yourdomain.com.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## PM2 App Runtime

Frontend apps run under PM2 (not Docker):

```bash
pm2 start ecosystem.config.js
pm2 save
```
