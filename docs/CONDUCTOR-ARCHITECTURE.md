# Recoder Conductor — System Architecture

Last updated: 2026-06-23. The architecture for Recoder's parallel coding-agent
infrastructure (Conductor.build-equivalent, multi-runtime, self-hostable). Read
with `BACKEND-PLATFORM.md` (component ownership) and `PIVOT-INFRA.md` (the goal).

## 0. One paragraph

Recoder runs **many coding agents in parallel**, each in an **isolated workspace**
(git worktree + branch + a persistent **tmux** terminal + an assigned runtime:
Claude Code / Codex / opencode / recoder-code / pi). The **control plane (Postgres)
is the state of record** for workspaces, runs, approvals, and artifacts; tmux + git
hold live execution; a **reconciler** rebinds them after any restart. Agents are
driven headless, their terminal output is parsed into an append-only **RunEvent**
stream (audit + UI + A2A), and every change lands as a reviewable **diff → PR →
merge → archive**. openfang (sidecar) does model-routing + approval risk scoring;
context7/mem0/git-nexus enrich the run; daytona is an alternate remote substrate.

## 1. The non-negotiable architectural invariant — survivability

The first version kept sessions in an in-memory `Map`. node-pty had the same flaw.
**Both die on deploy/restart.** Production agent runs last minutes to hours and must
survive a backend redeploy. Therefore:

- **State of record lives in Postgres** (`conductor_workspaces`, `conductor_runs`,
  reuse agent-os `approvals`/`artifacts`/`run_events`). Never in process memory.
- **Live execution lives in tmux + git worktrees**, which are independent of the
  backend process and survive its restart.
- **A reconciler** runs on boot and on a timer: it joins
  `DB workspaces ∪ tmux list-sessions ∪ git worktree list`, re-attaches healthy
  sessions, flags orphans (worktree with no DB row, DB row with no session), and
  resumes event tailing. This is the heart of the system, not an add-on.

In-memory caches are allowed only as a derived view rebuilt by the reconciler.
tmux is the chosen multiplexer precisely for this reason (persistence + reattach);
it is pinned in the runtime image and driven via its CLI (the intended usage), not
reimplemented (the node-pty `session-mux` attempt was reverted on 2026-06-23).

## 2. Domain model (owned in `@recoder/agent-os`)

```
Project        repo + .conductor config (base branch, setup cmd, run/preview cmd, runtime defaults, limits)
Workspace      one isolated unit of work: { id, projectId, taskId, branch, worktreePath,
               tmuxSession, runtimeId, status, createdBy, limits }
Task           intent: { prompt, scope, constraints, verification, approvalPolicy }
Run            one execution attempt in a workspace: { id, workspaceId, runtimeId, status, startedAt, endedAt }
RunEvent       append-only: { runId, type, state, message, data, createdAt }  (audit + stream + A2A)
Approval       gate for risky actions (openfang risk tier) : { runId, risk, status, decidedBy }
Artifact       outputs: diff ref, PR url, preview url, log ref, mem0 candidate
```

### Workspace lifecycle (state machine — legal transitions enforced in agent-os)

```
created → setting_up → ready → running ─┬→ awaiting_approval → running
                                         ├→ awaiting_review ─┬→ merging → merged → archived
                                         │                   └→ changes_requested → running
                                         └→ failed → archived
                          (any) → cancelled → archived
```

## 3. Layers (strict dependency direction: top depends down, never up)

```
8  Presentation     thin operator console (recoder-agents) + Recoder CLI + REST/WS
                    — shows workspaces/runs/diffs/approvals. NOT chat.
7  Interop (A2A)    /api/a2a/* : external agents create/observe workspaces; emits RunEvents
6  Knowledge        context7 (docs) · mem0 (memory) · git-nexus (repo intel) → bundle + evidence
5  Policy/Routing   openfang sidecar: model routing (complexity/cost) + approval risk tiers (fail-safe)
4  Runtime drivers  Task+bundle → headless CLI invocation; terminal output → RunEvents
                    (claude-code | codex | opencode | recoder-code | pi)  [uniform driver contract]
3  Execution        tmux (pinned binary) + git worktrees  |  daytona (remote)   [swappable substrate]
2  Orchestration    workspace-service: drives the lifecycle, persists to control plane, reconciles
1  Control plane    @recoder/agent-os domain + Postgres = STATE OF RECORD + RunEvent log
```

Core packages stay runtime-agnostic (`monorepo.md`): agent-os owns transitions;
the substrate (tmux/daytona) and runtimes are adapters behind contracts.

## 4. Module layout (the code, not "a couple of files")

```
packages/agent-os/                 + Workspace domain, lifecycle transitions, Project config schema
docker-backend/src/conductor/
  tmux-orchestrator.ts             tmux session lifecycle (pinned tmux: new-session -d / capture-pane / send-keys / kill)
  worktree-manager.ts              git worktree add / diff(base..HEAD) / remove ; disk accounting
  workspace-service.ts             THE BRAIN: create→setup→run→review→merge→archive; writes control plane
  runtime-commands.ts              headless invocation per runtime (claude -p / codex exec / opencode run / recoder-code --prompt / pi)
  runtime-driver.ts                stream tmux output → RunEvents; detect exit; map to run state
  reconciler.ts                    boot + timer: join DB ∪ tmux ∪ worktrees; re-attach; orphan sweep
  review.ts                        diff → PR (gh) → merge (policy-gated)
  resource-governor.ts             per-project/user parallelism caps, disk/session limits (box is 16GB/94% disk)
  conductor.routes.ts              REST + WS API
docker-backend/src/openfang/       sidecar client (route + approve), fail-safe degradation
docker-backend/migrations/         conductor_workspaces, conductor_runs (+ indexes)
```

## 5. Control flow — creating and running a workspace

```
POST /api/conductor/workspaces { projectId, prompt, runtime? }
  workspace-service.create:
    1. resolve Project config (.conductor) ; resource-governor.admit() or 429
    2. DB: insert workspace(status=created) + task            [state of record first]
    3. worktree-manager.add(repo, branch, baseRef)            → status=setting_up
    4. tmux-orchestrator.run(setupCmd) in worktree            → status=ready
    5. openfang.route(task) → runtimeId + model               (fail-safe: default runtime)
    6. bundle = instructions + context7 docs + mem0 recall
    7. runtime-commands.resolve(runtimeId, bundle) → cmd
    8. tmux-orchestrator.run(cmd) ; runtime-driver tails pane → RunEvents → status=running
  → returns { workspaceId, runId } ; client streams WS /api/conductor/runs/:id/events

run completes (driver detects tmux session exit):
    9. worktree-manager.diff() → Artifact ; status=awaiting_review
   10. approval gate if openfang risk ≥ threshold → awaiting_approval
   11. review.pr() on request → merge (policy) → archive (worktree remove, tmux kill)
```

Restart at any point → reconciler rebinds from DB + tmux + worktrees; no work lost.

## 6. Cross-cutting

- **Events**: append-only RunEvents are the single stream feeding UI (WS), audit, and
  A2A. CloudEvents envelope via `@recoder/agent-events`.
- **Security**: per-workspace env (BYOK keys) injected into the tmux session env, never
  logged; approval-gated network/secret/push; work-locks prevent path collisions across
  parallel agents; `vcpeer` and forbidden paths untouched.
- **Resource governance**: hard caps on concurrent workspaces, worktree disk, tmux
  sessions. Reject (truthfully) when over budget — never silently degrade.
- **Health**: every external (tmux, each runtime CLI, openfang sidecar, daytona) reports
  truthful availability; the API never fakes success.

## 7. Build order (each step real + verified + committed)

0. **DONE** — Reverted node-pty mux; tmux is the substrate, pinned in the runtime image.
1. **DONE** — Persistence + reconciler: Workspace domain + state machine, repository
   persistence (memory/json/postgres + migration 0002), workspace-service brain,
   reconcile() joining DB ∪ tmux ∪ worktrees (queried directly), boot hook.
2. **DONE** — Runtime commands: real headless invocations (claude/codex/opencode/
   recoder-code/gemini/qwen) + truthful availability + create-from-prompt wiring.
   (RunEvent tailing of live output still TODO; needs tmux on box for full e2e.)
3. **DONE** — Review path: worktree diff → PR (gh) → merge (gh) → archive.
4. **DEFERRED (deploy env)** — openfang sidecar: routing + approval risk. openfang
   ships its own Dockerfile; routing/approval are internal Rust (not HTTP endpoints)
   and Rust can't be built on the current disk. A client now would be a stub.
5. **DONE** — Knowledge: task constraints + git-nexus repo context + context7 docs
   into the prompt, with provenance. (mem0 recall still TODO.)
6. **DONE** — Interop + substrate: ConductorSubstrate contract with tmux_worktree +
   daytona impls (selected per Workspace.substrate); A2A entry (inbound A2A code task
   → createWorkspace, reply with workspace/run ids). `GET /substrates` exposes availability.
7. **NEXT** — Thin operator console over the APIs (no chat). [frontend — deprioritized]

### Step 6 reconciliation — reuse existing a2a services, do NOT duplicate

Investigation (2026-06-23) found the `docker-backend/src/a2a/` subsystem already has
coding-execution services. Step 6 must integrate with these, not reinvent them:

| Existing a2a service | Role | Conductor relationship |
| --- | --- | --- |
| `cli-agent-runtime.service.ts` | runs Qwen/Gemini CLIs **inside a Daytona sandbox** (startCliAgentSession/sendCliAgentPrompt) | **This is the `daytona` substrate.** Conductor's substrate abstraction gets a daytona impl that delegates here — `Workspace.substrate='daytona'` already exists for it. |
| `agent-terminal-registry.ts` | tracks **external** Claude Code/Codex terminals connecting *in* via A2A (register/route/push) | The **A2A-inbound** direction: an external agent can be targeted, or can launch a Conductor workspace. A2A entry maps an inbound code task → `workspace-service.createWorkspace`. |
| `coding-runtime.ts` | legacy web-builder per-project coding (Native/OpenCode/Omo adapters) | Legacy/web-builder path; not the Conductor host model. Leave as-is. |

**Design for Step 6 (to implement, non-duplicating):**
1. Extract a `ConductorSubstrate` interface in `conductor/` (provision / launch / capture /
   exit / teardown). Implement `tmux_worktree` (current code) + `daytona` (delegates to
   `cli-agent-runtime.service`). workspace-service selects by `Workspace.substrate`.
2. A2A entry: a handler that turns an inbound A2A code task into `createWorkspace`, and
   exposes workspace RunEvents back over A2A (reuse the a2a event bridge).

### End-to-end loop proof (headless, no BYOK)

`docker-backend/scripts/e2e-conductor-loop.ts` is a runnable, headless proof that
the **fused** loop executes end-to-end **without a BYOK key**. It drives the REAL
product engines — `workspace-service.createWorkspace` (the `@recoder/substrate`
`WorkspaceEngine`), the `@recoder/substrate` run-tailer, and the
`completion-watcher` post-run workflow — over the in-memory agent-os repository.
Only the execution substrate is swapped: it registers a BYOK-free **stub
`in_process` substrate** (a real isolated git worktree + a trivial echo "agent"
that writes a file and exits 0) in place of the runtime substrate that would need
a model key. It asserts the real loop:

- `createWorkspace` reaches `running` with a `TaskRun`;
- the run-tailer emits real RunEvents `started → log → completed` (exitCode 0);
- the completion-watcher transitions `running → awaiting_review` with a delivery
  summary (changed files, success), a memory candidate, and a review handoff.

Run: `cd docker-backend && npx tsx scripts/e2e-conductor-loop.ts` (exit 0 = PASS).
This is the substrate-swapped drive of the actual fused loop — proof the control
plane, observe loop, and review handoff actually execute together.

### Embedded-backend boot proof (desktop hosts this conductor)

`apps/desktop/scripts/dev-boot-proof.js` is the companion proof that the desktop
genuinely **hosts** this conductor: it drives the desktop `BackendSupervisor`,
boots the embedded `docker-backend` (tmux + the engines host) the same way the
packaged `.dmg` would, mints a real platform key, and asserts
`GET /api/conductor/health` returns 200 with the substrate shape
`{ available, git, tmux, tmuxBin }`. It stops the supervisor cleanly and exits 0
only on a real 200 — it never fakes readiness. Together with the loop proof above,
these two scripts show the conductor both **boots inside the product** and
**runs the loop end-to-end** without a BYOK key.

### Approval / governance gate proof (headless, FR-5)

`docker-backend/scripts/e2e-conductor-approval.ts` is a runnable, headless proof
that the **approval + governance** gate works (FR-5: a customer-visible delivery
is approval-gated). It drives the REAL delivery path — `review-publish.mergeWorkspace`
→ `delivery-approval.enforceDeliveryApproval` → `governance-gate.decideDelivery`
(the real `@recoder/governance` tier-classifier + approval risk-tier policy +
deny-biased policy chain + SHA-256 Merkle audit) — over the in-memory agent-os
**Approval repository** (the state of record), with no BYOK key and no live
server. It proves both halves of the gate:

- **(a) denied without approval** — for a task with NO approved `Approval`, the
  real `mergeWorkspace` throws `DeliveryApprovalRequiredError`, transitions the
  workspace `running → awaiting_approval`, records the gate in metadata, and
  surfaces the governance verdict (`needs_approval`, tier `high`). The merge
  never runs (the gate fires before any `git`/`gh` call).
- **(b) proceeds after a real approval** — a real `Approval` is created via the
  real `@recoder/agent-os` `ApprovalService` (request → `decide('approved')`) and
  persisted with `repository.upsertApproval`. The SAME merge then clears the gate
  (`enforceDeliveryApproval` resolves; the human sign-off satisfies the gate even
  with auto-approve off) and `mergeWorkspace` advances PAST the gate into
  `merging`, failing only at the real `gh pr merge` network step — an unrelated,
  post-gate failure that proves the approval released the delivery.

It also verifies the governance Merkle audit chain (`verifyGovernanceAudit`) so
every delivery decision is sealed tamper-evidently. Run:
`cd docker-backend && npx tsx scripts/e2e-conductor-approval.ts` (exit 0 = PASS).

### Known TODO (truthful gaps)
- ~~RunEvent tailing~~ DONE (run-tailer.ts streams pane → RunEvent log, substrate-routed).
- ~~mem0 recall in the bundle~~ DONE; ~~candidate on delivery~~ DONE (reviewable
  MemoryCandidate + pull_request artifact on merge).
- ~~Substrate interface~~ DONE — `ConductorSubstrate` (launch/capture/alive/diff/teardown)
  + registry + tmux_worktree impl; tailer/review/workspace-service all route through it;
  `GET /substrates` exposes availability. **daytona impl** (one drop-in file delegating
  to a2a/cli-agent-runtime + daytona-sdk) still TODO — needs Daytona creds to be real.
- ~~A2A entry~~ DONE (conductor/a2a-entry.ts).
- Thin operator console (step 7) — frontend, deprioritized.
- Full e2e launch verified on a box with tmux installed + agent CLI auth.
- daytona substrate runtime verification (needs Daytona creds + reachable remote).
- openfang sidecar deployment (step 4).
