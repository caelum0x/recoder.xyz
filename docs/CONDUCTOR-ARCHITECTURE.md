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

0. **Reverted** node-pty mux; tmux is the substrate, pinned in the runtime image.  ← done
1. **Persistence + reconciler**: DB tables, workspace-service skeleton writing state of
   record, reconciler joining DB ∪ tmux ∪ worktrees. (The invariant first.)
2. **Runtime drivers**: real headless launch + RunEvent tailing for claude-code/codex/
   opencode/recoder-code/pi; exit→state. End-to-end run on this repo.
3. **Review path**: worktree diff → PR → merge → archive.
4. **openfang sidecar**: routing + approval risk, fail-safe.
5. **Knowledge**: context7 + mem0 + git-nexus into bundle/evidence.
6. **Interop + substrate**: A2A entry; daytona as alternate execution substrate.
7. **Thin console**: operator UI over the APIs (no chat).
