# @recoder/opencode-sdk

Recoder-branded opencode JS SDK: the generated OpenAPI client for the opencode
server API plus `createOpencodeServer()` / `createOpencodeTui()` process
lifecycle helpers (spawns the `opencode` binary via `cross-spawn`).

- `@recoder/opencode-sdk` — `createOpencode()`, `createOpencodeClient()`, `createOpencodeServer()`
- `@recoder/opencode-sdk/client` — client only
- `@recoder/opencode-sdk/server` — server/TUI spawners only
- `@recoder/opencode-sdk/v2` — v2 generated client + server helpers
- `@recoder/opencode-sdk/v2/types` — v2 wire types

## Provenance

Vendored from the opencode project (`ts/opencode/packages/sdk/js` in this
monorepo), upstream <https://github.com/sst/opencode>, package `@opencode-ai/sdk`
version 1.17.11. License: MIT (c) 2025 opencode — see [LICENSE](./LICENSE),
preserved from the original project.

Local changes:

- Renamed to `@recoder/opencode-sdk`, version reset to 0.1.0.
- Build switched from the upstream bun script to plain `tsc` (Node-compatible,
  no bun dependency; the runtime code already only used `cross-spawn` and
  `node:child_process`).
- Pruned upstream `script/` (bun codegen), `example/`, and sst env typings.
- Generated sources under `src/gen` and `src/v2/gen` are kept as-is; regenerate
  upstream if the opencode server API changes.
