# Recoder Platform Status and Agent-OS Backlog

Last updated: 2026-05-07

## Goal

Keep the live Recoder surfaces working end to end while turning the platform into an agent OS for external AI agents doing real software work.

## Production Snapshot

| Surface | URL | Current truth |
| --- | --- | --- |
| Hub | `recoder.xyz` | Core auth and main-site flows are live. |
| Web IDE | `web.recoder.xyz` | First-turn authenticated build requests now reach the coding runtime, but preview proof is still not reliable enough to trust the lane end to end. |
| Agents | `agents.recoder.xyz` | Authenticated core flow is verified live, including `/v1/agent/start` and follow-up chat rendering. |
| PM | `pm.recoder.xyz` | Feature-route `Invalid URL` crash is fixed live. `View in portal` still needs positive UI verification. |
| Agency | `agency.recoder.xyz` | Previously verified on key authenticated routes. No new local code changes in this status pass. |
| Docker Backend | `docker.recoder.xyz` | Daytona preview routing is explicit and signed preview flow is live. Build-mode runtime and preview responsiveness are still the main backend risk. |
| API Backend | `api.recoder.xyz` | No new public API blocker beyond sandbox and runtime coordination. |
| Docs | `docs.recoder.xyz` | Live. |

## Verified Working Paths

- `web.recoder.xyz/api/create-sandbox` can return `200`.
- `docker.recoder.xyz/api/container` can create or recover a Daytona-backed project mapping.
- first-turn browser build requests now emit `/api/chat`.
- Daytona preview health can return signed preview URLs for the candidate ports.
- `agents.recoder.xyz` authenticated start flow and follow-up chat rendering are verified live.

## Active Runtime Blockers

### 1. Build-mode runtime can still end without responding preview proof

Symptoms:

- build-mode chat can return `200`
- starter entry files may mutate, but preview health still reports no responding port
- dev-server logs can remain empty even after the coding backend reports completion

Current implementation areas:

- `recoder-web` build and deep-coding routing
- `docker-backend` sandbox-local coding runtime and dev-server bootstrap
- Daytona preview health and port-probing path

Required outcome:

- build-mode success requires both observable file mutation and a responding preview port
- dev-server startup failures surface clearly instead of leaving a non-responding preview state

### 2. Runtime can still report success without real file mutation

Symptoms:

- chat returns `200`
- leaked backend output can still describe edits that never land on disk
- browser-created sandboxes can start in the wrong workspace shape if starter bootstrap is not guaranteed

Current implementation areas:

- `recoder-web` build-mode backend routing
- `recoder-web` coding-runtime executor
- `docker-backend` Pi and sandbox-local Opencode runtime adapters

Required outcome:

- no run is marked successful unless sandbox file mutation is observed
- build-mode uses real coding backends (`Pi`, sandbox-local `Opencode`) instead of XML-style output generation

### 3. Sandbox-local coding backends can still stall under browser load

Symptoms:

- `Pi` or sandbox-local `Opencode` can stall during session start or prompt execution
- the route must fail over quickly instead of hanging the browser request

Current implementation areas:

- `docker-backend` Pi runtime adapter
- `docker-backend` sandbox-local OpenCode bootstrap path
- `recoder-web` build-mode backend routing

Required outcome:

- `Pi` and sandbox-local `Opencode` both fail fast enough to preserve browser responsiveness
- fallback behavior is explicit and deterministic

### 4. Legacy XML/action output can still leak from runtime-adjacent paths

Symptoms:

- some build-mode responses still arrive in `recoderAction` or `recoderArtifact` form
- malformed `str_replace` output shapes can still appear even after prompt sanitization

Current implementation areas:

- `recoder-web` build-mode backend routing
- `recoder-web` coding-runtime compatibility handling
- `docker-backend` Pi and Opencode adapters

Required outcome:

- build and deep-coding stay on the Daytona-backed runtime lane end to end
- XML-style output is treated as invalid or translated only as a temporary safety net, never as the intended success path

### 5. Host disk pressure still raises deploy and verifier risk

Symptoms:

- host storage pressure can distort deploy and verifier results

Required outcome:

- runtime verification failures reflect app bugs, not host exhaustion

## Desired Architecture

- Browser-facing auth starts at `app`.
- `recoder-web` remains the only browser-facing coding surface.
- `recoder-web` owns the user-facing chat and runtime entry path.
- `docker-backend` provides the coding runtime, preview, and file-operation control path for Daytona-backed execution.
- Sandboxes are disposable execution state, not persistence.
- Browser preview uses direct signed Daytona preview URLs for iframe-safe access.
- Build and deep-coding use real coding backends (`Pi`, sandbox-local `Opencode`) instead of the legacy XML-oriented action lane.

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth and Web bridge work
- outbound mail delivery is proven end to end
- `web.recoder.xyz` supports create, first-turn build, follow-up edit, and preview rendering in production on the runtime lane
- `agents.recoder.xyz` key authenticated routes and agent-start flows work
- `pm.recoder.xyz` key authenticated routes work without feature-route crashes
- `agency.recoder.xyz` key authenticated routes work
- A2A-dependent flows stay healthy after the latest env and runtime fixes
- Daytona host and runtime are stable without hidden retry or recovery masking

## Proof Standards

Near-term runtime work is only complete when the evidence shows:

- a successful two-turn verifier run
- real mutation in sandbox files
- preview render matching expected content after the follow-up edit
- no hidden fallback path counted as the success condition
- transport failures surfaced as recoverable runtime behavior instead of opaque success text

## Daytona Capability Mapping

### Coding / process execution

- Daytona process execution is the main coding runtime substrate for `recoder-web` to `docker-backend` coding runs.
- Recoder implementation work:
  - standardize command execution and runtime session ownership in the existing coding-runtime path
  - standardize long-running session handling for coding loops, dev servers, and verifier flows
  - treat process-session logs as first-class execution evidence for stuck-run debugging
  - prefer direct coding backends (`Pi`, sandbox-local `Opencode`) over the legacy XML action lane for build and deep-coding

### File operations

- Daytona file APIs should be the source of truth for sandbox mutation, sync, and verification.
- Recoder implementation work:
  - route file read, write, and list verification through the existing `docker-backend` file-operation path
  - record mutation evidence for runtime success checks
  - prevent “success” responses when file-state verification fails
  - use on-disk snapshot checks to confirm `Pi` or sandbox-local `Opencode` actually changed starter entry files

### Preview

- For browser-facing flows, prefer signed Daytona preview URLs over header-token preview paths.
- Recoder implementation work:
  - make preview URL issuance an explicit responsibility of the existing preview path
  - treat preview readiness and port health as explicit checks, not inferred success
  - detect preview drift when preview stays healthy but rendered content does not match the last verified mutation
  - probe preview URLs the way Daytona documents them, using signed URLs directly when signed

### Computer use

- Daytona computer-use support is a later runtime lane for GUI automation, testing, screenshots, and desktop workflows.
- Recoder implementation work:
  - keep this as post-runtime-reliability work
  - treat VNC and computer-use as an optional runtime class, not a dependency for fixing the main coding lane

## Upstream Intake Rules

When this plan pulls in external repos, the default rule is:

- only use upstream repos that Recoder can directly clone into a Daytona workspace and exercise through normal file, process, log, test, or preview flows

Reference shortlist:

- [daytona-projects/can-be-fork-repos.md](/Users/arhansubasi/recoder.xyz/daytona-projects/can-be-fork-repos.md:1)

Working standard:

- no new external dependency should enter the near-term backlog unless it passes the direct-clone criteria in that file
- reference-only repos can inform design, but they should not become implicit implementation dependencies
- infra-heavy or desktop-first repos should not displace the current runtime-truth sequence

Preferred upstream order for this plan:

1. `daytonaio/daytona`
2. `anomalyco/opencode`
3. `badlogic/pi-mono`
4. `a2aproject/a2a-js`
5. `browserbase/stagehand`
6. `lightpanda-io/browser`
7. `vercel-labs/agent-browser`
8. `e2b-dev/E2B` only for execution-substrate comparison

Phase mapping:

- Phase 1 should lean on `daytonaio/daytona`, `anomalyco/opencode`, and `badlogic/pi-mono` for runtime, file, process, and preview behavior validation
- Phase 2 should lean on `a2aproject/a2a-js` for protocol and routing reference
- Phase 3 may borrow from `browserbase/stagehand`, `lightpanda-io/browser`, and `vercel-labs/agent-browser` for browser-task and computer-use-adjacent patterns
- no phase should assume a fork-first strategy unless upstream use has already failed for product-specific reasons

## Implementation Backlog

Detailed ticket tracking stays in `bd`. This file defines the coding sequence and proof requirements.

## Phase 1: Runtime Truth

Outcome:

- `web.recoder.xyz` build and deep-coding stay on the Daytona-backed runtime lane and can complete a real two-turn coding task with verified mutation and preview proof.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Eliminate transport dead ends | `recoder-web` chat/runtime path and `docker-backend` coding-runtime transport | Remove opaque success-looking responses and replace them with recoverable runtime errors or working fallback behavior. | Live verifier shows no opaque `"fetch failed"` response or hidden session-start hang. | Depends on stable runtime error propagation across existing chat and coding-runtime surfaces. |
| Enforce runtime-lane-only build mode | `recoder-web` chat routing and backend runtime selection | Keep build and deep-coding on the Daytona-backed runtime lane for successful production runs. | Two-turn verifier shows `Pi` first or sandbox-local `Opencode` fallback; no hidden legacy action-runner path appears in logs or artifacts for success cases. | May require bypassing generic runtime routing and legacy XML-oriented prompt paths. |
| Require real file mutation for success | `recoder-web` coding-runtime executor and `docker-backend` file-operation verification paths | Mark runs successful only when sandbox file changes are observable. | Sandbox file diff or file-state check proves mutation on both initial and follow-up edit turns. | Depends on trustworthy file read and list verification. |
| Prefer Pi before Opencode in build mode | `recoder-web` build-mode backend routing | Use `Pi` as the first coding backend for build and deep-coding, with sandbox-local `Opencode` only as fallback. | The first browser build request reaches `Pi`, and fallback to sandbox-local `Opencode` happens only on explicit failure or no mutation proof. | Depends on stable provider-key wiring and direct sandbox mutation checks. |
| Make browser-created sandboxes non-empty | Web IDE container bootstrap and starter seeding | Ensure browser-created Daytona workspaces contain the starter files before runtime edits begin. | Fresh browser-created projects expose starter entry files through the file API before the first build prompt. | Depends on removing `skipInit` from the Web IDE container bootstrap path. |
| Turn preview health into a required proof gate | Daytona preview probing and dev-server bootstrap | Do not accept build-mode success until preview health reports a responding port. | Direct probe shows file mutation plus at least one responding preview port, or the run fails explicitly. | Depends on signed-preview probing and dev-server start/recovery reliability. |
| Stabilize sandbox-local fallback lane | `docker-backend` sandbox-local OpenCode bootstrap path | Make sandbox-local execution reliable enough to use when `Pi` fails or times out. | Fallback path starts within the expected timeout window and completes a real mutation-backed run. | Blocked by current sandbox-local bootstrap speed, startup errors, and preview bring-up failures. |
| Reduce host-level false negatives | deploy and verifier environment on the Daytona host | Prevent disk pressure from masquerading as runtime regressions. | Verifier failures correlate to app/runtime bugs rather than host exhaustion during repeated runs. | Depends on host cleanup and capacity discipline outside the chat/runtime code path. |
| Keep upstream runtime references cloneable | runtime research and implementation intake | Ensure any external runtime reference used during Phase 1 can be cloned and exercised directly in a Daytona workspace before it influences product code. | Every adopted external runtime reference is on the direct-clone shortlist or is filed as an exception in `bd`. | Depends on the direct-clone criteria in `daytona-projects/can-be-fork-repos.md`. |

## Phase 2: Agent Control Plane

Outcome:

- External agents can connect to the same Recoder workspace with stable identity, explicit runtime selection, shared history, and PM-mediated approval or handoff around runs.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Stabilize agent registry and session lifecycle | agent registry and A2A surfaces | Give external agents durable identity, capability metadata, and session health across reconnects. | A reconnecting external agent keeps the expected identity and session state without duplicate registration. | Depends on the current A2A and registry surfaces staying the canonical path. |
| Route tasks by runtime and capability | `recoder-web` runtime selection plus backend task routing | Select the right runtime lane per task instead of treating all agents or tasks as equivalent. | The same workspace can route coding tasks to the coding runtime and preserve the decision in run history. | Depends on Phase 1 runtime truth and reliable capability metadata. |
| Unify execution history and artifacts | chat history, runtime logs, file evidence, and preview ownership surfaces | Share run history, artifacts, and preview ownership across Web, Agents, and PM views. | A run exposes prompt, runtime lane, logs, file evidence, and preview linkage in one shared history model. | Depends on artifact capture from existing runtime and preview paths. |
| Integrate PM approval and handoff | PM approval and handoff surfaces around existing run flow | Make approval, reject, and handoff part of the run lifecycle instead of a separate manual layer. | A run can pause for PM approval and resume or hand off with preserved artifacts and ownership. | Depends on shared history and artifact linkage. |
| Align BYOK-first control-plane billing follow-up | billing, quotas, and run accounting surfaces | Rework platform accounting around workflow control and connected agents instead of bundled token resale. | Billing follow-up is defined against run control-plane primitives, not treated as already solved. | Depends on stable run ownership, artifact retention, and approval surfaces. |
| Keep protocol references upstream-first | A2A and control-plane integration intake | Use cloneable upstream protocol references before inventing new adapters or forking existing ones. | Control-plane work cites `a2aproject/a2a-js` or a documented `bd` exception when choosing a protocol implementation path. | Depends on the upstream intake rules above. |

## Phase 3: Agent OS Features

Outcome:

- Recoder exposes first-class operating-system capabilities for agent teams, including observability, policy controls, and an optional desktop or computer-use runtime lane.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Add multi-agent routing and workspace policy controls | agent routing, workspace authority, and policy surfaces | Allow multiple agents to share a workspace under explicit routing and policy rules. | Workspace policy can constrain which agent or runtime class may execute specific run types. | Depends on Phase 2 registry and session ownership. |
| Add audit trail and observability | execution history, runtime logs, and stuck-run debugging surfaces | Make it clear who ran what, where, when, and with which artifacts. | Debugging view can explain a stuck or failed run from logs, runtime lane, preview state, and file evidence. | Depends on shared artifact model and process-log capture. |
| Promote Daytona primitives to first-class platform capabilities | coding runtime, file operations, process sessions, and preview surfaces | Treat process, file, and preview control as core platform capabilities rather than hidden implementation details. | Product surfaces can reference runtime sessions, file evidence, and preview ownership consistently. | Depends on Phase 1 and Phase 2 normalization work. |
| Add optional computer-use runtime lane | existing desktop, browser automation, and screenshot-capable surfaces | Support desktop session lifecycle, GUI automation health, screenshot artifacts, and VNC/computer-use routing as an optional runtime class. | Computer-use run shows session start, health status, screenshot or visual artifact capture, and clean stop behavior without displacing the main coding lane. | Post-runtime-reliability work; depends on the Daytona computer-use lane being operationally viable. |
| Keep browser-agent references runnable in Daytona | browser-task and computer-use-adjacent intake | Restrict Phase 3 upstream inputs to repos that can be cloned and exercised in a normal Daytona sandbox before adoption. | Browser or computer-use implementation work is based on a runnable upstream repo from the shortlist or a documented `bd` exception. | Depends on Phase 1 runtime truth and the upstream intake rules above. |

## Phase 4: Expansion Lanes

Outcome:

- The same control-plane primitives support broader agent workflows without breaking the runtime-first foundation.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Add planning and product-agent workflows | planning, task graph, and handoff surfaces | Extend the control plane to non-coding planning and product loops. | Planning agent outputs can be routed, approved, and handed off through the same run lifecycle. | Depends on mature Phase 2 approval and artifact primitives. |
| Package delivery and agency workflows | agency and delivery-facing surfaces | Reuse proven execution outputs for client delivery and managed-service packaging. | Delivery flow can attach verified artifacts, previews, and approvals to a handoff package. | Depends on stable audit trail and artifact retention. |
| Add governance and enterprise controls | account, workspace policy, audit, and retention surfaces | Support stricter governance without inventing a separate execution model. | Workspace-level governance rules affect runtime access, approvals, and retention in auditable ways. | Depends on Phase 3 policy and observability foundations. |
| Extend to broader non-coding agent workflows | cross-surface workflow routing on existing control-plane primitives | Use the same routing, artifacts, approvals, and audit primitives for adjacent workflows beyond software implementation. | A non-coding workflow can execute end to end without bypassing the shared control plane. | Depends on the control-plane model staying generic after the coding wedge is proven. |

## Immediate Next Step

1. Run the live build-mode probe against the `Pi -> sandbox-local Opencode` browser path.
2. Confirm the starter entry file is present before the prompt and changed on disk after the prompt.
3. Confirm preview health reports at least one responding port after mutation.
4. If `Pi` stalls, verify the route fails over quickly to sandbox-local `Opencode`.
5. If preview still does not respond, fix dev-server bootstrap or workdir/path handling before accepting the lane as healthy.

## Notes

- This is an operational status document plus an implementation backlog, not a ticket tracker.
- Use `bd` for detailed issue tracking and discovered follow-up work.
- Production evidence wins over stale notes.
- Keep computer use in Phase 3 unless the main coding lane is already proven reliable.
- Build and deep-coding are now intended to use real coding backends (`Pi`, sandbox-local `Opencode`) rather than the old XML-oriented action lane.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.
