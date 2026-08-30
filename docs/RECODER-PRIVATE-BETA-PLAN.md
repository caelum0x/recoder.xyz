# Recoder Private-Beta Product Plan

Status: canonical delivery plan, 2026-08-15. This plan supersedes the active-work
sections of `PLAN.md`, `NEXT-PHASES.md`, and `apps/desktop/ROADMAP.md` when they
conflict. Those files remain historical strategy and implementation evidence.

Product contract: [RECODER-FULL-PRODUCT-SPEC.md](./RECODER-FULL-PRODUCT-SPEC.md)

Connection design: [RECODER-CONNECTION-ARCHITECTURE.md](./RECODER-CONNECTION-ARCHITECTURE.md)
Issue inventory: [OPEN-BEADS.md](./OPEN-BEADS.md)

## 1. Goal

Ship an invite-only, BYOK, macOS arm64 private beta from `main` that proves the real
workspace -> agent -> terminal -> diff -> governed review -> merge loop on clean
machines and real repositories.

This is a product validation program, not an engine-completeness program. The beta
does not wait for billing, public signup, universal builds, Python sidecars, remote
attach, mobile, social connectors, background agents, governed skills, or AST merge.

## 2. Acceptance criteria

The private beta can begin when all of the following are true:

1. `main` is the only documented release line and contains the release candidate.
2. The packaged artifact is macOS arm64, signed, notarized, stapled, and archived with
   its commit and manifest.
3. The artifact contains every required resource and excludes RecoderGit and Multica
   unless licensing explicitly permits distribution.
4. A clean-machine run completes invite sign-in, token refresh, agent detection,
   repository selection, isolated workspace launch, terminal attach, diff load,
   exact-target approval, and governed merge.
5. Backend port collision/reassignment is exercised with the renderer following the
   new URL.
6. Unavailable agent CLI, expired auth, dead/default Loom, merge refusal, and backend
   restart each produce actionable user-visible failures and recovery.
7. Every run produces the structured evidence contract from the product spec.
8. No known high-severity path silently bypasses governance or reports unavailable
   packaged engines as required/healthy.

## 3. Phase 0 - Canon and release readiness

Outcome: one trustworthy release source and one installable candidate.

### 0.1 Establish `main`

- Resolve `recoder-mhyt`: reconcile the verified feature branch into `main` in small,
  reviewable batches or explicitly promote the shipped branch.
- After reconciliation, build and release only from `main`.
- Preserve a tag/commit mapping for the last known signed artifact and the new
  candidate.
- Do not mix production website deployment or billing cutover into the branch
  reconciliation.

### 0.2 Close distribution truth gaps

- Resolve the remaining licensing confirmation in `recoder-rxn0`.
- Keep RecoderGit absent from `extraResources` and unavailable at runtime.
- Preserve the shipped supervisor behavior that classifies license-excluded
  RecoderGit as intentionally unavailable rather than packaged-required.
- Confirm Multica source is not linked into the shipped Go binary.
- Verify the required resources listed in
  `apps/desktop/app/electron-builder.config.cjs:90-189` exist for arm64.

### 0.3 Resolve security gates in beta scope

- Revalidate `recoder-5iqy` and either document the production host as clean or carry
  explicit remediation. The hosted device-auth surface cannot be trusted while host
  integrity is unresolved.
- Preserve the shipped exact-target approval contract: clearance must bind to the
  same normalized action and target that produced the verdict.
- Resolve or explicitly disable the affected swarm-unblock surface for the overlapping
  `recoder-trk0` / `recoder-vbg2` policy-profile issue.
- Review `recoder-4d8i` and record which owner-gated findings apply to the local beta.

### 0.4 Restore minimal validation and release record

- Resolve `recoder-fi6w` with a minimal PR validation lane or a truthful manual
  release runbook if CI remains intentionally disabled.
- Keep signing, notarization, stapling, publishing, and clean-machine validation
  manual until secrets and hardware policy are explicit.
- Record artifact hash, app version, commit, architecture, signature authority,
  notarization id/status, staple verification, and rollback manifest.

Phase 0 exit: one signed/notarized/stapled arm64 candidate from `main`, with licensing,
security posture, resources, and rollback identity documented.

## 4. Phase 1 - Core private-beta loop

Outcome: repeated, evidence-backed product runs on actual desktop installs.

### 1.1 First run and identity

- Exercise hosted invite/device sign-in and refresh using `recoder.xyz`.
- Confirm the desktop account identity and the local execution principal remain
  explicit; do not imply the solo owner is a hosted team principal.
- Verify sign-out/expiry does not delete local workspace history.
- Treat `recoder-po7g` as a follow-up unless live runs show the current sign-in wall
  blocks the beta flow.

### 1.2 Backend lifecycle and port handoff

- Complete `recoder-4wdp`: occupy the preferred port, launch the desktop, and prove
  every renderer HTTP/WS path uses the reassigned URL.
- Complete `recoder-lyzr`: kill/restart the Node backend, verify stale clients drop,
  the URL/status refreshes, durable events replay, and live sessions reconcile.
- Keep Go shell death and Node control-plane death visibly distinct.

### 1.3 Runtime discovery and workspace launch

- Detect supported CLIs from the effective app `PATH`; verify at least one available
  and one unavailable path.
- Run the default Loom path with the packaged binary and protocol-20 socket.
- Run the configured tmux fallback path with Loom disabled.
- Resolve `recoder-wtlm`: the default Loom workspace needs a bounded bidirectional
  terminal attachment, not only polled capture plus submitted steer.
- Exercise the Recoder-owned Loom slice: worktree launch, pane-id handle, native
  status, output capture, submitted and non-submitted steer, restart reattachment,
  review, and teardown. Do not make beta acceptance depend on Loom's TUI, layouts,
  plugin marketplace, or SSH remote-install features.
- Verify repository selection, base ref, worktree, branch, setup step, and task/run
  records all match the same workspace.
- Confirm no optional engine prevents the local launch path.

### 1.4 Terminal, approval, review, and merge

- Attach to the real session and send one user steer/message.
- Load terminal output and structured events after renderer reconnect.
- Produce a non-empty diff and readiness result.
- Trigger one exact-target approval and prove an approval for target A does not clear
  target B.
- Exercise one successful merge and one stale/conflicted/refused merge.
- Export evidence with no provider keys, auth tokens, internal keys, or sensitive
  terminal content outside the declared artifact policy.

### 1.5 Resolve only live-run defects

- Run `pnpm run beta:run-artifact -- <workspace-id> --context <context.json>`
  after the workflow. The context follows
  `scripts/private-beta-run-context.example.json` and supplies observations that
  cannot be read safely outside Electron: sign-in, refresh, terminal attach,
  backend reconnect, and the installed DMG path. Relative DMG paths resolve from
  the context file's directory.
- Accept an artifact as complete only when its `contract.complete` is `true`; a
  partial collection lists every absent field under `contract.missing`.
- File every reproducible defect as a bead linked to `recoder-1ejn` or the run issue.
- Include app version/commit, repository shape, runtime/substrate, steps, expected and
  actual behavior, logs/artifact ids, and exact user-visible failure.
- Fix beta-blocking defects at the existing desktop/backend boundary. Do not create a
  new public API or primary screen unless the live path proves the contract missing.

Phase 1 exit: `recoder-1ejn`, `recoder-4wdp`, and `recoder-lyzr` have real GUI evidence;
the core loop succeeds repeatedly across fresh installs and representative repos.

## 5. Phase 2 - Invite-only operations

Outcome: a small cohort can use the beta and failures become auditable work.

### 2.1 Cohort and entitlement

- Maintain a small invite allowlist in the hosted account plane.
- Testers bring their own agent subscriptions/credentials and provider keys.
- Do not gate the private beta on `recoder-nn4o`, `recoder-bb1n`, `recoder-ll7l`,
  `recoder-sl5b`, or `recoder-nh6c`; keep paid paths disabled or unreachable in the
  beta product.

### 2.2 Feedback tied to work

- Add or publish one concise report path from a workspace/run.
- Prefill version, commit, workspace/run ids, runtime/substrate, health summary, and
  recent redacted failure events.
- Require the user to review the report before sending/exporting.
- Triage verified defects into beads and link reproductions/artifacts.

### 2.3 Release and rollback

- Accept a release only after the Phase 1 workflow on a fresh install.
- Publish a versioned update manifest only after the same artifact passes signing,
  notarization, staple, and boot checks.
- Keep the previous signed artifact and manifest available for rollback.
- Rollback changes the offered artifact; it never rewrites existing user git state.

Phase 2 exit: at least three testers complete the core loop, high-severity failures are
reproducible or closed, and rollback was dry-run from the prior signed artifact.

## 6. Phase 3 - Evidence-driven expansion

These lanes begin only when beta evidence shows repeated need.

| Lane | Open beads | Trigger to start | Product condition |
|---|---|---|---|
| Review/convergence depth | `recoder-p8f3`, `recoder-ry9c`, `recoder-elhh` | Repeated review latency, large-diff pain, or same-region conflicts | Preserve one governed merge boundary |
| Board to issue graph | `recoder-uou2` | Testers repeatedly start work from beads and manually close/link it | Beads remains issue/memory source, not UI duplication |
| Workspace detail UX | `recoder-vxvq` (decision: `recoder-r96t`) | GUI evidence validates in-container switching and pop-out tiling | Keep terminal and diff side-by-side possible |
| Loom terminal parity | `recoder-wtlm` | Default Loom is used by beta workspaces | Wave renders a bounded bidirectional stream; backend owns Loom socket and governance |
| Remote/mobile attach | `recoder-n5pc` | Repeated need to monitor away from the Mac | Authenticated transport plus durable shared session store first |
| Governed skills | `recoder-ne6o`, `recoder-ubyg` | Repeated, reusable task procedures need execution | Pinned registry, publisher keys, workspace containment, concrete executor |
| Loom swarm policy | `recoder-trk0`, `recoder-vbg2` | Swarm auto-unblock is enabled for users | Shipped durable workspace profile and deny-capable gate; require representative target/evidence recovery proof |
| Agent deliberation | `recoder-jgrx` | Beta data shows consensus improves decisions | Deny-biased, evidence-visible, optional tool |
| Background/PR agents | `recoder-4keq` | Users request unattended follow-up | Explicit lifecycle, notification, and merge governance |
| Broader packaging | `recoder-55v9`, `recoder-b8ol` | arm64 demand is validated and reach is the bottleneck | Per-arch native set; avoid multi-GB Python bundle by default |

Social connectors, Multica, Ziti/xDS, OpenShip email, public cloud runners, paid billing,
and public signup remain outside this plan until separately approved.

## 7. Bead hygiene during execution

The current open set mixes active work, deferred work, memory wisps, completed
decisions, and GUI verification. Before treating it as a sprint backlog:

- close `recoder-klhy` after recording the already-made full-rebrand decision;
- close or reclassify `recoder-j8i4` after the requested fresh screenshot;
- keep `recoder-3wth` explicitly deferred, not in active planning;
- treat `recoder-wisp-6v7` as an ephemeral memory candidate, not product work;
- merge or parent-link `recoder-trk0` and `recoder-vbg2`;
- keep `recoder-ry9c`, not the closed parent `recoder-8ti9`, as the AST remainder;
- close decision records such as `recoder-r96t` after their implementation residue is
  assigned; `recoder-vxvq` now owns that GUI remainder;
- use the v2 collector delivered under `recoder-0w03`; only artifacts with
  `contract.complete: true` qualify as clean-machine acceptance evidence.

## 8. Delivery invariants

- Release only from `main` after Phase 0.
- No production deploy, billing cutover, or subscription mutation without owner action.
- No release claim based only on build/test output; the beta gate is a real installed
  product run.
- No optional-engine failure blocks the core path unless that engine is selected.
- No unavailable engine reports green or fabricates data.
- No agent or sidecar receives the full backend environment.
- No merge occurs without current repository state, ownership, governance, and
  readiness revalidation.
- No durable memory becomes default without evidence and review.

## 9. Verification matrix

| Claim | Required proof |
|---|---|
| Artifact is installable | Signature verification, notarization accepted, staple valid, clean install/boot |
| Sign-in works | Real invited account device flow plus refresh/expiry path |
| Dynamic backend URL works | Port collision followed by real board/WS/merge traffic on reassigned URL |
| Runtime works | Real packaged Loom launch and configured tmux fallback launch |
| Restart recovery works | Kill/restart backend, reconcile session, replay events, preserve workspace |
| Governance works | Exact-target approval and cross-target non-clearance |
| Review works | Real non-empty diff, readiness, evidence, success and refusal paths |
| Merge works | Resulting git branch/commit verified in representative repo |
| Rollback works | Prior signed artifact/manifest can be selected and installed |

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Docs overstate implementation | Status vocabulary and live evidence matrix; broad "fully done" claims are non-canonical |
| Dual Go/Node backend confuses ownership | Freeze Go as shell host; Node owns product control plane; migrate only from evidence |
| Loom default fails on clean machine | Package fail-loud artifact gate; protocol ping; explicit tmux fallback configuration |
| Port reassignment leaves stale clients | One injected URL source for HTTP and WS; live collision smoke |
| Solo mode leaks beyond desktop | Boot guard requires loopback and local/non-shared DB; shared deployments disable solo mode |
| Approval bypass crosses targets | Bind clearance to normalized action and target before beta |
| License-excluded engine appears broken | Remove packaged-required RecoderGit classification; keep truthful unavailable state |
| Optional engines balloon artifact | Keep Python/cloud/social out of core; prefer native/local paths when evidence supports them |
| Billing distracts from product | BYOK beta, paid paths disabled/deferred, commercial beads isolated |
| Releases cannot be reproduced | Canonical `main`, versioned manifest, artifact hash, prior signed rollback artifact |
