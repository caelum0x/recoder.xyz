<!-- Generated 2026-06-22 by oss-merge-specs-wave2 workflow. Ready-to-execute ownership-merge specs. -->
# OSS Ownership-Merge — Wave 2 Specs

Executable merge specs for the next OSS assets. Pattern: vendor clean TS subpackage -> packages/<name> as @recoder/<name>, prune to Recoder's stack, workspace:* the consumer, build+resolve+tsc verify. See [16-oss-ownership-merge-plan.md](./16-oss-ownership-merge-plan.md).

## Daytona TypeScript SDK Merge Spec  (library-with-prune / vendor-package)
- **Vendor source:** `/Users/arhansubasi/recoder.xyz/daytona-projects/daytona/libs/sdk-typescript`
- **Owned package:** packages/sandbox-daytona as @recoder/sandbox-daytona
- **Infra needed:** Daytona API server (http://localhost:3900/api or via DAYTONA_API_URL env var) for runtime sandbox ops
- **Prune:** src/__tests__, src/ComputerUse.ts, src/CodeInterpreter.ts, src/ObjectStorage.ts, src/LspServer.ts, src/Snapshot.ts, src/Volume.ts, hooks, jest.config.js, typedoc.json, tsconfig.spec.json, README.legacy.md
- **Deps to add:** axios:^1.15.2, uuid:catalog:, zod:catalog:, typescript:catalog:, tsup:catalog:, @daytona/api-client:npm:^0.5.0, @daytona/toolbox-api-client:npm:^0.5.0, @opentelemetry/api:^1.8.0, @opentelemetry/sdk-node:^0.48.0, @opentelemetry/instrumentation-http:^0.48.0, @opentelemetry/sdk-trace-base:^1.23.0, @opentelemetry/exporter-trace-otlp-http:^0.48.0, @opentelemetry/otlp-exporter-base:^0.48.0, @opentelemetry/semantic-conventions:^1.23.0
- **Consumer wiring:**
  - docker-backend/src/daytona-sandbox-deps.ts:13-14 import type { SandboxDependencies } from './public-api/routes/sandboxes' (REPLACE daytona-client imports with @recoder/sandbox-daytona exports)
  - docker-backend/src/daytona-client.ts:REPLACE entire file with thin adapter that wraps @recoder/sandbox-daytona client or wire Sandbox/Daytona class directly
- **Verify:** `pnpm install && pnpm -r --filter docker-backend check-types && pnpm -r --filter docker-backend test src/__tests__/daytona-client.test.ts`
- **Risks:**
  - Daytona TS SDK depends on @daytona/api-client and @daytona/toolbox-api-client (NPM published, not in monorepo) — these become external deps of @recoder/sandbox-daytona and must be pinned in catalog:; OpenTelemetry is heavy but only active if OTEL env vars set, so safe to vendor
  - docker-backend/src/daytona-client.ts is a custom REST client wrapper (NOT from Daytona SDK); it exists because the upstream SDK wasn't available early; after merge, decide: keep thin adapter wrapping Sandbox API, or replace entirely with SDK Daytona class
  - File operation fallbacks in daytona-client.ts (uploadFileExec, downloadFileExec, listFilesExec) use shell escaping logic — ensure Sandbox/FileSystem SDK methods have equivalent robustness for large files (>40KB)
  - Sandbox.getOrStartSandbox() polling logic in daytona-client needs parity in SDK if used

## stagehand browser automation  (library-with-prune / vendor-package)
- **Vendor source:** `stagehand/packages/core`
- **Owned package:** packages/browser-stagehand as @recoder/browser-stagehand
- **Infra needed:** Browser runtime: Playwright or Puppeteer or Patchright (optional peer; Browserbase cloud integration pruned); MCP server for tool execution
- **Prune:** packages/core/lib/v3/external_clients (unused chromium-specific workarounds), packages/core/lib/v3/agent/tools/screenshot/getCoordinate.ts (debug-only visual feedback tooling), packages/core/lib/v3/mcp/integrations (Exa, Tavily, SerpAPI optional MCP servers — Recoder brings its own tool system), packages/core/examples/* (not vendored into Recoder workspace), packages/core/tests/* (tests stay upstream; Recoder runs selective integration tests), packages/core/scripts/build-* (Recoder uses tsup; custom build scripts not needed), packages/core/optionalDependencies: chrome-launcher, bufferutil, all @ai-sdk/* except @ai-sdk/provider (Recoder SDK wires specific models), packages/core/lib/v3/llm/aisdk.ts model provider barrel (redundant; Recoder brings its own LLM routing), @browserbasehq/sdk (Browserbase-hosted service integration — Recoder uses local/cloud runtimes)
- **Deps to add:** @ai-sdk/provider: catalog:, @anthropic-ai/sdk: ^0.40.1, @google/genai: ^1.22.0, @modelcontextprotocol/sdk: ^1.29.0, ai: ^5.0.133, devtools-protocol: ^0.0.1464554, fetch-cookie: ^3.1.0, openai: ^5.11.0, pino: catalog:, pino-pretty: ^13.0.0, uuid: ^11.1.1, ws: ^8.21.0, zod-to-json-schema: ^3.25.0, patchright-core: ^1.55.2 (peerDep; for browser runtime)
- **Consumer wiring:**
  - packages/agent-oss/src/stagehand/stagehand-adapter.ts (already wired as OssAdapterProfile; deepens to runtime adapter from HTTP facade)
  - recoder-agents/src/hooks/workspaces/use-mission-control.ts (AgentOsRuntimeEvidence producer; wire screenshot/pageState extraction)
  - packages/agent-runtimes (proposed): bridge contract for browser-runtime adapters; wire stagehand as first evidence producer
- **Verify:** `pnpm install && pnpm check-types (tsconfig resolves @recoder/browser-stagehand in workspace); consumer tsc on agent-oss + agent-runtimes; selective smoke test on Stagehand.extract() + Stagehand.act() via MCP bridge`
- **Risks:**
  - LLMProvider hardwires multiple @ai-sdk/* optional deps as factories (GroqClient, GoogleClient, etc.); Recoder wires only core models (Anthropic, OpenAI, Google) — prune unused factories from LLMProvider.getClient() switch + strip optionalDeps from package.json to avoid bloat
  - @browserbasehq/sdk peer dep missing in Recoder catalog (Browserbase cloud session management); prune launch/browserbase.ts or make Recoder env-gated (LOCAL/REMOTE only)
  - Stagehand.agent() uses modelToAgentProviderMap hardwired to specific CUA models (claude-sonnet-4, gpt-5.4, etc.); Recoder may need to override with custom model routing
  - DOM introspection (understudy/) relies on Stagehand's custom CDP protocol impl; works as-is since it's a pure lib, but coordinates visual feedback hardcoded for browser UX (highlight cursors, etc.) — safe to vendor as-is

## @recoder/runtime-pi (pi-agent-core)  (library-with-prune / adopt-types)
- **Vendor source:** `pi/packages/agent`
- **Owned package:** packages/runtime-pi as @recoder/runtime-pi
- **Infra needed:** Daytona sandbox (already in docker-backend) for pi-runtime-adapter execution; Anthropic/OpenAI/Google API keys for LLM (configurable via model registry)
- **Prune:** src/harness/session/jsonl-storage.ts, src/harness/session/memory-storage.ts, src/harness/env/nodejs.ts, test/**, docs/**
- **Deps to add:** @recoder/runtime-pi-ai workspace:*, @earendil-works/pi-ai ^0.78.0 (temporary bridge; prune once runtime-pi-ai ships), ignore catalog:7.0.5, typebox catalog:1.1.38, yaml catalog:2.9.0
- **Consumer wiring:**
  - docker-backend/package.json: optional dep @recoder/runtime-pi instead of @mariozechner/pi-coding-agent
  - docker-backend/src/a2a/pi-runtime-adapter.ts:34-48: loadPiModule() to import from @recoder/runtime-pi instead of @mariozechner
  - docker-backend/src/a2a/pi-runtime-adapter.ts:198-206: destructure from @recoder/runtime-pi exports
  - packages/agent-runtimes/src/adapters/pi-adapter.ts: NEW—wrap pi-agent-core as AgentRuntimeAdapter (createGenericRuntimeAdapter + runtime execution driver pattern from generic-adapter.ts)
- **Verify:** `pnpm install && pnpm check-types && (cd docker-backend && npx tsc --noEmit) && pnpm -r test --filter=@recoder/runtime-pi`
- **Risks:**
  - pi-ai has 12+ LLM provider sub-packages (Anthropic, OpenAI, Google, Mistral, Bedrock, Vertex, Azure, Cloudflare); only Anthropic + OpenAI + Google are in Recoder catalog; others become optional deps—prune provider barrel exports to ship only needed ones (anthropic.ts, openai-responses.ts, google.ts); unshipped providers (Mistral, Bedrock, Vertex) remain in src but not exported
  - pi-ai models.generated.ts is 424KB (auto-generated model registry); include as-is, update via pi upstream if new models added
  - pi-agent-core harness module (compaction, skills, prompt-templates) is Daytona-specific (builds on AgentHarness); docker-backend/src/a2a/pi-runtime-adapter.ts already validates this boundary; keep harness as internal if adopting only core Agent + AgentLoop types
  - Existing external-dep usage in docker-backend (@mariozechner/pi-*) is optional—fails gracefully if not present; verify fail-safe behavior still works after merge (isPiRuntimeAvailable() must return false if @recoder/runtime-pi not installed)

## opencode vendor merge to @recoder/runtime-opencode  (library-with-prune / extract-subset)
- **Vendor source:** `opencode/packages/opencode/src (session, acp/types.ts only)`
- **Owned package:** packages/runtime-opencode as @recoder/runtime-opencode
- **Infra needed:** none (library)
- **Prune:** cli/ (terminal CLI entry; opencode runs as HTTP service), server/ (Hono HTTP server; Recoder consumes via client SDK), provider/ (LLM provider system; wired via ai-sdk in docker-backend), tool/ (tool registry/bash executor; Recoder has own tool adapter), lsp/ (language server; not needed for type extraction), plugin/ (plugin system; defer), control-plane/ (multi-workspace routing; simplify or remove), account/ (SaaS account management; Recoder uses own auth), config/ (opencode config/env; use Recoder shared config), storage/ (Bun SQLite; Recoder uses postgres), pty/ (pseudo-terminal; not needed), mcp/ (Model Context Protocol; defer)
- **Deps to add:** @agentclientprotocol/sdk@^0.16.1 (ACP protocol types), @ai-sdk/provider (for LanguageModelV2Usage type), effect@4.0.0-beta.43 (catalog), zod@catalog: (schema validation), ai@6.0.138 (catalog; ProviderMetadata), decimal.js@^10.5.0 (token usage costs)
- **Consumer wiring:**
  - docker-backend/src/a2a/opencode-service-adapter.ts: keep import from @recoder/shared/opencode-client; add re-exports of SessionInfo, MessageWithParts from @recoder/runtime-opencode/session if needed
  - docker-backend/src/a2a/opencode-connector.service.ts: import types from @recoder/runtime-opencode/acp (ACPSessionState, ACPConfig)
  - shared/src/opencode-client.ts: ensure SessionInfo, MessageWithParts types remain accessible (no breaking change to docker-backend)
- **Verify:** `pnpm install && pnpm check-types (docker-backend/src/a2a/*.ts must resolve). pnpm build -F @recoder/runtime-opencode && pnpm build -F docker-backend. Smoke: ensure docker-backend still imports SessionInfo from shared correctly.`
- **Risks:**
  - Session/Message type changes: opencode's SessionID, MessageID are branded schemas; ensure docker-backend's opencode-client types remain compatible
  - ACP SDK version: opencode pins @agentclientprotocol/sdk@0.16.1; Recoder may not use ACP directly (only types), so minor version safe
  - Effect/Zod versions: must match catalog to avoid duplicates in pnpm workspace
  - Bun runtime imports: opencode uses Bun-specific APIs (bun-pty, cross-spawn, etc.); ensure vendored session/ + acp/types have NO Bun-only imports (check for 'bun' in imports)

## GitNexus OSS Ownership Merge Spec  (library-with-prune / extract-subset)
- **Vendor source:** `GitNexus/gitnexus/src`
- **Owned package:** packages/git-nexus-core as @recoder/git-nexus-core
- **Infra needed:** git-nexus CLI (optional sidecar, already at GitNexus/gitnexus); runtime evidence sink into run-history subsystem
- **Prune:** cli/*, server/*, mcp/*, hooks, scripts, skills, web, vendor/tree-sitter-*, embeddings/*, wiki/*, augmentation/*, platform/*
- **Deps to add:** @ladybugdb/core:^0.16.1 (catalog), tree-sitter:0.21.1 (catalog), tree-sitter-typescript:^0.23.2 (catalog), tree-sitter-javascript:^0.23.0 (catalog), tree-sitter-python:0.23.4 (catalog), tree-sitter-java:^0.23.5 (catalog), tree-sitter-kotlin:^0.3.8 (optional, catalog), graphology:^0.26.0 (catalog), graphology-utils:^2.3.0 (catalog), uuid:^14.0.0 (catalog), ignore:^7.0.5 (catalog), lru-cache:^11.0.0 (catalog), pino:^10.3.1 (catalog)
- **Consumer wiring:**
  - packages/git-nexus/src/index.ts: replace @recoder/git-nexus-core imports to types/contracts
  - packages/agent-instructions/src/loaders/git-nexus-loader.ts: wire runtime evidence bundle shape from indexed graph metadata
  - docker-backend/src/git-nexus-client.ts (new): sidecar bridge for live graph queries + evidence capture (git clone provenance, index staleness, symbol change impact)
- **Verify:** `tsc --noEmit on packages/git-nexus + packages/agent-schemas; verify MCP tool definitions resolve; test context-pack construction with indexed graph types`
- **Risks:**
  - Heavy dependency graph (tree-sitter native bindings + LadybugDB): verify optional deps (tree-sitter-kotlin, node-gyp-build) skip safely in docker build
  - CLI/server/MCP layers must be completely pruned to avoid stdin/http listener collisions with docker-backend
  - Incremental indexing state (meta.json file hashes, schema version): if Recoder consumer needs live re-indexing, contract must define repo-root + cache-dir locations
  - Embeddings skip-safe: verify core graph construction works without transformers.js (HuggingFace dep can be optional-only)
  - Parser timeouts on large files (GITNEXUS_WORKER_SUB_BATCH_TIMEOUT_MS env): document as tuneable for Recoder's indexed repos

## @recoder/pal-mcp (Python MCP server sidecar)  (sidecar / sidecar-own-in-place)
- **Vendor source:** `/Users/arhansubasi/recoder.xyz/pal-mcp-server`
- **Owned package:** pal-mcp-server (sidecar @ /Users/arhansubasi/recoder.xyz/pal-mcp-server, owned as first-party)
- **Infra needed:** Python 3.11+ runtime, MCP stdio transport (inherited from parent agent-mcp host), sidecar process spawning (already in agent-mcp host), environment vars for OpenAI + Gemini keys passed through .env at runtime
- **Prune:** docs/, tests/, .github/, communication_simulator_test.py, providers/registries/dial.py, providers/registries/azure.py, providers/registries/xai.py, providers/dial.py, providers/xai.py, providers/azure_openai.py, providers/openrouter.py, clink.py tool (CLI bridge—not core to Recoder)
- **Deps to add:** mcp>=1.0.0 (existing requirement), google-genai>=1.19.0 (from pyproject.toml), openai>=1.55.2 (from pyproject.toml), pydantic>=2.0.0 (from pyproject.toml), python-dotenv>=1.0.0 (from pyproject.toml)
- **Consumer wiring:**
  - packages/agent-mcp/src/host/servers/pal-mcp-server.ts (NEW: spawn + route tool calls to Python sidecar)
  - packages/agent-instructions/src/loaders/pal-loader.ts (EXISTING: PAL context → instruction source; no change needed)
  - packages/agent-schemas/src/pal-plan.schema.ts (EXISTING: PALPlan schema; no change needed)
- **Verify:** `Build verification: (1) Dockerfile builds without error; (2) Python 3.11+ installed & venv created; (3) requirements.txt pip install succeeds; (4) server.py imports and MCP registry boots; (5) stdio protocol handshake test (echo null → MCP init response); (6) smoke test: call chat tool with flash model + verify response streaming. NO heavy integration tests (requires real API keys).`
- **Risks:**
  - MAJOR: Python/TypeScript boundary—failures in sidecar crash tool calls; need proper stdio error handling + timeout guards in pal-mcp-server.ts
  - Provider factory barrels (openrouter, azure, xai, dial) are optional but vendored—if pruned, their imports break; must audit clink.py and consensus.py for optional provider references
  - Tool deduplication—PAL MCP exposes ~15 tools; agent-os may route only subset (chat, codereview, debug, planner); excess tools in stderr can bloat token usage
  - Conversation memory (utils/conversation_memory.py) uses file-based pickle; no persistence guarantee in ephemeral container; consider Redis or in-memory for Recoder embedding
  - Thinking modes (extended reasoning)—sensitive to model.max_tokens + think budget; may exhaust token limit if not gated
  - MODEL hints from @recoder/pal routing must reach pal-mcp-server via prompt injection (e.g. 'Use model: gpt-5-2' in system prompt); no native channel

