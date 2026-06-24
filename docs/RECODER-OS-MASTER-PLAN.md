# Recoder — The OS for Coding Agents (Master Plan)

Last updated: 2026-06-24. This is the **north-star plan** for the new direction.
It supersedes the legacy web-app framing (see `PIVOT-INFRA.md`, now folded in)
and is the canonical reference for product, architecture, stack, the owned-OSS
merge/rebrand, the website, and desktop + MCP distribution.

> Status of evidence: competitive analysis of **conductor.build** and **cursor.com**
> is research-verified (workflow `wrdpl07uc`). The 4 niche sites (nozomio,
> agentsearch.sh, trynia.ai, getfolk.app) and 5 deep tech topics hit the account
> session limit and are synthesized from current knowledge — flagged **[verify @reset]**
> for a live re-run after the limit resets.

---

## 1. Thesis & category

**Recoder is the operating system for coding agents.** It runs and orchestrates
many coding agents — Claude Code, Codex, opencode, pi, recoder-code — in parallel,
isolated, observable, with a control plane of record (tasks, runs, approvals,
delivery) and a full audit trail. Multi-runtime, cross-platform, **self-hostable**.

We are **not** a web app, a chat wrapper, a web builder, or "another agent." We are
the **control + review + audit surface** over the agents people already run.

### Category phrase (own it everywhere)

Pick ONE string and use it identically in the H1, `<title>`, and meta description:

> **"The OS for coding agents."**  (sub-line: "Run Claude Code, Codex, and more — in parallel, under control.")

This mirrors Conductor's discipline (headline = title = primary keyword = promise)
and Cursor's category-claim move ("the best AI coding agent").

### Differentiation (the moat vs Conductor & Cursor)

| Axis | Conductor | Cursor | **Recoder** |
| --- | --- | --- | --- |
| Form | Mac-only app | Mac/Win/Linux IDE | **Cross-platform app + CLI + MCP + API**, self-hostable |
| Scope | orchestrate+review | agent-native IDE | **full control plane**: task→run→approval→artifact→PR→preview→audit |
| Runtime | Claude/Codex/Cursor | own agent | **runtime-agnostic adapters** (claude-code/codex/opencode/pi/recoder-code) + A2A |
| Governance | enterprise (later) | enterprise | **approvals, work-locks, signed envelopes, memory provenance built-in** |
| Ownership | closed | closed | **owns its whole OSS stack** as first-party `@recoder/*` |
| Interop | — | — | **A2A + MCP native** (host and client) |

Recoder's edge = **governance + self-hostability + interop**, on top of the same
"parallel agents, one review surface" insight Conductor validated.

---

## 2. Product surfaces

Five surfaces over one backend. The **desktop app is the primary consumer surface**
(Conductor/Cursor both prove "Download" beats "Sign up" for dev tools).

1. **Recoder Desktop** — the flagship. Watch many agents at once (board of workspaces
   with live output, diffs, run state, approvals), review → PR → merge → archive.
   *Today:* `apps/desktop` is a signed+notarized **Electron** app. *Plan:* keep it as
   the shipping baseline; evaluate **Tauri v2** migration (Rust-core alignment, smaller
   binary) as a later wave. Bundles a local Recoder daemon for offline/self-host mode.
2. **Recoder CLI** (`recoder-code`, `packages/cli`) — launch/observe parallel runs from
   the terminal; distributed via `homebrew-recoder` tap + npm.
3. **Recoder MCP** (`mcp/recoder-mcp-server`, `packages/agent-mcp`) — installable into
   Claude Desktop / Cursor / any MCP host. One-click/deeplink install. Lets the agents
   people already use drive Recoder.
4. **Control-plane API** (`/api/agent-os/*`, `/api/conductor/*`, `/api/a2a/*`,
   `/api/mcp/*`) on `docker-backend` — the state of record. A **thin** web console only
   (status, not chat).
5. **A2A interop** — external agents create/observe Recoder workspaces via `/api/a2a/*`.

**BYO agent login** (Conductor's winning move): no API-key capture, no markup; reuse the
user's existing Claude Code / Codex login. Accounts gated only for cloud/collab.

---

## 3. System architecture (institutional, production)

Strict top-depends-down layering. Core packages stay runtime-agnostic.

```
8  Surfaces        Recoder Desktop · CLI · MCP server · thin web console · REST/WS
7  Interop         A2A (/api/a2a/*) · MCP host (/api/mcp/*)  — external agents in/out
6  Knowledge       context7 (docs) · mem0 (memory) · git-nexus (repo intel) → bundle+evidence
5  Policy/Routing   openfang sidecar (Rust): model routing + approval risk tiers (fail-safe)
4  Runtime drivers  task+bundle → headless agent CLI; output → RunEvents
                    [claude-code | codex | opencode | pi | recoder-code]  (uniform driver)
3  Execution        tmux + git worktrees | daytona (remote) | E2B   [swappable substrate]
2  Orchestration    workspace-service (the brain): lifecycle + reconcile after restart
1  Control plane    @recoder/agent-os domain + Postgres = STATE OF RECORD + RunEvent log
0  Network/Infra    OpenZiti (zero-trust mesh) · beads (issue state) · vault/secrets
```

**Survivability invariant** (already designed in Conductor work): state of record in
Postgres; live execution in tmux+worktrees (survive backend restart); a reconciler
joins `DB ∪ tmux ∪ worktrees` on boot/timer. Never in-memory as source of truth.

Most of this already exists under `docker-backend/src/{agent-os,conductor,a2a}` and
`packages/@recoder/*`. This plan is **consolidation + rebrand + completion**, not a
greenfield rewrite.

---

## 4. Stack (TypeScript · Go · Rust · Python)

Each language earns its place; no polyglot-for-its-own-sake.

| Language | Owns | Why |
| --- | --- | --- |
| **TypeScript** | control plane (`docker-backend`), all `@recoder/*` packages, adapters, SDK, web, MCP server, Electron desktop | the spine; one language for contracts + most logic |
| **Rust** | `openfang` sidecar (routing/approval/kernel), perf-critical core, (future) Tauri desktop shell | safety + speed for the policy kernel and native app |
| **Go** | `beads` (issue tracker `bd`), `ziti` (zero-trust mesh), optional local daemon | best-in-class single-binary CLIs + networking |
| **Python** | `pal-mcp-server`, evals/ML, capability backends | MCP/Python ecosystem + research/eval tooling |

### Monorepo orchestration

- **TS:** pnpm workspaces + **Turborepo** (already in place).
- **Rust:** **cargo workspace** at `crates/` (move `openfang` → `crates/recoder-openfang`).
- **Go:** **go workspace** (`go.work`) over `go/` (move `beads`, `ziti` adapters).
- **Python:** **uv** workspace over `py/` (move `pal-mcp-server`).
- **Cross-language contracts:** `@recoder/agent-schemas` (+ `protocol`) is the single
  source; generate Go/Rust/Python types from JSON Schema in CI so all languages share
  one wire contract (A2A envelopes, RunEvents, task specs).
- **CI:** per-language matrix (pnpm/turbo, cargo, go, uv) + the existing
  `agent-os:instructions:check` / contract / eval gates. **[verify @reset]** for
  2026 best-practice specifics.

---

## 5. Owned-OSS merge + rebrand map

**Everything is first-party Recoder** — owned, merged, renamed. No "vendor", no shims.
Normalize ALL package names to the `@recoder/*` scope (kill `recoder-x`, `oh-my-*`,
`open*`, `roo-*`, external author scopes).

### Top-level owned dirs → targets

| Dir | What it is | Lang | → Owned target | Role |
| --- | --- | --- | --- | --- |
| `beads` | `bd` issue tracker (steveyegge/beads) | Go | `go/recoder-beads` + `@recoder/beads-adapter` | issue/task state |
| `ziti` | OpenZiti zero-trust mesh | Go | `go/recoder-mesh` | secure runner↔control-plane networking |
| `openfang` | Agent-OS router/approval/kernel | Rust | `crates/recoder-openfang` | policy/routing sidecar (layer 5) |
| `daytona-projects` | Daytona sandbox SDK | TS | `@recoder/sandbox-daytona` (exists) | remote substrate (layer 3) |
| `oh-my-codex` | Codex CLI orchestration | TS+Rust | `@recoder/runtime-codex` | Codex runtime driver (layer 4) |
| `oh-my-openagent` | opencode harness ("oh-my-opencode") | TS | `@recoder/runtime-opencode` | opencode runtime driver |
| `open-agents` | agent framework | TS | fold into `@recoder/agent-runtimes` | runtime adapter logic |
| `openclaw` | WhatsApp/messaging gateway + Pi RPC | TS | `@recoder/gateway-messaging` | social/notify channel (interop) |
| `multica` | multi-agent layer | TS | fold into `@recoder/agent-workflows` | orchestration logic |
| `pal-mcp-server` | "PAL MCP: many workflows, one context" | Python | `py/recoder-pal-mcp` + `@recoder/pal` | MCP server / context |
| `ClawWork` | AI coworker evolution (docs/proto) | mixed | mine logic → archive | reference |
| `polar` | open-source payments infra | TS | `@recoder/billing` (Polar-based) | billing/entitlements |

### Package-name normalization (already mostly `@recoder/*`)

Rename these stragglers to the scope: `recoder-analytics`, `recoder-intelligence`,
`recoder-performance`, `recoder-plugins`, `recoder-security`, `recoder-shared`,
`recoder-a2a`, `recoder-cli`, `recoder-cli-router`, `recoder-code-workspace`,
`roo-code-types` → `@recoder/*`. Keep public CLI bin names user-facing (`recoder`,
`bd`).

**Merge approach (per package):** rename manifest → codemod imports across repo →
build green → commit. Track each as a `bd` issue; keep the monorepo green at every step.

---

## 6. Desktop app + MCP installation (answering "what do we do")

**You already have the bones** — formalize them into a one-click story.

### Desktop

- **Now:** ship `apps/desktop` (Electron, already signed/notarized:
  `build-signed.js`, `entitlements.mac.plist`, `notarize.js`). Add Windows/Linux
  builds + **auto-update** (electron-updater). Distribute via the site's single
  "Download Recoder" button (OS auto-detect, like Cursor).
- **Next wave:** evaluate **Tauri v2** shell (Rust core, ~10x smaller, native) — only
  if migration cost is justified; the `openfang` Rust core makes this natural. **[verify @reset]**
- The app bundles a **local Recoder daemon** (control-plane in local mode) so it works
  self-hosted/offline; cloud mode connects to `api.recoder.xyz`.

### MCP

- **Now:** consolidate `mcp/recoder-mcp-server` + bridges (`recoder-claude-bridge`,
  `recoder-codex-adapter`) + `packages/agent-mcp` into **one** published
  `@recoder/mcp` server.
- **One-click install:** ship (a) `npx @recoder/mcp` + a generated
  `claude-code-config.json` snippet, (b) a deeplink/registry entry for Claude Desktop
  & Cursor MCP install, (c) the desktop app auto-registers the MCP server on install.
- BYO login; remote (Streamable HTTP) MCP for cloud, stdio for local. **[verify @reset]**
  for 2026 MCP install-URI/registry specifics.

### CLI

- `homebrew-recoder` tap + `npm i -g @recoder/cli` (`recoder` bin). `recoder login`,
  `recoder run`, `recoder ps`, `recoder review`.

---

## 7. Website — recoder.xyz (Cursor-simple, one CTA per page)

Verified principles from Conductor + Cursor analysis:

- **One high-emphasis CTA per page.** Primary everywhere = **"Download Recoder"**
  (OS auto-detect). Everything else (Docs, Changelog, Enterprise) = plain text links,
  never competing buttons. Enterprise path = "Contact sales".
- **Headline = title = keyword = promise** → "The OS for coding agents."
- **Zero signup friction** at the front door; BYO agent login.
- **Sell the control plane, not the agent** — one strong product screenshot of the
  multi-agent board (agents online, run state, approvals, verification) carries the
  visual weight. No feature-grid bloat.
- **Changelog-as-SEO** — public, per-release entries on individual slugs
  (`/changelog/x.y.z`): fresh long-tail pages + momentum signal. Higher ROI than a blog.
- **Design:** near-monochrome dark canvas, large tight hero type, high whitespace,
  product UI provides the only color. Linear/Vercel/Cursor lineage.

### Page map

| Page | H1 / purpose | Single CTA |
| --- | --- | --- |
| `/` Home | "The OS for coding agents." + one product visual + social proof | **Download Recoder** |
| `/download` | OS-specific builds + checksums | Download (auto) |
| `/enterprise` | security · approvals · audit · self-host (Recoder's strength) | **Contact sales** |
| `/docs` | install, concepts, runtime config (informational SEO) | (in-doc) |
| `/changelog/*` | per-release notes (SEO + credibility) | Download |
| `/pricing` | Free (individual) · Enterprise (contact) | Download / Contact |

### Stack

Next.js (app-router) + Tailwind, `@recoder/ui` + `@recoder/design-tokens`, deployed on
Vercel or self-hosted; full metadata + JSON-LD `SoftwareApplication`, sitemap, OG.
This is a **new, minimal** marketing app (replacing the removed `app/`), not a port of
the old web app. **[verify @reset]** for 2026 Next.js SEO specifics.

---

## 8. Execution waves (each: real, verified, committed)

0. **Reference cleanup** (`recoder-d6bg`) — finish sweeping refs to removed legacy
   surfaces (scripts/CI/nginx/A2A registry/apex app + auth decision).
1. **Rebrand pass** — normalize all package names to `@recoder/*`; codemod imports;
   green build. Per-package `bd` issues.
2. **Owned-OSS merge** — move `openfang`→`crates/`, `beads`/`ziti`→`go/`,
   `pal-mcp-server`→`py/`; set up cargo/go/uv workspaces + cross-lang codegen from
   `agent-schemas`. Fold `oh-my-codex`/`oh-my-openagent`/`open-agents`/`multica` into
   the runtime/workflow packages.
3. **Runtime drivers complete** — claude-code/codex/opencode/pi/recoder-code headless,
   verified on a tmux box; openfang sidecar wired (routing+approval).
4. **Distribution** — unified `@recoder/mcp` + one-click install; desktop auto-update +
   Win/Linux; CLI via homebrew+npm.
5. **Website** — new minimal recoder.xyz (one-CTA, changelog-SEO, control-plane visual).
6. **Self-host** — single-command self-hosted Recoder (compose + daemon).

---

## 9. Risks

- **Scale of rebrand/merge** — 80+ packages + 12 dirs across 4 languages; mitigate with
  codemods + per-package green-build commits.
- **Polyglot CI/build complexity** — cross-language codegen is the linchpin; invest early.
- **Desktop signing/auto-update** across 3 OSes — Electron baseline reduces risk; Tauri
  migration is optional.
- **Session/rate limits** — large parallel agent fan-outs exhaust quota (this plan's
  research run hit it); pace orchestration.
- **Auth source-of-truth** — removing the apex web app touches auth; decide before cut.

## 10. Live-verify backlog (after session reset, 10:30pm Europ/Istanbul)

Re-run the failed research: niche sites **nozomio.com, agentsearch.sh, trynia.ai,
getfolk.app**; and tech topics **agent-OS landscape, Tauri/desktop distribution, MCP
install/registry 2026, multi-language monorepo 2026, Cursor-style Next.js SEO 2026**.
Resume via `Workflow({scriptPath, resumeFromRunId:"wf_429fa715-1f4"})` — the 2 cached
site results return instantly; only the failed agents re-run.
