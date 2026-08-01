# Recoder → Production-Grade Roadmap

**Target:** conductor.build parity (parallel coding agents → review → governed merge, native on Mac) **+** cursor.sh-grade codebase intelligence where it fits the convergence thesis.
**Scope:** `apps/desktop`, `backend/src`, and both engine layers (backend engines + desktop-bundled engines).
**Date:** 2026-08-01 · Branch: `feat/enterprise-s0-p0`

---

## North Star

Recoder is the **self-hosted convergence layer**: N agents run in parallel worktrees → compare/converge → **governed, evidence-producing merge**. The beachhead is *conductor.build done natively and governed*; the upsell is *the governance + convergence-evidence moat conductor doesn't have*. We adopt cursor.sh features **only where they serve the thesis** (codebase intelligence, background agents, PR-review bot). **Becoming a full code editor with inline tab-completion is an explicit non-goal** — Recoder is a cockpit, not an IDE.

## Grounded current state (verified 2026-08-01)

| Layer | State | Evidence |
|---|---|---|
| **backend/src** | Production-grade. 15 domains, all wired into `bootstrap/index.ts` + edge routes + MCP host. ~327 test files. No 501s / dark verbs. | conductor 96 tests, engines 51, agent-os 23, inference 23, memory 22 |
| **Conductor loop** | Real end-to-end: worktree lifecycle → run stream → ACP client → converge (whole-file **pick** + line-level **synthesize** via `git merge-file`) → governed merge → `ConvergenceEvidence` v3 (SHA-256 + Ed25519) → Merkle audit → 6-control compliance export | `converge/converge.ops.ts`, `evidence/*` |
| **Engines (backend)** | 3 Rust napi (openfang/tensorzero/governance) in-process; recodergit code-graph + RAG retrieval real; beads/tmux CLI | `domains/engines/constants.ts` |
| **Engines (desktop-bundled)** | Only 3 napi + beads/tmux ship. **Python sidecars (mem0, browser-use, colbert, pal-mcp) + Lance vector NAPI NOT bundled** → retrieval/E2E/pal degrade on a shipped Mac | `Recoder.app/.../Resources/` |
| **Desktop UX** | Core loop wired (create→launch→stream→review→merge→compare→converge). But run view is a **plain-text log**, approvals are a **side-list not inline**, no cost metering surfaced, 6 dead/dark views | `recoder-terminal-model.ts`, `blockregistry.ts` |
| **Packaging** | arm64-only DMG; notarization is a **manual, untracked opt-in** (`electron-builder.notarize.cjs`) — base DMG effectively unsigned; auto-update wired | `electron-builder.config.cjs` |
| **Test thin spots** | Security-critical + thin: **interop 2/19, governance 12/37, identity 12/33** | — |

---

## Phase P0 — Ship integrity (make what exists trustworthy on a clean Mac)

*Highest leverage. Today a downloaded DMG has half its engines degraded and isn't signed by default. Fix that before any parity claim.*

- **Desktop / signing:** fold `electron-builder.notarize.cjs` into the **default** build (`hardenedRuntime + notarize + staple`), so every DMG is `spctl`-accepted — not a manual side-file. Verify the auto-update feed (`dl.recoder.xyz/releases`) serves the signed artifact.
- **Engines / desktop parity:** bundle the Python sidecars (mem0, browser-use, colbert, pal-mcp) into `Resources/` with a self-contained `uv` runtime — signed + hardened + notarized — **or** a first-run "engine bootstrap" into app-support with truthful health. *(bd: "bundle Python engine sidecars into the mac DMG")*
- **Engines / retrieval:** build + ship the **Lance vector NAPI** so semantic retrieval works offline on desktop (today degrades to Qdrant/no-op).
- **Desktop / honesty:** remove the 6 dead/dark views (`recoder-tools`, `-hands`, `-openfang`, `-connectors` tombstones; unregistered `-health`; uncalled `-launch`) so the surface reflects reality.
- **Backend / test depth:** raise coverage on the moat + credential seams — **interop** (A2A edge chain, fail-closed authorize→risk→policy→audit), **governance** (kernel ladder + Merkle), **identity** (session verify + API keys). These have the largest blast radius and the thinnest tests.

**Exit:** clean-box install → `spctl` accepted, **every bundled engine reports `ready`**, no dark views, thin-domain coverage raised. *(Signing/notarize/bundle steps need a human boot-test on real hardware.)*

## Phase P1 — conductor.build parity+ (the run experience)

*Make the parallel-agent cockpit best-in-class; this is where we out-execute conductor.build.*

- **Desktop:** replace the `[time] type msg` transcript with a **structured RunEvent view** — render the existing taxonomy (`started/log/needs_input/approval_requested/tool/verified/handoff/completed/failed`) as rich blocks (tool calls, file edits, verification), not text lines.
- **Desktop:** **inline approval prompts** in the run stream — an `approval_requested` event renders approve/deny in place (wired to `/approvals/:id/decide`), replacing the disconnected side-list.
- **Desktop:** per-run **cost / token / latency metering** strip (backend metering already exists) so users see spend live per workspace.
- **Desktop:** promote **compare/converge** to a first-class review surface (already coded inline) — side-by-side siblings + per-file winner/synthesize as the headline review flow.
- **Backend:** fill the deferred optional seams — **cloud↔runEvents** bridge (cloud-sandbox runs stream to the same board) and **cloud↔billing quota** bridge.

**Exit:** run 3 agents → rich streams, inline approvals, live cost, converge + governed merge with sealed evidence — all native.

## Phase P2 — cursor-grade codebase intelligence

*Semantic code understanding for both agents and humans — fits the thesis (query the repo, ground the merge).*

- **Engines:** guarantee **recodergit code-graph** (`symbol_search`/`find_references`/`call_graph`/`definition`) + **RAG retrieval** are usable on desktop (depends on P0 sidecar/Lance + an embedder-key UX).
- **Desktop:** an **"ask the repo" / codebase-index surface** over recodergit + RAG, with truthful index status + reindex controls.
- **Engines / honesty:** implement or **remove** the catalog entries with no engine (`recoder.oss`, `recoder.deploy`, preview `issue_url`/`browser_check`/`attach_evidence`); bind the declared-but-unbound `tensorzero-loopback` daemon adapter.

**Exit:** every agent and the user can semantic-search the repo in-app; index health is truthful.

## Phase P3 — background & autonomous agents (cursor background-agents / bugbot)

- **Desktop:** a **background-agents surface** over the existing `squad-autopilot.service.ts` + `signals-poller` — schedule / create / monitor autonomous runs that pick up ready `beads` issues; cron-style scheduling UI.
- **Desktop:** a **PR-review "bugbot"** surface over the recodergit reviewer swarm — auto-review a diff/PR, surface findings inline in Review.
- **Backend:** harden squad-autopilot for unattended operation — budget caps, rate limits, kill-switch, all behind the governance gate + evidence log.

**Exit:** Recoder picks up ready work and reviews PRs autonomously, governed and evidence-logged.

## Phase P4 — enterprise convergence moat (differentiation / upsell)

- **Conductor:** **AST-aware merge synthesis** for same-file *semantic* conflicts (beyond line-level `git merge-file`). *(bd: "line-level/AST merge synthesis"; line-level already ships — this is the AST slice.)*
- **Backend:** cert-chain / **PKI** for evidence signing (beyond Ed25519 self-verify) + org-level compliance rollups + further framework mappings.
- **Multi-arch:** **x64 + universal** desktop build for enterprise fleets. *(bd: "x64 + universal mac build" — needs an x64 boot-test.)*

**Exit:** governed-convergence + evidence is demonstrably enterprise-grade across a fleet.

---

## Cross-cutting gates (every phase)

- Focused tests + a verify script per slice; **no parity claim without a clean-box boot test**.
- Degrade-truthful everywhere; never fake health/success.
- Signing / notarize / cross-arch / sidecar-bundle steps are **hardware-gated** — they need a human boot-test on real Mac hardware (arm64 today, x64 for P4).

## Explicit non-goals

- Full in-app code editor (Monaco) + inline tab-completion. Recoder is an agent cockpit; the editor stays the user's own. Revisit only if the thesis changes.

## bd tracking

| Item | Phase | bd |
|---|---|---|
| Bundle Python sidecars into DMG | P0 | filed |
| AST-aware merge synthesis | P4 | filed (line-level already ships) |
| x64 / universal build | P4 | filed |
</content>
