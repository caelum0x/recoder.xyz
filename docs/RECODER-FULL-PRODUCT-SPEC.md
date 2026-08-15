# Recoder Full Product Specification

Status: canonical product contract for the invite-only private beta, 2026-08-15.

This document defines what Recoder is as a product, which surfaces are user-facing,
which subsystem owns each responsibility, and what "working" means. The process and
transport design is in [RECODER-CONNECTION-ARCHITECTURE.md](./RECODER-CONNECTION-ARCHITECTURE.md).
The release sequence is in [RECODER-PRIVATE-BETA-PLAN.md](./RECODER-PRIVATE-BETA-PLAN.md).

## 1. Product contract

Recoder is a local-first terminal control plane for parallel coding agents. A user
selects a repository, describes one task, launches one or more installed agent CLIs
in isolated git worktrees, observes their terminals, reviews their diffs, and accepts
one governed merge. The product output is not an agent response. It is a reviewed git
change with execution evidence.

The private beta is:

- invite-only;
- macOS arm64 only;
- bring-your-own-agent and bring-your-own-provider-key;
- local execution by default;
- manually signed, notarized, stapled, installed, and smoke-tested;
- explicitly not dependent on paid entitlement, free-token, remote-runner, mobile,
  team, or public-signup behavior.

The product remains usable when an optional engine is absent. It must not claim an
optional capability is available when its binary, configuration, credential, or
transport is missing.

## 2. Product principles

1. **The product is a terminal.** The primary experience is workspaces, running
   terminals, diffs, review, approval, and merge. Engine dashboards are not the
   product (`AGENTS.md:88-101`, `docs/RECODER-PRODUCT-DESIGN.md:66-122`).
2. **Git is the delivery boundary.** Every run starts from a known repository/ref,
   executes in an isolated worktree, and ends in an inspectable diff, commit, PR, or
   explicit refusal.
3. **Recoder owns orchestration; runtimes remain replaceable.** Claude Code, Codex,
   Cursor, opencode, pi, OpenFang, Loom, and future runtimes execute work. They do not
   own workspace lifecycle, policy, audit, or durable product state.
4. **Writes are governed and attributable.** A sensitive write must carry a principal,
   action, target, decision, and audit evidence. An approval for one target must not
   clear another target (`recoder-adsk`).
5. **Failure is visible.** Missing CLIs, dead sidecars, stale sessions, merge conflicts,
   expired auth, and denied policy decisions surface their real reason. They never
   collapse into a green health state or fabricated success.
6. **Private beta is evidence-driven.** Product work is driven by live desktop runs.
   Optional engine depth and large new surfaces wait until repeated user evidence
   demonstrates a need.

## 3. Canonical user journey

### 3.1 Install and boot

1. The tester installs the signed, notarized, stapled macOS arm64 DMG.
2. Electron starts the Wave-derived Go server and the embedded Node control plane.
3. The Node backend chooses an available loopback port, reports readiness, and the
   renderer adopts that URL through Electron IPC (`apps/desktop/app/emain/emain-backend.ts:54-67`,
   `apps/desktop/app/frontend/app/view/recoder/recoder-endpoints.ts:14-67`).
4. The app reports one product-level state: ready, degraded with a reason, or failed.
   Individual engine health belongs in diagnostics/settings, not the home screen.

### 3.2 Authenticate and establish the local principal

1. `recoder.xyz` remains the hosted account and invite source of truth
   (`app/lib/auth-config.ts:1-16`).
2. Electron starts the OAuth-style device flow, opens the system browser, polls the
   token endpoint, and stores the resulting session with `safeStorage`
   (`apps/desktop/app/emain/emain-device-auth-core.ts:6-12,187-255`).
3. The hosted identity determines invite eligibility, account display, and future
   organization membership. It does not silently become an unrestricted remote
   execution credential.
4. In the private-beta desktop, local backend mutations run as the synthetic solo
   owner only while the backend is loopback-only and uses no remote/shared database
   (`backend/src/bootstrap/solo-mode-guard.ts:1-19`,
   `backend/src/domains/identity/middleware/authenticate.middleware.ts:115-133`).
5. Future shared/team deployments must turn solo mode off and validate the hosted
   session or API key into a real user/org principal. They may not reuse the local
   fail-open path.

This deliberately separates **account identity** from **local execution authority**.
The sign-in unification remainder is tracked by `recoder-po7g`.

### 3.3 Configure agents and keys

1. Recoder detects supported agent CLIs from the effective desktop `PATH`.
2. An unavailable CLI remains visible as unavailable with a useful install/auth hint.
3. Provider keys are entered through settings and written through the Go secret-store
   RPC into one `safeStorage`-encrypted `secrets.enc` map
   (`apps/desktop/app/frontend/app/view/recoder-settings/recoder-settings-model.ts:119-130`,
   `apps/desktop/server/pkg/secretstore/secretstore.go:26`).
4. Electron decrypts only an explicit allowlist into the embedded backend child
   environment (`apps/desktop/app/emain/emain-backend-runtime-env.ts:55-83,231-272`).
5. Private-beta acceptance assumes BYOK. Platform inference allowance, checkout,
   subscription, cancellation, and billing copy are not beta launch dependencies.

### 3.4 Select a repository and launch work

1. The user selects a local repository or clones one through the product flow.
2. Recoder reads the base ref, git identity, runtime availability, and optional setup
   configuration.
3. A workspace record is created before execution. Its identity includes owner,
   project/repository, task, runtime, substrate, branch, worktree, and lifecycle state.
4. The conductor creates an isolated worktree and launches the selected runtime.
   Loom is the current default substrate unless explicitly disabled; tmux remains the
   fallback substrate selected by configuration, not a silent runtime fallback
   (`backend/src/bootstrap/index.ts:815-887,1197-1203`).
5. The conductor injects a secret-free `.mcp.json` that lets the agent call the local
   governed MCP host (`backend/src/bootstrap/index.ts:949-970`).
6. Every launch produces a durable run-event stream. Failure to create the worktree,
   start the runtime, or connect its terminal transitions to an explicit failed state.

### 3.5 Observe and intervene

1. The workspace detail surface shows the real terminal session, not a reconstructed
   chat transcript.
2. Terminal output and structured RunEvents stream independently; reconnect replays
   durable events and reattaches to the live substrate when possible.
3. A policy decision that needs a human appears inline at the affected run/diff action.
   Approval or rejection resumes or refuses that exact action and target.
4. A user can send a bounded steer/message to the live workspace. A gone session or
   unsupported transport refuses truthfully.

### 3.6 Review, converge, and merge

1. The review surface loads the workspace diff, worktree status, checks, PR metadata,
   evidence, and unresolved approvals.
2. Multiple sibling runs can be compared by task group. Non-conflicting changes can
   be combined; contested changes require a visible selection or synthesis result.
3. Merge readiness is a read model, not proof that merge will succeed. The merge
   operation revalidates ownership, policy, repository state, approvals, and conflicts.
4. A merge denial or conflict is a product result with recovery guidance, not an
   exception hidden behind a generic error.
5. On success Recoder records the selected source(s), resulting branch/commit, review
   decisions, governance verdicts, verification artifacts, and completion outcome.

### 3.7 Recover and retry

1. Backend restart keeps workspace/run records in the embedded SQLite state-of-record
   (`apps/desktop/app/emain/emain-backend-core.ts:407-411`).
2. Reconciliation compares records with real Loom/tmux sessions and marks drift.
3. The UI reconnects to a reassigned backend port without retaining stale URLs.
4. Auth expiry offers a fresh device-flow sign-in without deleting local workspace
   state.
5. Retry creates a new attributable attempt or resumes a supported runtime; it never
   rewrites a failed run as successful.

## 4. User-visible surface inventory

| Surface | Classification | Product responsibility |
|---|---|---|
| Board/home | Primary | Repository selection, new task, workspace lifecycle, parallel groups, needs-attention state. |
| Workspace terminal | Primary | Real live agent session, attach/reconnect, steer, output. |
| Diff/review | Primary | File/hunk review, readiness, comments, evidence, PR/merge action. |
| Compare/converge | Primary | N-run comparison, source selection, conflict handling, resulting branch. |
| Inline approval | Primary contextual | Exact blocked action/target, approve or reject in context. No separate approvals dashboard in normal use. |
| Settings | Secondary | Account identity, detected agents, BYOK secrets, diagnostics, update channel. |
| Run history/audit export | Secondary | Searchable completed runs and evidence export. |
| Memory, capabilities, engines, workflows, locks, usage | Diagnostic/debug | Useful for development and support; not primary navigation and never required to understand the core loop. |
| Retired OpenFang/Pal/infrastructure tabs | Retired | Tombstones may offer an explicit close action; new installs do not seed them. |

The existence of a React component does not make it a product surface. Primary
navigation must follow this table.

## 5. System ownership

| Area | Owns | Must not own |
|---|---|---|
| `app/` | Hosted auth, invite/account UI, device-code issue/authorize/exchange/refresh, future account policy | Local worktrees, terminal sessions, merge execution, private-beta billing enforcement |
| `apps/desktop/app` | Electron lifecycle, renderer, IPC, update/install, backend URL injection, encrypted desktop session and secret bridge | Domain capability logic or direct engine calls from React |
| `apps/desktop/server` | Wave shell state, terminal blocks, wsh RPC, local secret-store writer, SSH/file primitives inherited from the shell | Agent orchestration policy, convergence, hosted identity authority |
| `apps/desktop/tsunami` | Optional Go/VDOM extension runtime and scaffolding for Wave blocks | Private-beta core workflow or a second control plane |
| `backend/src` | Product control plane: identity seam, governance, agent-os, conductor, engine host, HTTP/WS/MCP edges, durable run state | Electron UI state or hosted account database ownership |
| Desktop/native engines | Execution and specialized capability behind adapters | User-facing product navigation or independent state-of-record |
| Git/worktrees | Source isolation and merge truth | Account identity, policy, or event history |
| Beads | Issue graph and reviewable memory candidates | Silent automatic durable memory promotion |

## 6. Runtime and engine policy

### Core private-beta runtime

- **Loom:** default native agent/worktree substrate when its packaged binary and
  protocol-20 Unix socket are healthy. Launch failure is loud; no silent fallback.
- **tmux:** pinned terminal substrate and proven recovery/introspection path. It is the
  configured fallback when Loom is disabled.
- **dmux:** optional layout/attention helper for parallel work; core launches and
  reviews must work without it.
- **Agent CLIs:** user-installed execution runtimes discovered from `PATH`; Recoder
  does not bundle their credentials or claim they are authenticated based on presence.

### Packaged native capabilities

- **OpenFang NAPI:** optional in-process runtime.
- **TensorZero NAPI:** optional inference gateway for configured BYOK paths.
- **Recoder governance NAPI:** native policy kernel with deny-biased fallback behavior.
- **Lance NAPI:** embedded retrieval store when present.
- **Beads binary:** issue-graph/memory capability.

### Explicitly unavailable or deferred in private beta

- **RecoderGit:** excluded from the DMG because PolyForm Noncommercial does not permit
  the intended distribution. The product reports code-graph features unavailable
  (`apps/desktop/app/electron-builder.config.cjs:148-158`).
- **Python sidecars:** not required for private-beta acceptance; use embedded/native
  paths or report their features unavailable. Bundling is tracked by `recoder-b8ol`.
- **OpenClaw/social connectors:** in-process backend capability, but public webhook
  ingress and channel onboarding are outside the private-beta core loop.
- **Multica, Ziti, xDS:** optional/deferred. They may enrich squads or future remote
  infrastructure but do not gate local workspaces.
- **Tsunami apps:** supported shell extension mechanism, not a beta product dependency.

## 7. Product state model

The durable workspace state machine is the `WorkspaceState` contract in
`packages/agent-os/src/domain/workspace.ts`:

`created -> setting_up -> ready -> running -> awaiting_approval | awaiting_review`

From review, a workspace can move through `changes_requested`, `merging`, `merged`,
or `failed`; `cancelled` and `archived` are also represented. The exact allowed
transitions are defined beside the type and are authoritative. Only `archived` is
irreversible in the current implementation: failed work can return to review, and
merged, failed, or cancelled work can be archived.

Rules:

- A workspace and an execution attempt are distinct. Retrying does not erase history.
- `awaiting_review` means execution ended and a diff/readiness view can be produced.
  It does not mean checks passed or merge is authorized.
- `awaiting_approval` holds an action whose exact target remains part of the policy
  and audit record.
- Needs-input and refusal are attention/event outcomes, not fabricated workspace
  states. Delivery completion is recorded by `merged` plus evidence, not merely an
  agent-process exit code.
- `archived` hides a record from the active board; it is not deletion.
- Unknown engine/session state remains `unknown` or `degraded`, never inferred clean.

## 8. Evidence contract

Every beta run artifact must contain, with secrets redacted:

- app version and git commit;
- installation/build identity and architecture;
- hosted sign-in outcome and refresh outcome;
- embedded backend URL and health summary;
- selected repository, base ref, runtime, and substrate;
- workspace/run/task-group ids;
- launch, attach, and reconnect outcomes;
- diff/readiness summary;
- approvals and exact governed targets;
- converge/merge or refusal result;
- user-visible failure text;
- links or ids for logs, audit, and exported evidence.

The v2 collector at `scripts/private-beta-run-artifact.ts` captures host architecture,
the installed artifact hash, workspace/task/run identity, repository, task-scoped
approval decisions and exact targets, and all backend-derived review evidence. A
redacted context file supplies sign-in, refresh, terminal-attach, and reconnect
observations that cannot be read safely outside Electron. `contract.complete` is
false with named missing fields until the full evidence shape is present. The real
clean-machine proof remains `recoder-1ejn`.

## 9. Private-beta acceptance

A release candidate is accepted only after a real fresh-machine run proves:

1. the DMG installs and launches without quarantine/signature failure;
2. invited-user sign-in and token refresh work;
3. backend port reassignment reaches the renderer;
4. at least one installed agent CLI is detected and one unavailable CLI reports a
   truthful reason;
5. a real repository opens and a worktree launches;
6. the terminal attaches and continues after a renderer/backend reconnect;
7. the diff and merge-readiness view load;
8. an approval-required action is scoped to its exact target;
9. a valid merge succeeds and an invalid/conflicted merge refuses visibly;
10. the run artifact contains the evidence contract above.

Billing, public signup, x64/universal packaging, Python sidecars, remote attach,
social connectors, background agents, governed skills, and AST convergence are not
part of this acceptance gate.

## 10. Status vocabulary

Architecture and roadmap documents use only these capability statuses:

- `shipped`: code exists and the relevant product path was exercised.
- `shipped-gui-unverified`: implementation exists, but the required real desktop run
  is still open.
- `partial`: a bounded slice works; named remainder exists.
- `owner-gated`: code cannot establish the result without owner authority, credentials,
  licensing, security decision, or production action.
- `deferred`: intentionally outside the current product gate.
- `decision-made`: an issue records a resolved decision and should be closed or turned
  into a separate implementation issue.
- `retired`: not part of the product and should not appear on a clean install.

Broad phrases such as "fully realized" or "done" must not replace claim-level status.
