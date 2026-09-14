# @recoder/sandbox-docker — resandbox orchestrator

The self-hosted sandbox control plane behind **Recoder Sandbox** (`resandbox`). It
speaks the E2B-compatible REST that the backend `resandbox.adapter` calls, backed by
local Docker containers. Zero npm dependencies (`node:http` + the `docker` CLI).

This is what `RESANDBOX_BASE_URL` points at.

## Run

```bash
node server.mjs           # PORT=7450 by default; requires Docker on PATH
# then, in the Recoder backend:
export RESANDBOX_BASE_URL=http://127.0.0.1:7450
```

Each sandbox is one container (`resandbox-<id>`) kept alive with `sleep infinity`;
`exec` runs inside it via `docker exec … sh -lc`. `templateID` selects the image
(`base` → `$RESANDBOX_DEFAULT_IMAGE`, default `node:22-bookworm-slim`).

## REST (matches the adapter)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok: true }` |
| POST | `/sandboxes` | `{ templateID, envVars, metadata }` | `{ sandboxID, url }` |
| GET | `/sandboxes/:id` | — | `{ state: running\|stopped\|paused }` |
| DELETE | `/sandboxes/:id` | — | `204` (idempotent) |
| POST | `/sandboxes/:id/exec` | `{ cmd, cwd, envs, timeoutMs }` | `{ exitCode, stdout, stderr, timedOut }` |

## Verification status

- `node --check` clean; HTTP layer smoke-tested (health 200, 404 routing, 400 on bad
  input, graceful 502 when Docker is unavailable — no crash).
- Full container lifecycle was NOT smoke-tested here: the local Docker/containerd store
  was returning I/O errors (0 images, corrupt blob store). Run the smoke test on a
  healthy Docker host:

```bash
node server.mjs &
curl -sXPOST localhost:7450/sandboxes -d '{"templateID":"alpine"}'    # -> {"sandboxID":"…"}
curl -sXPOST localhost:7450/sandboxes/<id>/exec -d '{"cmd":"echo hi"}' # -> exitCode 0, stdout "hi"
curl -sXDELETE localhost:7450/sandboxes/<id>
```

## Not production

Single-host, no tenancy/quotas/Firecracker isolation — those are enforced upstream by
`backend/src/domains/cloud` (tenancy + provisioner). This driver is the execution
substrate. Firecracker/multi-tenant hardening is future work (see GOAL non-goals).
