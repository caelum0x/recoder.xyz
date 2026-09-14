# 05 — Recoder integration

Recoder desktop = parallel agents + worktrees.
This platform = machines those worktrees run on.

Do not merge this monorepo into recoder-code.

## Wire order

1. Local daemon: `recoder studio up` in the worktree. MCP → apps/mcp → 127.0.0.1:7430
2. Cloud daemon: API creates a Studio box. MCP → mcp.recoder.xyz
3. A2A: extend recoder-a2a with studio.tick / studio.cook / cloud.ship
4. Desktop pane last: Playproof clip on the workspace card

## CLI

```
recoder studio up
recoder studio build
recoder studio tick --tape playproof.yaml
recoder studio frame --out last.png
recoder studio cook android
recoder cloud ship --env staging
recoder cloud approve <id>
```

## MCP tools

Cloud: deploy.staging, deploy.prod, logs.fetch, secrets.needed, pr.comment  
Studio: ten verbs in 09-protocol.md

deploy.prod and store cook need approval_id.

## Auth

RECODER_API_KEY. Boxes get short-lived STUDIO_TOKEN. Player tick port is daemon-only.

## Worktrees

One workspace branch ↔ one studio_id or one local daemon root. No shared player across worktrees.
