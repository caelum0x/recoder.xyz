# Recoder — Whole Product Plan

Last updated: 2026-06-22. Canonical synthesis of `agent-os.md`, `arch.md`,
`collaboration-api.md`, `direction.md`, `plan.md`, `prd.md`, `product.md`,
`remaining.md`, `todo`. When this conflicts with a narrower doc on *sequencing*,
`plan.md → remaining.md` win; on *surface keep/cut*, `direction.md` wins; this
file is the top-level "what we're building and in what order" map.

## 1. What Recoder is (one sentence)

Recoder is the **control plane for AI agents** — one workspace where humans and
many agents take tasks, work under durable identity + policy, and ship software
through artifacts, PRs, previews, and approvals with a full audit trail.
**Not a better prompt box.** The wedge is *"many agents need one workspace,"* not
*"our agent is smarter."*

The moat is the spine, not the UI: `packages/agent-os` (canonical domain) +
`docker-backend /api/agent-os/*` (canonical state) + `packages/a2a-sdk` (one wire
contract). Runtimes (Claude Code, Codex, Recoder Code/pi, browser, custom) are
**replaceable execution surfaces**.

## 2. The product loop (the thing every surface must reflect)

From `agent-os.md`:

1. Human gives high-level task intent.
2. Recoder compiles a structured **task spec**.
3. Recoder compiles a runtime-specific **instruction bundle** (auditable artifact:
   goal, instructions, source refs, acceptance criteria, verification commands,
   forbidden actions, approval gates, memory refs, provenance).
4. A runtime **claims** and executes under policy.
5. **Verification** runs.
6. **Artifacts / approvals / preview links / handoff** are stored.
7. **Memory candidates** are proposed with evidence for review.

Manual prompt writing is a fallback, not the product. **Every UI shows this loop's
state — task → bundle → run → verification → artifact → PR → preview → approval →
handoff — not a chat thread.**

## 3. Why this shape (the pivot)

v1 bet on app-level products (recoder-web IDE, recoder-studio, OpenClaw) — they
didn't land. Recoder pivoted to **infra + the Agent OS control plane** as the
defensible, unicorn-scale layer. Retired surfaces are being cut (recoder-web done:
CLI/deploy/A2A cleanup shipped; nginx vhost removed). See `direction.md`.

## 4. Surfaces and their roles (keep/cut per direction.md)

| Surface | Role | Status |
| --- | --- | --- |
| `packages/agent-os` + `docker-backend /api/agent-os/*` | **Moat** — canonical domain + state | KEEP |
| `packages/a2a-sdk` (+ owned `@recoder/a2a-js`) | One A2A wire contract + server | KEEP |
| `app/` → recoder.xyz | **Consumer** — marketing, auth source of truth, Spaces creation, end-user workspace | KEEP (needs control-plane UI — see §6) |
| `recoder-agents/` → agents.recoder.xyz | **Operator** — mission control: runs, timeline, approvals, delivery, billing | KEEP (already renders `/api/agent-os/summary` cards) |
| Recoder Code (CLI) + owned `@recoder/pi-*` | **Wedge demo** — first-party reference agent | KEEP (pi merged + `recoder-code pi`) |
| A2A Gateway | External-agent ingress | KEEP |
| `recoder-pm/` → pm.recoder.xyz | Approval/handoff surface | KEEP (consolidate into agents over time) |
| `recoder-agency/` | Later monetization (client delivery) | FROZEN |
| recoder-studio / recoder-web / OpenClaw-as-product | — | RETIRED/REMOVED |
| vcpeer | Separate product, live traffic | DO NOT TOUCH |
| Edge / Marketplace / Launch / Runner / Deploy | Later modules | DEFERRED |

## 5. Current state (what's actually built)

- **Agent OS spine is real:** domain models + services (run-history ~596 LOC,
  work-signal ~377, routing, approvals, runtime-evidence, instruction compiler),
  `/api/agent-os/*` (summary, events, runs, approvals, memory, instructions,
  context-pack, handoff), CloudEvent outbox.
- **OSS owned + wired (first-party `@recoder/*`):** mem0 (memory + semantic
  recall), daytona (sandbox SDK + clients), a2a-js (types + server runtime),
  git-nexus (code context), pi (agent runtime, in A2A + Recoder Code), context7
  (live docs); polar billing tier link; openclaw/ziti/beads integrated. See
  `16/17/18-oss-*`. Remaining runtime-specific: stagehand, opencode, agent-browser, pal.
- **Lifecycle features shipped:** work-signals folded into run history; handoff is
  a first-class run action (`POST /runs/:runId/handoff` + `recoder.run.handoff`
  CloudEvent); cockpit summary exposes handoff payloads; A2A `recoder_web`→`recoder_app`
  contract rename.

## 6. The #1 product gap (and priority): recoder.xyz must show the control plane

**Problem (user-reported):** the recoder.xyz `app/` is confusing and presents
agents as ChatGPT-like chat. **No `app/` page consumes `/api/agent-os/summary`;**
the dashboard routes to `/chat`. This contradicts the thesis and `frontend.md`
("show control-plane state, not raw prompt chats").

**Fix (priority work):**
1. Make the recoder.xyz workspace/dashboard render **control-plane state** from
   `/api/agent-os/summary` — online agents + capabilities, active tasks/runs +
   state, approvals waiting, runtime evidence, delivery artifacts (PR/preview),
   open handoff/work-signals — reusing the `@recoder/ui-agent-os` cockpit cards
   that `recoder-agents` already uses.
2. Demote `/chat` to a fallback "ask for help / draft a task spec" entry, not the
   primary agent surface. The primary surface is the run timeline + approval gate.
3. Keep `app/` = consumer Spaces/identity; deep operator views live in
   `recoder-agents`. Don't rebuild the same view twice; share `@recoder/ui-agent-os`.
4. Use explicit state labels + evidence links over "AI is working" copy
   (`frontend.md`). Show missing data sources honestly.

## 7. Launch gate (blocks first paid users — remaining.md)

`signup → choose plan → create Space → connect agent → connect GitHub repo →
create/claim task → produce artifact → open/attach PR → create protected preview →
approve → see billing limits + upgrade prompts on the same loop.`

Local + API paths exist (`agent-os:verify-paid-loop`); what remains is **deployed
production verification** + edge/preview infra (`recoder-zvss`), deploy hygiene
(`recoder-js56`), and the §6 consumer-UI work so the loop is *visible* to users.

## 8. Phase-2 backend backlog (plan.md "Next Concrete Coding Sequence")

Conflict-aware order (a2a-gateway.ts is the shared chokepoint):
1. **a2a-contract** — canonical envelope validation/routing/error taxonomy (foundation).
2. **registry-session** ‖ **pm-approval/handoff** (parallel; handoff action shipped).
3. **capability-routing** (route by capability/policy/assignee/intent).
4. **runtime-evidence** normalization → 5. **run-history unification** (work-signals folded ✓).

## 9. Roadmap (sequenced)

- **Now:** §6 recoder.xyz control-plane UI (consume `/api/agent-os/summary`) — closes
  the "ChatGPT confusion" + makes the launch-gate loop visible.
- **Next:** finish Phase-2 a2a-contract + capability-routing; deepen runtime-evidence
  (git/stdout/stderr/preview) using owned daytona/git-nexus.
- **Then:** deployed launch-gate verification (paid loop on prod), edge/preview infra.
- **Parallel/owned-OSS:** finish runtime-specific merges (stagehand browser-runtime,
  opencode, agent-browser, pal) as focused per-runtime efforts.
- **Deferred:** Agency (frozen), Edge/Marketplace/Launch, on-box LLM (16GB box → cloud LLM + Qdrant).

## 10. Operating principles (cross-cutting)

- Own the OSS as first-party `@recoder/*`, deeply wired — no thin HTTP shims.
- Keep `user`/`users` models separate; recoder.xyz is auth source of truth.
- Truthful health; never fake success; verification before "done".
- Memory is reviewable evidence-backed candidates, not silent state.
- Approvals are first-class lifecycle states; full provenance per run.
