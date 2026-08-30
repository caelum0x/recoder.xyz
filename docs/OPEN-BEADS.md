# Open Beads Architecture Map

Snapshot: 2026-08-17 (gate dispositions refreshed 2026-08-31). The unresolved graph contains 59 beads: 32 with
`status=open` and 27 with `status=in_progress`. By priority that is one P0, 13 P1,
44 P2, and one P3. The live graph remains authoritative:

```bash
bd list --status open --json --limit 0
bd list --status in_progress --json --limit 0
```

This document maps that graph to product architecture. It is not a second tracker.

### Session update 2026-08-17 (swarm-safety + agent-deliberation + Board↔bd)

Resolved/advanced this session (see each bead's notes for evidence + commits):

- `recoder-5iqy` **closed** — the missing `rm` binary was traced to
  `recoder-miner-monitor.sh` v3 glob friendly-fire, not host compromise. v4 uses
  dirname-based matching; coreutils was restored and `dpkg -V` was clean.
- `recoder-vbg2` **closed** — the permissive synthetic swarm-unblock policy actor is
  gone; replaced with a deny-biased actor (commit `8b76edf6`).
- `recoder-trk0` **product-complete 2026-08-30** — the auto-unblock gate remains
  deny-capable on candidate risk and now consumes a durable, revisioned workspace
  profile for its exact tool verdict, auto-answer opt-in, and confidence floor.
- `recoder-jgrx` **closed** — the deny-biased pal-brain consensus/debate VERDICT is now
  agent-callable as `recoder.pal-brain` (`pal.consensus_verdict`/`pal.debate_verdict`),
  parallel to the raw `recoder.pal-comms` tools (commit `3fb75be4`).
- `recoder-uou2` **closed (backend)** — `recoder_fanout_from_issue` starts a governed
  fan-out from a bd issue with `taskId=issueId`, closing the existing
  trackWork→completeWork loop; FE Board button filed as `recoder-b4qx` (commit `af34da73`).
- `recoder-4xn2` **closed** — a2a-sdk flake: port-race hypothesis disproven (the suite is
  network-free); not reproducible.

Disposition vocabulary:

- **Gate:** owner decision, remediation, or explicit exclusion required before beta.
- **Core:** directly improves the terminal -> agent -> review -> merge product loop.
- **Expansion:** starts only after repeated beta evidence establishes demand.
- **Deferred:** outside the invite-only BYOK macOS arm64 product path.
- **Close/reclassify:** the issue record no longer represents active implementation.

## 1. Product and release gates

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-rxn0` | 1 | Distribution license gate | Keep RecoderGit and Multica out of the DMG; attach final provenance/non-linking evidence. |
| `recoder-mhyt` | 2 | Canonical release-line gate | Reconcile verified work into `main`; release only from `main`. |
| `recoder-4d8i` | 2 | Control-plane security gate | Owner must disposition each applicable gated finding; disabled surfaces remain truthful. |
| `recoder-fi6w` | 2 | Release operation gate | Establish one minimal validation/release consumer or document the intentionally manual release path. |
| `recoder-1ejn` | 2 | Installed-product acceptance | Prove install, sign-in, Loom launch, terminal, review, approval, and merge using the signed arm64 artifact. |
| `recoder-4wdp` | 2 | Desktop connection acceptance | Prove renderer HTTP and WS clients follow a reassigned backend port. |
| `recoder-lyzr` | 2 | Desktop recovery acceptance | Prove GUI reconnect, event replay, stale-gate recovery, and substrate reconciliation. |
| `recoder-qtac` | 2 | Hosted identity/deploy gate | Deploy only the account/device-auth changes beta needs; marketing deployment remains separate and owner-gated. |

## 2. Core Recoder product

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-vxvq` | 2 | In progress: workspace detail | Source wiring is complete; retain one terminal-plain Session/Review surface and prove it in a source-current Electron launch. |
| `recoder-wtlm` | 2 | Core Loom terminal gap | Replace poll-captured Loom transcript parity with a bounded bidirectional Loom terminal attachment; never use the private TUI socket from React. |
| `recoder-elhh` | 2 | Review readiness | Preserve shipped worktree/PR evidence; add TODO sourcing or a hard merge gate only through an explicit governance decision. |
| `recoder-po7g` | 2 | Identity surface | Unify hosted account identity and local execution-principal presentation if the current sign-in wall blocks beta use. |
| `recoder-j8i4` | 2 | Close after product proof | Retired views and opt-in close are already implemented; capture a fresh desktop state, then close or file a narrower defect. |
| `recoder-r96t` | 2 | Close decision record | The pop-out-tabs/keep-tiling decision is implemented under `recoder-vxvq`; close this decision bead. |

## 3. Loom and agent-control expansion

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-trk0` | 2 | Swarm safety gate if exposed | **Product-complete 2026-08-30:** deny-capable candidate-risk path plus durable workspace-owned tool rule, auto-answer opt-in, confidence floor, revision guard, and desktop policy editor ship. Live representative recovery remains product proof, not a missing authority seam. |
| `recoder-vbg2` | 2 | ~~Duplicate swarm root cause~~ **Closed 2026-08-17** | Permissive synthetic profile removed (deny-biased actor); done. |
| `recoder-ne6o` | 2 | Governed skills expansion | **Product-complete 2026-08-30:** signed contract, authenticated typed Session UI, four-action first-party catalog, operator publisher/manifest Trust ledger, and durable content-hashed invocation history ship without Loom free-argv inheritance. |
| `recoder-ubyg` | 2 | Governed skills expansion | **Product-complete 2026-08-30:** pinned registry, durable operator trust, concrete bounded read/list/search/diff executor, runtime admission/revocation, canonical containment, and exact action/target/verdict/evidence records ship. |
| `recoder-n5pc` | 2 | Remote attach expansion | **Advanced 2026-08-30:** authenticated HTTP mint/describe/monitor/stream/steer/revoke, durable TTL sessions, desktop deep-link handoff, signed-in mobile-first receiver, scope-filtered native status/lifecycle SSE, and owner-wide canonical sign-out revocation ship. Residual = provisioned host-to-host Loom transport. |
| `recoder-klhy` | 2 | Close/reclassify decision | Record the chosen Recoder-owned governed ecosystem and no direct 592-plugin inheritance, then close. |
| `recoder-jgrx` | 2 | ~~Optional agent deliberation~~ **Closed 2026-08-17** | Deny-biased verdict exposed as `recoder.pal-brain` (`pal.consensus_verdict`/`pal.debate_verdict`). |

## 4. Evidence-driven product expansion

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-p8f3` | 2 | Diff renderer expansion | Adopt `@pierre/diffs` only if review evidence shows the current diff surface is the bottleneck. |
| `recoder-ry9c` | 2 | Convergence expansion | Add an AST/tree-sitter merge tier only for repeated same-region conflict failures. |
| `recoder-uou2` | 2 | ~~Board <-> Beads expansion~~ **Closed 2026-08-17 (backend)** | `recoder_fanout_from_issue` + existing trackWork/completeWork loop. FE button = `recoder-b4qx`. |
| `recoder-4keq` | 2 | Unattended-agent expansion | **Product-complete 2026-08-30:** Wave owns start/pause/scan and pins the exact Git repo/project/reviewer-runtime contract. Ready issues and the standing local open-PR watcher dispatch durable canonical workspaces; PR reviews dedupe per repo/number/head SHA/runtime and re-run on push. Selected runtimes produce independent evidence-backed findings, Wave shows exact K/N agreement with named sources, and the result prefills—but never auto-posts—the human review. Lifecycle notifications and Session/Review are shared, every launch carries `autoMerge:false`, and GitHub delivery is a human-confirmed, governance-gated Comment / Approve / Request changes action. |
| `recoder-55v9` | 2 | Platform expansion | Add per-architecture x64/universal artifacts after arm64 beta demand is proven. |
| `recoder-b8ol` | 2 | Engine packaging expansion | Package only Python sidecars with demonstrated product value and bounded relocatable distributions. |

## 5. Commercial and website work outside private beta

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-nn4o` | 2 | Commercial deferred | Choose one merchant-of-record and one webhook projection before paid access is enabled. |
| `recoder-bb1n` | 2 | Commercial policy deferred | Private beta is BYOK; decide any public free inference allowance separately. |
| `recoder-ll7l` | 2 | Commercial truth deferred | Remove advertised/enforced free-token drift before public pricing is active. |
| `recoder-sl5b` | 2 | Latent billing safety | Legacy Paddle/Dodo paths must remain disabled until cancellation actually reaches the provider. |
| `recoder-nh6c` | 3 | Latent Paddle defect | Close or retain solely as a prerequisite if Paddle is intentionally re-enabled. |
| `recoder-kj5s` | 2 | Production web migration | Deliberately migrate the stale production Next/React tree before a full-source deploy. |

## 6. Operations and explicit deferrals

| ID | P | Product disposition | Required outcome |
|---|---:|---|---|
| `recoder-d6bg` | 2 | Operations/deferred | Remove legacy references only with the affected routing/deploy decisions; avoid unrelated production changes. |
| `recoder-3wth` | 2 | Explicitly deferred | Keep OpenShip inbound email out for at least two quarters and require a clean non-Hetzner host if reconsidered. |
| `recoder-wisp-6v7` | 2 | Memory, not roadmap | Preserve the sqlx dotenv fact as evidence-backed memory, not scheduled product work. |
| `recoder-4xn2` | 3 | ~~Flake watch~~ **Closed 2026-08-17** | Port-race hypothesis disproven (network-free suite); not reproducible. |

## 7. Other claimed active work

These items are already `in_progress`. They remain part of the unresolved graph even
when they are outside the macOS private-beta critical path.

| ID | P | Architecture lane | Product disposition |
|---|---:|---|---|
| `recoder-0zso` | 1 | A2A edge security | Auth-hardening gate before any non-local A2A exposure. |
| `recoder-26j7` | 1 | Legacy web removal | Remove retired Recoder Web ownership and references without deleting active hosted account flows. |
| `recoder-8dtb` | 1 | Agent instruction spine | Keep root `AGENTS.md` canonical and runtime overlays narrow. |
| `recoder-eb0v` | 1 | Review/PR artifacts | Bring PR artifacts and attached A2A run evidence into the governed review history. |
| `recoder-gm8z` | 1 | Daytona production auth | Cloud/Web IDE lane; not a dependency of local desktop beta. |
| `recoder-js56` | 1 | Production repository operations | Reconcile host drift through an owner-controlled deployment path. |
| `recoder-kfje` | 1 | Hosted email operations | Account-plane deliverability; keep separate from agent runtime architecture. |
| `recoder-phwa` | 1 | Web IDE simplification | Collapse cloud execution to one Daytona lane; not a local desktop dependency. |
| `recoder-q8xb` | 1 | Hosted app/growth | Product polish for `recoder.xyz`; account-plane changes must preserve auth source-of-truth. |
| `recoder-s9fh` | 1 | Daytona storage operations | Cloud/Web IDE reliability; not a local workspace store. |
| `recoder-tpjq` | 1 | Web IDE edit loop | Cloud lane; align its run/artifact contract with Agent OS before reuse. |
| `recoder-xaea` | 1 | Shared run history | Expose PR preview and approval timeline as evidence, not a second run record. |
| `recoder-2xom` | 2 | Daytona research | Repository research artifact, outside beta delivery. |
| `recoder-5xjs` | 2 | Website positioning | Align public copy to convergence after product truth is deployable. |
| `recoder-8d06` | 2 | Product search | Search session/transcript/workspace read models; no new state authority. |
| `recoder-8fec` | 2 | Repository setup | Add committed per-repo setup/run schema and collision-safe workspace port injection. |
| `recoder-czxq` | 2 | Cloud planning | Keep Daytona/runtime tasks in Beads and canonical plans, not ad hoc TODO files. |
| `recoder-d91g` | 2 | Recoder Code maintenance | Runtime test repair; not a private-beta product gate unless Recoder Code is selected. |
| `recoder-ee0f` | 2 | Commercial positioning | Defer pricing architecture until BYOK beta evidence and entitlement policy agree. |
| `recoder-knlw` | 2 | Project identity | Replace hardcoded project identity and group workspaces under real repositories. |
| `recoder-wupr` | 2 | Needs-attention UX | Contextual workspace notifications for genuine blocked/input-required state. |
| `recoder-yc1w` | 2 | GitHub/merge capability | Wire one `gh` subprocess seam for clone/checks/readiness behind Conductor. |
| `recoder-yyyi` | 2 | Repository identity/layout | Evaluate ghq-style canonical repo paths as input to project identity, not as a second project database. |
| `recoder-zvss` | 2 | Edge/WAF infrastructure | Cloud/public edge lane; activate only with explicit route ownership and fail-closed policy. |

## 8. Product architecture sequence

```text
host integrity + license truth + canonical main
  -> signed/notarized/stapled arm64 desktop
  -> hosted device identity -> local execution principal
  -> dynamic loopback Node control plane + Wave shell
  -> Loom default substrate -> isolated worktree -> live terminal
  -> exact-target governance -> diff/readiness -> governed merge
  -> clean-machine acceptance evidence
  -> small invite-only BYOK cohort
  -> only evidence-backed expansion
```

Immediate graph cleanup:

1. ~~Consolidate `recoder-trk0` and `recoder-vbg2`~~ — done 2026-08-17: `vbg2` closed,
   `trk0` advanced (deny-capable path shipped; only the per-workspace agent policy
   profile remains, blocked on the `Workspace` data model).
2. Close `recoder-r96t` and `recoder-klhy` after their decisions are recorded.
3. Close `recoder-j8i4` after fresh desktop confirmation.
4. Keep billing, x64, Python sidecars, remote attach, AST merge, and background agents out of the beta critical path.
