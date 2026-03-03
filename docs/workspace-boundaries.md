# Workspace Boundaries

This repository contains multiple ecosystems. Not every directory is part of the root `pnpm` workspace.

## Root workspace file
- `pnpm-workspace.yaml` at repo root is the source of truth for root-level `pnpm -w` commands.

## Included in root workspace (`packages:`)
- `docker-backend`
- `recoder-web`
- `app`
- `recoder-agents`
- `apps/mobile`
- `recoder-studio`
- `apps/ui.giselles.ai`
- `shared`
- `packages/*`
- `internal-packages/*`
- `scripts`

Legacy workspace note:
- `apps/ui.giselles.ai` remains the physical workspace path for now.
- The active product/package identity is `ui.recoder.xyz`.
- Do not rename or move the workspace path unless the full workspace, Docker, and script graph is migrated together.

## Explicitly excluded in root workspace (`exclude:`)
- Glob excludes: `**/node_modules/**`, `**/dist/**`, `**/.next/**`, `**/build/**`, `**/coverage/**`, `**/.turbo/**`, `**/.nx/**`
- Non-root/non-pnpm surfaces: `backend`, `infra`, `apps/desktop`
- Optional path: `packages-local-backup`

## Nested workspaces (own lock/workspace context)
These directories are managed independently and are intentionally not listed in root `packages:`:
- `openclaw`
- `recoder-agency`
- `recoder-pm`

## Policy
- Any explicit path under root `packages:` must exist.
- Any wildcard under root `packages:` must resolve to at least one match.
- Any non-glob path under root `exclude:` must either:
  - exist,
  - be an approved optional path, or
  - be a documented legacy exception.
- Required first-party surfaces must expose `test`, `lint`, and `typecheck`/`check-types` scripts.

## CI enforcement
- `scripts/validate-workspace-manifest.sh`
- `scripts/validate-first-party-scripts.sh`

Both run in required CI via `.github/workflows/master-pipeline.yml`.
