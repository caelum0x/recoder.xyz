# Recoder Infrastructure

Unified Pulumi Infrastructure-as-Code 

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    CLOUDFLARE                            │
                    │                                                          │
                    │   api.recoder.xyz ──► Worker (api-recoder-router)          │
                    │                          │                               │
                    │         ┌────────────────┴────────────────┐              │
                    │         ▼                                 ▼              │
                    │   ACTIVE_BACKEND=lightsail          (future: ecs)        │
                    │         │                                 │              │
                    │         ▼                                 ▼              │
                    │   api-lightsail.recoder.xyz         api-ecs.recoder.xyz    │
                    │   (Tunnel f4125d84)                (Direct to ALB)       │
                    └─────────┬─────────────────────────────────┬──────────────┘
                              │                                 │
                              ▼                                 ▼
┌─────────────────────────────────────────┐    ┌───────────────────────────────────┐
│         LIGHTSAIL (Prod)                │    │           ECS (Prod)              │
│   recoder-prod: 54.148.221.72              │    │   Cluster: recoder-ecs               │
│   128GB RAM, 32 vCPU                    │    │   4 tasks on 3 instances          │
│   Cloudflared → localhost:8000          │    │   ALB → Target Group → Tasks      │
└─────────────────────────────────────────┘    └───────────────────────────────────┘

┌─────────────────────────────────────────┐    ┌───────────────────────────────────┐
│         LIGHTSAIL (Dev)                 │    │         LIGHTSAIL (Staging)       │
│   recoder-dev: 35.87.190.182               │    │   recoder-staging: 54.184.54.33      │
│   8GB RAM, 2 vCPU                       │    │   8GB RAM, 2 vCPU                 │
│   Tunnel → dev-api.recoder.xyz           │    │   Tunnel → staging-api.recoder.xyz │
└─────────────────────────────────────────┘    └───────────────────────────────────┘
```
