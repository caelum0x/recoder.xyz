# PLAN.md — Recoder Cloud / Telos (composed)

Read GOAL.md first. Details live in docs/.

> **Decided:** Telos lives at `recoder.xyz/telos` and builds **only the native Studio**. The Cloud half (sandbox, preview-URL, tenancy, quota, approval, MCP registry) already ships in `backend/src/domains/{cloud,conductor,engines}` — reuse it, do not rebuild. See **docs/15-overlap-with-recoder-xyz.md**.

## 0. Model

Compose. Do not merge vendor source. **Do not duplicate our own `domains/cloud` either** (see docs/15).

```
Recoder desktop / CLI / A2A
        │
        v
Telos control plane (THIS REPO)
  apps/api  apps/web  apps/cli  apps/mcp
        │
        ├── deploy driver     Coolify API | Kamal
        ├── sandbox driver    Daytona | E2B | Docker
        ├── native daemon     Bevy | Godot C# | Unity/UE cook
        └── playproof         frames + world JSON + VLM
```

## 1. Names

| Public | Internal |
|---|---|
| Recoder Cloud | telos-control |
| Recoder Studio / Native | recoder-native-d |
| Playproof | playproof |
| Codename | Telos |

Hosts: cloud.recoder.xyz, mcp.recoder.xyz, *.preview.recoder.xyz

## 2. License wall

Coolify Apache API only. Daytona: Cloud SDK or isolated AGPL process. E2B Apache later. OpenHands MIT core only. Godot MIT. Unity/Unreal proprietary BYO seat. Our code Apache-2.0.

## 3. Control plane

Hono + TS + Postgres API. Next.js web. CLI. MCP. Policy package. JS SDK.

Auth: GitHub OAuth + RECODER_API_KEY.

## 4. Native API

Ten verbs: new, open, edit, build, tick, frame, snapshot, reset, cook, logs.  
Full schema: docs/09-protocol.md  
Daemon: docs/12-daemon.md  
Engines: docs/10-engines.md

v1 drivers: sandbox-docker, deploy-coolify, studio-bevy, studio-godot (C#), playproof, cook-android.

## 5. Tools

Studio verbs + deploy.staging + deploy.prod (approval_id) + logs.fetch + secrets.needed + pr.comment.

Agents: game-author, game-playtest, game-cook, deploy, diagnose, preview.

## 6. Infra v1

Hetzner HEL1 CX33 (API+Coolify), CX23+volume (Postgres), GPU later for 3D Playproof. Cloudflare. Tailscale. No k8s. No Firecracker until multi-tenant games.

## 7. Playproof + cook

docs/04-playproof.md and docs/11-cook.md.  
Android on Godot C# first. iOS via Mac + human certs. No HTML5 target.

## 8. Recoder

docs/05-recoder-integration.md. Local daemon first, then cloud.

## 9. Phases

docs/06-roadmap.md.

## 10. Rules

1. One control plane
2. One home region for state
3. Ten verbs, not 200 MCP tools
4. No editor MCP on any public or product socket
5. Prod and stores need approval
6. Vendors stay vendors
7. Bevy + Godot C# before Unity. Unity before Unreal. Never HTML5 as ship target
8. Telos owns the native Studio. The Cloud half is `backend/src/domains` — Telos calls it, never re-implements it (docs/15)
