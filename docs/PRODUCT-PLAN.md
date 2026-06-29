# Recoder — Product & Products Plan

> Forward-looking plan grounded in the actual code across all 14 trees (app, apps, c, crates, docker-backend, go, mcp, packages, py, recoder-skill, site, ts, tools, docs). Not a status board — a map of the one product, its shippable products, and the roadmap to make them coherent.

## 1. The Product

**Recoder is one product: a local-first control plane that runs *your own* coding agents (Claude Code, Codex, opencode, pi) in parallel and makes them work as a coordinated team** — one shared brain so they read the repo once, work-locks + an A2A bus so they never collide or duplicate, and governance + a tamper-evident audit chain so a team can trust autonomous runs. Users bring their own agents and keys; Recoder never proxies models or resells tokens — that BYOK posture is the trust story, not a limitation.

**The honest moat is the survivable orchestration spine, not any single engine.** The proven, load-bearing asset is the Conductor: pinned tmux + git-worktrees + a Postgres state-of-record + a reconciler that rebinds live sessions after a backend restart. node-pty was tried and reverted because it can't survive restarts — that scar tissue *is* the differentiation. Everything else (brain, governance kernel, connectors, network mesh) is wired around that spine. The risk is sprawl: ~83 packages, ~20 vendored OSS subsystems, and a 19,000-line `server.ts` monolith. The product wins by hardening and exposing the spine, not by adding more engines.

## 2. The Products

Six coherent shippable products, grouped from the 14 trees. Order = closeness to revenue.

### A. The Cockpit + Edge Clients — *the buyable surface*
**Pitch:** Native operator console to launch, watch, and review your own coding agents running in parallel with a shared brain.
**Made of:** `apps/desktop` (signed/notarized Electron, 41 tests) + `apps/desktop/cockpit` (Preact SPA, ~136 tests, truthful unreachable/auth banners) + `apps/mobile` (`recoder-mobile` v1.1.2, native iOS/Android prebuilt, real `/api/a2a` task+approval client) + `site/` (`@recoder/site`, the recoder.xyz storefront + lead capture).
**State:** The most product-complete tree. Desktop + cockpit + mobile are real and shipping; the site is a truthful pre-launch brochure at changelog v0.1.0 (zero tests, flat-file NDJSON leads, the homepage "Cockpit" is a CSS *mock* not a live view).
**Gap to ship:** These are thin clients — their value equals the backend endpoints they poll. Wire the site's "Cockpit" mock to a real read-only control-plane view (or screenshot the real cockpit). Add a download→signup→entitlement path. The clients are done; the proof-of-value loop behind them is the gap.

### B. The Control-Plane Backend (docker-backend) — *the engine that runs*
**Pitch:** The deployed runtime that provisions sandboxes, drives agent CLIs in parallel, and hosts the Agent OS + A2A + Conductor HTTP API.
**Made of:** `docker-backend/` — `server.ts` (713KB host), `src/conductor/` (tmux+worktree substrate, reconciler, 16 test files), `src/a2a/` (gateway, 74 test files), `src/agent-os/` (control-plane routes + swappable Postgres/JSON/memory drivers), plus sandbox clients (Daytona 40KB, E2B, container-pool) and the live `c/tmux` vendored binary.
**State:** Genuinely deployed and load-bearing — 185 test files, real reconcilers/loops booting. This is where the moat physically runs.
**Gap to ship:** The `server.ts` monolith (19,229 lines, 14+ subsystems inlined) violates the repo's own "800 lines max" rule and is the single biggest liability — every new route raises blast radius. Decompose into routers. Daytona substrate is live on the server but **disk-gated** (94% full APFS / 16GB box) for real concurrent workloads — capacity, not code, is the blocker.

### C. The Owned Engines (packages/ + ts/ + crates/recoder-governance) — *the library spine*
**Pitch:** The Agent OS contract spine plus the fused engines (brain, coordination, governance, runtime, substrate) every surface depends on.
**Made of:** `packages/agent-os` (empty-deps domain core, ~240 imports — the spine), the best-tested engines `coordination` (164 src/53 tests), `runtime` (173/27), `brain` (66/21), `governance` (45/14), `substrate` (82/10); `crates/recoder-governance` (8 Rust crates, 246 passing tests, golden-vector audit chain, real daemon binary); the `ts/` vendored forks (`oh-my-codex`, `oh-my-openagent`, `opencode`, `open-agents`, `dmux`) that the production runtime drivers are *fused from* with file-path provenance.
**State:** The contract spine is real and faithfully follows the `monorepo.md` boundary. Drivers are fused, not shimmed. **But:** the Rust governance daemon is proven in an e2e test yet NOT wired into live docker-backend (TS falls back to its own pipeline unless `GOVERNANCE_SOCKET` is set). Many `agent-*` packages are contract-ahead-of-impl (tests 0-3). `runtime` and `distribution` are partial by their own READMEs.
**Gap to ship:** Set `GOVERNANCE_SOCKET` and run the Rust kernel in prod (it's built and proven — this is a wiring + capacity task, not a build task). Collapse the contract/impl confusion documented in `docs/PACKAGES.md` (kill `agent-kernel`, `sandbox-providers` facades; isolate the 28-pkg Giselle cluster under `vendor/`).

### D. The Connectors / Social Layer (interop) — *agents in and out*
**Pitch:** Hostile-by-default edge that lets external agents and human channels (Slack/Telegram/Discord/Signal/iMessage/WhatsApp) drive and be notified by Recoder, every inbound envelope untrusted until verified.
**Made of:** `packages/interop` (A2A + MCP host + connector gateway fused), `ts/extracted-from-openclaw` (`@recoder/connectors` — 7 channel adapters, the only `ts/` pnpm-workspace member), `docker-backend/src/connectors`, `mcp/recoder-a2a-server.js` (the LIVE `recoder` MCP server in `.mcp.json`, shipped by the CLI), and `recoder-skill/` (the inverse surface: lets Claude Code / clawdbot drive Recoder as a tool, 12 passing tests).
**State:** The MCP server is genuinely live (this session loaded its 8 tools). The connectors foundation compiles green; the recoder-skill is small/correct. **But:** the OpenClaw reply pipeline is stranded (discord adapter unexported, 172 type errors, uncompiled reference dirs); per-channel "live end-to-end" claims rest on tests that double each SDK seam — no proof any channel runs in prod.
**Gap to ship:** Prove ONE channel end-to-end against a running backend (pick Slack or Telegram). Rotate the committed Daytona key in `mcp/claude-code-config.json` (security violation) and de-duplicate the Claude/Codex MCP tool implementations via the empty `shared/` folder.

### E. The Governance + Network Spine (governance + go/ + crates/) — *the trust + mesh layer*
**Pitch:** Deny-biased approval/audit kernel plus a zero-trust mesh and dynamic xDS plane so autonomous fleets are safe and cross-machine.
**Made of:** `crates/recoder-governance` (the real owned kernel, shared with C), `packages/governance` (TS facade), `go/recoder-xds` (owned Envoy xDS control plane, 1473 LOC, wired into the backend image + selfhost Envoy), `go/ziti` (OpenZiti, called via REST not built) + `docker-backend/src/zrok-preview.ts` (the actual preview-tunnel path), `go/beads`/`bd` (mandated issue tracker, binary baked into image), `py/ops-recorder` (stuck-work detection, built but unwired).
**State:** `recoder-xds` and the governance kernel are real owned artifacts; `bd` and zrok are load-bearing. **But:** ziti source is a gitignored shallow clone never compiled; `ops-recorder` is genuine but gitignored and consumed by nothing.
**Gap to ship:** Wire the governance daemon (see C). Decide ziti vs zrok as the single mesh story (zrok currently wins by being actually wired). Either connect `ops-recorder` to the control plane or park it explicitly.

### F. The Distribution + Billing Layer (distribution + py/recoder-billing) — *how users get + pay*
**Pitch:** CLI device-flow auth, signed-desktop/npm/Homebrew publishing, and Polar Merchant-of-Record billing/entitlements (Turkey — no Stripe).
**Made of:** `packages/distribution` (partial — CLI device flow, entitlement gating over a typed Polar port, fail-safe deny on missing keys), `docker-backend/src/distribution` + `src/billing` + `src/metering` (OpenMeter), `py/recoder-billing` (first-party engine fused from Polar MoR, 8334 LOC, 94 tests), `app/` (the recoder.xyz SSO + project-snapshot data layer — the auth source of truth and cross-subdomain bridge).
**State:** Billing engine surface is real and the entitlement authority behind `@recoder/distribution`. **Landmine:** `py/recoder-billing/pyproject.toml` is corrupted (a stray `</content></invoke>` tag breaks pytest config); the full suite was never verified green (needs pyjwt + pytest-asyncio). `app/` is a cherry-picked, non-buildable slice of the canonical root app.
**Gap to ship:** Fix the corrupted `pyproject.toml` (blocking, trivial). Verify the billing suite green. Prove one paid entitlement gate end-to-end (BYOK-gated "Launch Web IDE" → Polar webhook → entitlement). **Polar-MoR is the only viable path given no-Stripe/Turkey — do not regress to Stripe assumptions.**

### Brain (cross-cutting, not standalone)
Memory is a capability the other products consume, not a separable surface. `packages/brain` fuses `recodergit` + `mem0` + `context7` + `continuum` (desktop activity) + `beads` into one `BrainContext`, exposes the `brain_activity` MCP tool, and is well-tested (66/21). Real duplication risk: both `packages/mem0` (TS) and `py/mem0` (Python server) are carried — pick the one `brain` actually imports.

## 3. Architecture Map

```
                 ┌─────────────── SURFACES (Product A) ───────────────┐
   site/  ──▶    desktop + cockpit         mobile        CLI / MCP
                       │  poll                │  /api/a2a   │  .mcp.json
                       └──────────┬───────────┴─────────────┘
                                  ▼
        ┌──────── docker-backend (Product B) — the runtime host ────────┐
        │  server.ts (monolith)                                          │
        │   ├─ conductor/  ── tmux(c/tmux) + git worktrees + reconciler  │  ◀ THE MOAT
        │   ├─ a2a/        ── A2A gateway + runtime adapters             │
        │   ├─ agent-os/   ── control-plane routes (PG/JSON/mem drivers) │
        │   └─ connectors/, sandbox clients (Daytona/E2B)               │
        └───────────────────────────┬───────────────────────────────────┘
                                     │ imports (boundary-clean)
   ┌─────────────── OWNED ENGINES / CONTRACTS (Product C) ───────────────┐
   │  @recoder/agent-os  (spine, empty deps, ~240 importers)             │
   │   ├─ brain ──fuses── recodergit + mem0 + context7 + continuum + beads
   │   ├─ coordination (locks + A2A bus)   ├─ runtime ──fused from── ts/* forks
   │   ├─ substrate ──promotes── conductor ├─ interop (Product D)        │
   │   └─ governance (TS facade) ──IPC──▶ crates/recoder-governance (Rust kernel)
   └─────────────────────────────────────────────────────────────────────┘
        │ delegates                 │ mesh / xds                │ pay
        ▼                           ▼                           ▼
  Product E: governance kernel + go/recoder-xds + zrok/ziti + bd
  Product F: distribution + py/recoder-billing (Polar MoR) + app/ (auth SoR)
```

**Ownership reality:**
- **First-party owned, real:** `agent-os` spine, conductor, brain, coordination, `crates/recoder-governance`, `go/recoder-xds`, `py/recoder-billing`, the cockpit/desktop/mobile, the live MCP server.
- **Owned forks (fused in-place):** the `ts/*` coding-agent forks (drivers fuse FROM them with provenance comments), `pi-*`, `mem0`, `continuum`, the Giselle cluster.
- **Vendored, load-bearing as binaries/services:** `c/tmux`, `go/beads`/`bd`, zrok, Polar.
- **Vendored, parked/aspirational:** `crates/{lance,tensorzero}`, `crates/openfang` (199K-LOC sidecar, no binary built), `crates/claw-code-parity`, `go/ziti`, `go/multica`, `py/{browser-use,colbert}`.
- **Built-but-unwired:** `apps/agent-gateway`, `apps/agent-worker` (docker-backend re-implements them inline), `py/ops-recorder`.

## 4. Roadmap (ordered by leverage)

1. **Decompose `server.ts` (Product B).** 19,229 lines / 14 subsystems in one file is the top structural risk and blocks every other change's safety. Extract routers incrementally; this is pure code, no capacity gate. Highest-leverage non-feature work.

2. **Prove ONE vertical slice end-to-end and put it on the storefront (A+B+F).** Pick: desktop cockpit → backend → run a real Claude Code agent in a tmux worktree → governance gate → Polar entitlement check. Capture it as the site's hero (replace the CSS mock). This converts "183 test files" into a demonstrable product.

3. **Fix billing blockers (Product F) — trivial, unblocks revenue.** Repair the corrupted `py/recoder-billing/pyproject.toml`, verify the 94-test suite green, prove BYOK-gated Launch-Web-IDE → Polar webhook → entitlement. **Polar-MoR only (no-Stripe/Turkey).**

4. **Wire the Rust governance kernel into prod (C+E).** It's built and e2e-proven; set `GOVERNANCE_SOCKET` and run the daemon. *Capacity-gated:* adds a process to a 16GB/94%-disk box — stage on CI/server, measure footprint first.

5. **Prove ONE connector channel end-to-end (D).** Slack or Telegram against a running backend. Don't chase the stranded OpenClaw discord pipeline. **Rotate the committed Daytona key in `mcp/claude-code-config.json` immediately** (security).

6. **Resolve capacity for real Daytona workloads (B) — infra/capacity-gated, not code.** Daytona substrate is live but disk-gated (94% APFS / 16GB, 135GB untouchable vcpeer). Concurrent real sandboxes need either disk reclaim/scale-up or hard concurrency caps. Report as environment evidence, never as product success.

7. **Cut the sprawl debt (C).** Per `docs/PACKAGES.md`: isolate the 28-pkg Giselle cluster under `vendor/` and pick one `mem0` runtime. (Done: `agent-kernel`/`sandbox-providers`/`database` facades removed in `067b1eb43`; stale `ts/gitnexus`→`ts/recodergit` path refs corrected.) Low risk, high clarity.

8. **Decide gateway/worker fate (A).** `apps/agent-gateway` + `apps/agent-worker` are built but duplicated inline in docker-backend. Either extract the backend to import them (kills drift) or explicitly mark them as reference. Don't leave two parallel paths.

9. **Pick the single mesh story (E).** zrok is actually wired; ziti is an uncompiled clone. Commit to zrok for previews now; keep ziti as a documented future cross-org option, not a half-pretend dependency.

10. **Park the dead weight honestly (E/C).** `lance`, `tensorzero`, `openfang`, `claw-code-parity`, `browser-use`, `colbert`, `multica`, `ops-recorder` contribute zero wired code. Move to a clearly-labeled `vendor-parked/` boundary so the owned surface is legible — these are future options, not current product.