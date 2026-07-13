# Recoder Code Docs

Per-area technical code documentation for the Recoder monorepo. Each file documents one top-level area's purpose, layout, entry points, and build/run/test.

> **Status (2026-07-13).** The backend Agent-OS **engine program** (Phases 1–5) has landed on
> `feat/enterprise-s0-p0`: fleet supervisor, LLM gateway, retrieval/RAG, code-intel, browser,
> coordination, workflow/hooks, PAL planning, and notify — each an owned package skinned as a
> governed MCP server behind the interop host (**21 in-proc capability servers**), degrade-safe and
> unit-tested. Separately, `apps/wave` (a fork of Wave Terminal) is the rebranded **L3 terminal shell
> + 11-block cockpit** and builds end-to-end. Both are **built + committed + unit-tested + source/build
> verified** — *not* GUI-launch-verified, deployed, or live. Deploy + billing capabilities are deferred
> (filed). Canonical ground truth: [RECODER-ENGINES](../architecture/RECODER-ENGINES.md) ·
> [RECODER-CAPABILITIES](../architecture/RECODER-CAPABILITIES.md) ·
> [RECODER-SHELL](../architecture/RECODER-SHELL.md) · [apps/wave/FORK.md](../../apps/wave/FORK.md).
> Individual area docs below were last field-verified 2026-07-01 and carry per-file status notes where
> the engine/shell work changed reality.

## Areas

| Area | Description |
|------|-------------|
| [app](./app.md) | Next.js app for `https://recoder.xyz` — auth/identity and control-plane surface; only ~11 files git-tracked since broad secret-filename `.gitignore` rules hide most source. |
| [apps](./apps.md) | Runnable Recoder surfaces — headless `agent-gateway` and `agent-worker` processes, the `desktop` Electron cockpit, the `mobile` Expo/React Native client, and the `wave` L3 terminal shell (Wave Terminal fork). |
| [docker-backend](./docker-backend.md) | Express + express-ws service runtime (port 3100) mounting Agent OS, A2A gateway, the Conductor coding-agent substrate, the polyglot **fleet supervisor** + **LLM gateway**, the governed **MCP interop host** (21 in-proc engines), sandbox execution, connectors, and the public API. |
| [packages](./packages.md) | Shared TypeScript package layer — the Agent OS control-plane spine, the new owned **engine packages** (retrieval, agent-browser, coordination, workflow-engine, agent-notify), plus ~70 supporting libraries, vendored SDKs, and CLIs/UIs, consumed via `workspace:*`. |
| [py](./py.md) | Python side-car services — `ops-recorder/work-signals` and vendored ML substrates (mem0, colbert, browser-use, pal-mcp-server) wired as degrade-safe seams. (`recoder-billing`/Polar removed.) |
| [ts](./ts.md) | Vendored coding-agent runtimes and tools — opencode, open-agents, dmux, recodergit, and `@recoder/connectors`, rebranded as adapters. (`oh-my-codex`, `oh-my-openagent`, and the Polar server removed.) |
| [go](./go.md) | Four independent Go module trees — the Recoder-owned `recoder-xds` Envoy xDS control plane plus gitignored upstream checkouts (beads, ziti, multica). Networking (xds/ziti) is Phase 5 cloud/teams, deferred. |
| [crates](./crates.md) | The Rust tier — the first-party `recoder-governance` kernel/IPC daemon plus vendored substrates (openfang, TensorZero — now adopted as the wired LLM gateway). (Lance removed → Qdrant.) |
| [site](./site.md) | The recoder.xyz marketing website — a standalone Next.js 15 App Router app with landing/legal/changelog pages and a disk-backed `/api/leads` endpoint, on port 3010. |
| [mcp](./mcp.md) | stdio MCP/JSON-RPC bridges (Claude Code MCP server, Codex adapter, shared core) that let external runtimes drive the control plane without owning canonical state. |
| [shared](./shared.md) | The private `@recoder/shared` package — platform-agnostic types, streaming parsers, animation hooks, an opencode client, and the server-only A2A interop layer. |
| [scripts](./scripts.md) | ~160 standalone operational/verification executables (bash, Node, tsx, Python) that build, deploy, gate releases, rotate secrets, and run E2E/health checks. |

## See also

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../RECODER-PRODUCT-ARCHITECTURE.md](../RECODER-PRODUCT-ARCHITECTURE.md)
- [../DIRECTORY-MAP.md](../DIRECTORY-MAP.md)
- [../PACKAGES.md](../PACKAGES.md)
