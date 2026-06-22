<!-- Generated 2026-06-22 by oss-merge-exec-wave3 workflow. Apply-ready merge plans. -->
# OSS Ownership-Merge — Wave 3 Exec Plans

## PI OSS Merge: Recoder-Owned @recoder/pi Package Set
- **Vendor source:** /Users/arhansubasi/recoder.xyz/pi — Four clean TS packages under pi/packages/: @earendil-works/pi-agent-core (deps: @earendil-works/pi-ai, ignore, typebox, yaml), @earendil-works/pi-ai (deps: @anthropic-ai/sdk, @aws-sdk/client-bedrock-runtime, @google/genai, @mistralai/mistralai, openai, http/https-proxy-agent, partial-json, typebox), @earendil-works/pi-tui (minimal deps, native win32/darwin prebuilds), @earendil-works/pi-coding-agent (depends on all three above). TUI + coding-agent are CLI/interactive; agent-core is the runtime SDK used by adapter.
- **Owned package:** Create four sister packages under packages/@recoder/: pi, pi-ai, pi-agent-core, pi-coding-agent. The monolithic @recoder/pi export barrel will re-export the three support libs (@recoder/pi-ai, @recoder/pi-agent-core, @recoder/pi-tui) plus tool factories and session utilities for docker-backend consumption.
- **Consumer wiring:**
  - docker-backend/package.json: Add '@recoder/pi': 'workspace:*' to dependencies. Remove optionalDependencies file: refs.
  - docker-backend/src/a2a/pi-runtime-adapter.ts: Change lines 36-38 from @mariozechner/pi-coding-agent to @recoder/pi. Lines 198-206: Replace dynamic piModule destructuring with direct imports from @recoder/pi at top of file. Line 224: ModelRegistry.create() works as-is; lines 242-244: readOps/writeOps/editOps/bashOps are still created inline; line 249: createAgentSession() call signature unchanged.
- **Blockers:**
  - IMPLEMENTATION MISMATCH RESOLVED: docker-backend adapter dynamically loads @mariozechner/pi-coding-agent from file:// paths; switch to direct @recoder/pi workspace import eliminates fallback candidates. Adapter only needs agent-core (session, tools, auth); coding-agent CLI is NOT used by docker-backend, so no TUI/CLI exports required in @recoder/pi barrel for consumer.
  - OPTIONAL: pi-tui has native prebuilds (win32/darwin .node files); not bundled by tsup. Include native/ dir in @recoder/pi files array only if docker-backend runs interactive terminal sessions (likely no — adapter is headless). Stub or exclude.
  - BUILD TOOL MISMATCH: pi uses custom tsgo (TypeScript on-the-fly transpiler); recoder uses tsc + tsup. Rewrite pi/packages/{agent,ai}/tsconfig.build.json for tsup (entry paths, esbuild-compatible settings). pi-tui uses tsgo; skip vendoring TUI for now (not docker-backend dependency).
  - PROVIDER CONFIGURATION: pi-ai auto-discovers providers from SDK (openai, anthropic, google, mistral, bedrock). Keep provider barrels as-is (/ai exports ./anthropic, ./google, ./bedrock-provider); docker-backend adapter (line 211-216) manually configures openrouter, openai, anthropic, google in authStorage. NO pruning of provider exports needed — they're opt-in via authStorage.set().
  - CLIPBOARD OPTIONAL: pi-coding-agent has @mariozechner/clipboard as optionalDependency; not used by docker-backend adapter. Mark as devDependency or remove entirely from @recoder/pi.
- **Verify:** 1. pnpm install from recoder root: confirms workspace:* refs resolve. 2. pnpm build --filter @recoder/pi: tsup compiles src/index.ts (barrel) + agent-core.ts + ai.ts; outputs dist/index.{js,mjs,d.ts}, dist/agent-core.{js,mjs,d.ts}, dist/ai.{js,mjs,d.ts}. 3. pnpm --filter docker-backend install: reso

## OpenCode → @recoder/runtime-opencode Merge Plan
- **Vendor source:** /Users/arhansubasi/recoder.xyz/opencode
- **Owned package:** @recoder/runtime-opencode
- **Consumer wiring:**
  - docker-backend/package.json: ADD @recoder/runtime-opencode@workspace:* to dependencies
  - docker-backend/src/a2a/opencode-connector-runtime.service.ts: IMPORT session types from @recoder/runtime-opencode/session; ADD type: ACPSessionState imports
  - docker-backend/src/a2a/opencode-connector-runtime.service.ts: REWRITE OpencodeExecuteInput.sessionId → ACPSessionState.id for type safety
  - packages/agent-runtimes/src/adapters/opencode-adapter.ts: IMPORT @recoder/runtime-opencode/types for agent-facing session contracts
  - packages/agent-runtimes/package.json: ADD @recoder/runtime-opencode@workspace:* as peer dependency alongside existing @recoder/agent-os
- **Blockers:**
  - BLOCKER: opencode/src/acp/agent.ts is 1764 lines, deeply tied to OpencodeClient (sdk v2) + Effect runtime + Bun specifics (pathToFileURL, spawn, tree-sitter, markdown). Extracting full Agent class NOT feasible. RESOLUTION: Export only ACPSessionManager + session state contracts; docker-backend/opencode-connector-runtime.service.ts already has Agent logic as separate OpencodeConnectorRuntime class.
  - BLOCKER: opencode/packages/opencode/src/tool/registry.ts uses Effect.Effect, Layer, InstanceState, ServiceMap (Effect runtime) for async lazy-loading + plugin discovery. RESOLUTION: Extract ToolRegistry.Interface (method signatures only); runtime lives in consumer (docker-backend or CLI wrapper). @recoder/runtime-opencode provides ONLY types + ACPSessionManager.
  - BLOCKER: Custom tool discovery in registry.ts requires scanning {tool,tools}/*.{js,ts} + dynamic imports (Bun-specific pathToFileURL, requires working dir + npm dependencies). RESOLUTION: No-op stub; tool registration is a Recoder concern, not runtime concern.
  - BLOCKER: opencode uses @opencode-ai/sdk v2 for OpencodeClient; this is a peer dependency (consumer provides). @recoder/runtime-opencode must NOT import it in dist. RESOLUTION: Type-only imports (import type { OpencodeClient }) in src, excluded from build output.
  - BLOCKER: ProviderID + ModelID in opencode/src/provider/schema.ts are branded types using Effect.Schema + custom make() functions. RESOLUTION: Extract minimal branded string types (zod-based), stub Provider.parseModel() as external function signature if needed.
- **Verify:** 
  "1. Extract src/: types.ts (ACPSessionState, ACPConfig), session.ts (ACPSessionManager), tool.ts (Tool.Info, Tool.Def, Tool.Context), tool-registry.ts (ToolRegistry.Interface readonly contract), schema.ts (ToolID, ProviderID, ModelID)\n2. Prune: NO Bun/browser imports, NO Effect/Layer runtime, NO

## Git Nexus to @recoder/git-nexus Deepening Plan - Runtime Evidence Integration
- **Vendor source:** /Users/arhansubasi/recoder.xyz/GitNexus/gitnexus
- **Owned package:** @recoder/git-nexus
- **Consumer wiring:**
  - File: /Users/arhansubasi/recoder.xyz/docker-backend/package.json — ADD to dependencies: '@recoder/git-nexus': 'workspace:*' (use for importing runtime-evidence producer)
  - File: /Users/arhansubasi/recoder.xyz/docker-backend/src/agent-os/controllers/agent-os.controller.ts — IMPORT: import { createGitStateEvidenceProducer } from '@recoder/git-nexus/evidence' at top; ADD method createGitStateEvidenceFromRepo(req: Request, res: Response) to call producer and append runtime-evidence outbox like appendRuntimeEvidenceOutbox pattern (line ~264)
  - File: /Users/arhansubasi/recoder.xyz/docker-backend/src/agent-os/routes/agent-os.routes.ts — REGISTER route: POST /agent-os/runtime-evidence/git-state that calls agentOsController.createGitStateEvidenceFromRepo()
  - File: /Users/arhansubasi/recoder.xyz/packages/agent-mcp/src/servers/git-nexus-server.ts — REGISTER new MCP tool in toolNames: 'git_nexus.generate_evidence' for git state evidence cloud events
- **Blockers:**
  - NONE blocking implementation — pi-coding-agent is optional dep in docker-backend; git-nexus evidence producer does not depend on Pi or heavy GitNexus analyzer submodules
  - Note: Full GitNexus (gitnexus package v1.6.5) has heavy deps (tree-sitter, @huggingface/transformers, onnxruntime-node, 40+ tree-sitter-* grammars). If future deepening adds code intelligence analysis (impact analysis, symbol queries), must add those to catalog or stub optional. For NOW (evidence producer only), no blocker
  - Git state capture requires either isomorphic-git or native git CLI — docker-backend already has node, so can exec 'git status' and 'git rev-parse' directly or use isomorphic-git (not in catalog, add if needed for offline repos)
- **Verify:** [
  "pnpm install in /Users/arhansubasi/recoder.xyz/packages/git-nexus to install @recoder/agent-events workspace:* dep",
  "pnpm run build in packages/git-nexus — verify tsup generates dist/evidence/index.* and dist/index.* with source maps",
  "tsc --noEmit in packages/git-nexus to verify no type 

## PAL MCP Server Merge Plan: Sidecar Python Package to Recoder TS Ecosystem
- **Vendor source:** /Users/arhansubasi/recoder.xyz/pal-mcp-server (Python 3.9+, MCP 1.0+, model-agnostic PAL core + 18 MCP tools)
- **Owned package:** @recoder/pal-mcp-server (Python sidecar; spawned by docker-backend's MCPManager; exposes AI-backed planning + capability routing tools)
- **Consumer wiring:**
  - docker-backend/package.json: ADD '@recoder/pal-mcp-server': 'workspace:*' to dependencies
  - docker-backend/src/mcp-manager.ts: Import PAL config; when startServer({ id: 'pal-mcp', ... }), resolve config.command = require.resolve('@recoder/pal-mcp-server/bin/pal-mcp-server.js'). Spawn with stdio: ['pipe', 'pipe', 'pipe']. On MCP 'tools/list' response, filter by policy engine + store MCPTool[] in instance.tools.
  - docker-backend/src/a2a-gateway.ts: On capability request, invoke mcpManager.startServer(projectId, palConfig). On tool discovery, call agent-policy.evaluateMCPToolGrant() for each tool. Return grants to loadPALInstructionSource(). Wire capability discovery result into A2A envelope for agent-os runtime.
- **Blockers:**
  - Python 3.9+ runtime: PAL MCP server requires Python 3.9+. Docker image for docker-backend must include Python. If it doesn't, add Python 3.12 slim layer or ensure host has Python available.
  - mcp package version: Confirm pal-mcp-server/pyproject.toml mcp>=1.0.0 aligns with any MCP type definitions vendored in @recoder/agent-mcp. If agent-mcp uses older MCP spec, update pyproject.toml or vendor newer MCP types.
  - OpenAI/Gemini API keys: PAL sidecar requires OPENAI_API_KEY or GEMINI_API_KEY env vars. docker-backend MCPManager must pass env from BYOK store or system environment when spawning. No secrets in code; use VAULT or env override.
  - Port conflicts: If PAL MCP server hardcodes a port (unlikely for stdio-based MCP), ensure no port collision. Current design uses stdio (no port needed), so LOW RISK.
  - Testing in CI: Python tests (pytest, unit + simulator tests) require separate CI runner. Add Python 3.9+ to CI matrix if not present. Recommend Makefile targets (make test) for local dev.
  - Type safety: PAL tools output ToolOutput (Pydantic model). docker-backend MCPManager expects MCPTool[] with inputSchema (JSON). Ensure Pydantic models serialize to JSON Schema correctly; validate in Checkpoint 4.
  - Optional dependency collision: If pi-mono (@mariozechner/pi-coding-agent) also spawns MCPManager, ensure no duplicate server instances. MCPManager.servers map is keyed by (projectId, serverId), so multiple MCPs can coexist. SAFE.
  - No breaking changes to @recoder/agent-mcp: This plan assumes agent-mcp is minimal (types only, no runtime). If agent-mcp has runtime dependencies (e.g., Kotlin MCP client), verify PAL (Python) integrates correctly. Likely OK; MCP is language-agnostic.
- **Verify:** [
  "Checkpoint 1: pnpm install succeeds; @recoder/pal-mcp-server resolves from packages/pal-mcp-server/package.json.",
  "Checkpoint 2: docker-backend build compiles; tsc --noEmit passes. mcp-manager.ts resolves PAL bin path.",
  "Checkpoint 3: Manual test: MCPManager.startServer(projectId, { id: '

## Merge context7 into Recoder as @recoder/context7 — MCP docs-fetcher owned vendor
- **Vendor source:** upstash/context7 (OSS monorepo: 5 packages: @upstash/context7-{sdk,mcp,tools-ai-sdk}, ctx7 CLI, @upstash/context7-pi for earendil pi-coding-agent)
- **Owned package:** @recoder/context7 (core MCP server + SDK wrapper; @recoder/context7-tools for ai-sdk integration; @recoder/context7-cli optional)
- **Consumer wiring:**
  - docker-backend/package.json: Add "@recoder/context7": "workspace:*" to dependencies (pairs with docker-backend/src/instruction-compiler/preflight.ts calling Context7SDK for top-N lib docs in pre-flight phase)
  - .mcp.json: Repoint context7 MCP entry to owned @recoder/context7 binary instead of npx @upstash/context7-mcp
  - docker-backend/tsconfig.json: Ensure "skipLibCheck": false (or true if @upstash/redis peer types cause issues) — if Redis type conflicts, add to typeRoots or exclude node_modules/@upstash
- **Blockers:**
  - BLOCKER #1: @upstash/redis peer (internal use in MCP lib). docker-backend uses @recoder/mem0 (openai, groq, ollama peers) — redis must not conflict. RESOLUTION: Keep @upstash/redis pinned in @recoder/context7 (not cataloged); docker-backend's type resolution will skip or resolve separately.
  - BLOCKER #2: pi-coding-agent integration NOT in scope for this merge. context7/packages/pi depends on @earendil-works/pi-coding-agent (peer) — NOT merged; if future wiring needed to docker-backend/src/a2a/pi-runtime-adapter.ts, will require separate @recoder/context7-pi owned package (copy pi/, prune peer, defer to separate task).
  - BLOCKER #3: express v5.1.0 compatibility — verify docker-backend does not use express elsewhere; if express is missing from docker-backend, this is NEW and must be installed globally. Check: grep -r 'require.*express\|import.*express' /docker-backend/src
  - BLOCKER #4: Instruction-compiler integration point undefined. Task says 'wire into instruction-compiler pre-flight' — grep -r 'instruction-compiler' /docker-backend/src to verify it exists. If missing, create stub consumer example (src/instruction-compiler/preflight.ts) demonstrating Context7SDK usage, do NOT wire live without explicit task.
  - BLOCKER #5: @modelcontextprotocol/sdk v1.25.1 compatibility — docker-backend may already use MCP SDK for other servers (recoder MCP, github, etc.). Verify pnpm-workspace.yaml catalog or docker-backend/package.json for existing version; if mismatch, reconcile to single version in catalog.
- **Verify:** [
  "1. tsup build @recoder/context7: pnpm --filter @recoder/context7 run build → expect dist/mcp/index.js + dist/sdk/client.js + .d.ts files",
  "2. tsc check @recoder/context7: pnpm --filter @recoder/context7 run check-types → zero errors",
  "3. docker-backend import: grep -r '@recoder/context7' 

