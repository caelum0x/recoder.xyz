# @recoder/opencode-plugin

Recoder-branded opencode plugin/hook contract — the types and helpers for code
that runs inside the opencode engine:

- `@recoder/opencode-plugin` — `Plugin`, `Hooks` (including `permission.ask`),
  `WorkspaceAdapter`, provider/auth loader contracts
- `@recoder/opencode-plugin/tool` — `tool()` definition helper (zod args)
- `@recoder/opencode-plugin/v2/effect` — v2 Effect-based plugin surface
- `@recoder/opencode-plugin/v2/promise` — v2 promise-based plugin surface

`BunShell` in `src/shell.ts` is a locally defined type-only interface — this
package has no bun runtime dependency.

## Provenance

Vendored from the opencode project (`ts/opencode/packages/plugin` in this
monorepo), upstream <https://github.com/sst/opencode>, package
`@opencode-ai/plugin` version 1.17.11. License: MIT (c) 2025 opencode — see
[LICENSE](./LICENSE), preserved from the original project.

Local changes:

- Renamed to `@recoder/opencode-plugin`, version reset to 0.1.0.
- Pruned app-coupled files: `src/tui.ts` (opentui peer surface, plus its
  `./tui` export and `@opentui/*` peer deps), `src/example.ts`,
  `src/example-workspace.ts`.
- Depends on `@recoder/opencode-sdk` (workspace) instead of the upstream
  `@opencode-ai/sdk`.
- `effect` is declared as `^3.21.0` instead of upstream's `4.0.0-beta.83`: the
  monorepo root pnpm override pins `effect` to `>=3.20.0` (v3), and this
  package's effect usage type-checks and builds cleanly against 3.21.0 (unlike
  `@recoder/opencode-schema`, which needs the v4 API and uses an alias).
