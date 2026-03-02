# Workspace Boundaries

This repository contains multiple ecosystems. Not every directory is part of the root `pnpm` workspace.

## Root workspace file
- `pnpm-workspace.yaml` at repo root is the source of truth for root-level `pnpm -w` commands.

## Included in root workspace (`packages:`)
- `docker-backend`
- `recoder-web`
- `app`
- `recoder-frontend`
- `apps/mobile`
- `recoder-studio`
- `apps/ui.giselles.ai`
- `shared`
- `packages/*`
- `internal-packages/*`
- `scripts`

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
