# Routing Manifest — recoder.xyz Platform

Single source of truth for all subdomain → service mappings.

Last updated: 2026-02-11

---

## Subdomain Map

| Subdomain | Service | Port | Handler | SSL |
|---|---|---|---|---|
| `recoder.xyz` | recoder-web (Remix) | 3000 | Cloudflare Pages | Cloudflare |
| `recoder.xyz` | app (Next.js) | — | Vercel | Vercel |
| `api.recoder.xyz` | docker-backend (Express) | 3001 | Nginx / CF Worker | Let's Encrypt / CF |
| `agency.recoder.xyz` | recoder-agency (Next.js 16) | 3000 | Nginx | Let's Encrypt |
| `pm.recoder.xyz` | recoder-pm sub-apps (path-based) | 80 | Nginx | Let's Encrypt |
| `storage.pm.recoder.xyz` | MinIO | 9000 | Nginx | Let's Encrypt |
| `chat.recoder.xyz` | chat app | 3000 | Nginx | Let's Encrypt |
| `web.recoder.xyz` | published projects CDN | — | Nginx (static) | Let's Encrypt |
| `monitor.recoder.xyz` | Grafana | 3000 | Nginx | Let's Encrypt |

---

## PM Path-Based Routing (`pm.recoder.xyz`)

| Path | Upstream | Port |
|---|---|---|
| `/api/*` | pm_api | 3004 |
| `/portal/*` | pm_portal | 3001 |
| `/app/*` | pm_app | 3000 |
| `/agency/*` | agency (lazy DNS) | 3005 |
| `/` (catch-all) | pm_web | 3002 |

---

## Vercel Root Rewrites (`recoder.xyz`)

| Source | Destination |
|---|---|
| `/web/:path*` | `https://web.recoder.xyz/:path*` |
| `/chat/:path*` | `https://chat.recoder.xyz/:path*` |
| `/api/:path*` | `https://api.recoder.xyz/:path*` |

---

## Configuration Files

| File | Scope | Lines |
|---|---|---|
| `recoder-web/wrangler.toml` | Cloudflare Pages (Remix) | 14 |
| `vercel.json` | Root Vercel rewrites | 61 |
| `app/vercel.json` | App (Next.js) Vercel | 36 |
| `nginx/nginx-production.conf` | Main production reverse proxy | 495 |
| `recoder-pm/nginx/nginx.conf` | PM path-based router | 147 |
| `docker-compose.production-enhanced.yml` | Full production stack | 634 |
| `recoder-pm/docker-compose.yml` | PM services | 127 |
| `recoder-agency/docker-compose.yml` | Agency services | 32 |
| `infra/` (Pulumi) | Staging/prod Lightsail + ECS | — |

---

## Current Routing Layers (fragmented)

```
Internet
  │
  ├── Cloudflare Pages ─── recoder.xyz (Remix frontend)
  │
  ├── Cloudflare Worker ── api.recoder.xyz (edge routing, Pulumi-managed)
  │     └── Lightsail tunnel OR ECS ALB (ACTIVE_BACKEND switch)
  │
  ├── Vercel ──────────── recoder.xyz (Next.js app, auth authority)
  │     └── Rewrites /web /chat /api to subdomains
  │
  └── Nginx (Docker) ──── agency.recoder.xyz
                          pm.recoder.xyz (path-based sub-routing)
                          storage.pm.recoder.xyz
                          api.recoder.xyz (backend:3001)
                          chat.recoder.xyz
                          web.recoder.xyz (static CDN)
                          monitor.recoder.xyz (Grafana)
```

---

## Shared Security Policies

Applied in both Nginx and Vercel (keep in sync):

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

---

## Rate Limiting (Nginx)

| Zone | Rate | Burst | Scope |
|---|---|---|---|
| `api` | 10 req/s | 100 | `api.recoder.xyz` |
| `general` | 1 req/s | 20 | All other subdomains |

---

## Consolidation Target

Recommended: Move all subdomains behind **Cloudflare** as unified edge.

| Step | Action |
|---|---|
| 1 | Add Cloudflare DNS for all subdomains (proxied) |
| 2 | Terminate SSL at Cloudflare (remove Let's Encrypt) |
| 3 | Use Cloudflare Tunnel for all Docker services (replace direct Nginx exposure) |
| 4 | Move rate limiting to Cloudflare WAF rules |
| 5 | Keep Nginx as internal reverse proxy only (no public exposure) |
| 6 | Retire Vercel rewrites (Cloudflare handles subdomain routing) |

Benefits: single SSL provider, unified WAF, DDoS protection, one DNS dashboard, no port exposure.
