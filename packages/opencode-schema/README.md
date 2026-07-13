# @recoder/opencode-schema

Recoder-branded Effect Schema definitions for the entire opencode wire model:
session, message/part, event, permission, question, model, provider, pty,
workspace, lsp-event, mcp-event, and the v1 legacy contracts.

This is distinct from `@recoder/agent-schemas` (Recoder Agent OS control-plane
contracts: approvals, artifacts, memory candidates). This package describes the
opencode engine wire protocol.

```ts
import { Session, Permission, Event } from "@recoder/opencode-schema"
// or per-module subpaths:
import { Agent } from "@recoder/opencode-schema/agent"
```

## Provenance

Vendored from the opencode project (`ts/opencode/packages/schema` in this
monorepo), upstream <https://github.com/sst/opencode>. License: MIT (c) 2025
opencode — see [LICENSE](./LICENSE), preserved from the original project.

Local changes:

- Renamed to `@recoder/opencode-schema`, version 0.1.0, made buildable with
  plain `tsc` (upstream was type-checked with tsgo under bun and never emitted).
- Relative imports rewritten to explicit `.js` extensions for NodeNext ESM
  output (mechanical change only).
- **effect is consumed via the npm alias `effect4` (`npm:effect@4.0.0-beta.83`)
  and all `from "effect"` imports were rewritten to `from "effect4"`.** Reason:
  this code requires the effect v4 beta Schema API, but the monorepo root
  `package.json` has a workspace-wide pnpm override `"effect": ">=3.20.0"` that
  pins every dependency literally named `effect` to v3 (currently 3.21.0). The
  alias sidesteps the name-keyed override without touching root config. If the
  root override is ever lifted, the alias can be renamed back mechanically.
- Upstream bun tests were not copied; see `test/` here for vitest coverage.
