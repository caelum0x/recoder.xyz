# Open Beads Architecture Map

Snapshot: 2026-08-15, from `bd list --status open --json --limit 0` before the
documentation task `recoder-h66l` is closed. The snapshot contains 40 open beads:
one P0, two P1, 35 P2, and two P3. It includes `recoder-b7qh`, `recoder-0w03`, and
`recoder-vxvq`, discovered during this architecture pass.

This is an inventory and planning view, not a replacement for Beads. Current status,
notes, dependencies, and claims remain authoritative in `bd show <id> --json`.

Disposition vocabulary:

- **Beta gate:** must close, disable safely, or receive an explicit owner disposition
  before testers are invited.
- **Beta live verification:** implementation exists; a real installed-app run is the
  remaining proof.
- **Beta follow-up:** relevant to the core product but not automatically release-blocking.
- **Expansion:** starts only when beta evidence justifies it.
- **Commercial deferred:** outside the invite-only BYOK beta.
- **Operations/deferred:** real work or memory, but not in the active product path.
- **Close/reclassify:** issue status no longer matches its notes or purpose.

## 1. Private-beta gates and live verification

| ID | P | Open bead | Disposition | Architecture action |
|---|---:|---|---|---|
| `recoder-5iqy` | 0 | SECURITY: prod box coreutils tampered - cp/tr/su MISSING, rm checksum MODIFIED (dpkg -V) | Beta gate / owner | Revalidate current notes and either establish hosted auth integrity or remediate; close if the original finding was conclusively a false positive. |
| `recoder-rxn0` | 1 | LICENSE AUDIT: recodergit is PolyForm-NONCOMMERCIAL and ships in the public DMG; multica is Dify-style restricted-Apache | Beta gate / owner | Distribution exposure is mostly fixed. Confirm Multica is not linked, keep RecoderGit excluded, and close with evidence. |
| `recoder-b7qh` | 1 | Desktop health marks license-excluded RecoderGit as packaged-required | Beta gate | Remove RecoderGit from the packaged-required health roster or add an explicit intentionally-excluded state; preserve truthful unavailable behavior. |
| `recoder-mhyt` | 2 | P0: no canonical release line - origin/main frozen ~2mo, all work on feature branch (~552 conflicts) [OWNER-GATED] | Beta gate / owner | Make `main` canonical and release only from it. |
| `recoder-fi6w` | 2 | release: changesets pipeline has no automated consumer - ALL GitHub workflows live in .github/workflows.disabled | Beta gate / owner | Restore minimal validation or document the intentionally manual release consumer. Publishing/signing remain manual. |
| `recoder-adsk` | 2 | [medium] Approval clearance ignores the target (path/command) - an approval for one target clears the same action on ANY | Beta gate | Bind approval clearance to normalized action and exact target before approval-dependent runs. |
| `recoder-4d8i` | 2 | SECURITY REVIEW (owner decision): gated control-plane findings from survey-2 | Beta gate / owner | Decide which findings apply to the local beta and disable or remediate affected surfaces. |
| `recoder-1ejn` | 2 | Private-beta Phase 1: run clean-machine install and core workflow smoke on the signed macOS arm64 build | Beta live verification | Execute the full acceptance flow and attach structured run artifacts. |
| `recoder-0w03` | 2 | Complete private-beta artifact collector coverage for acceptance evidence | Beta gate | Capture architecture, hosted sign-in/refresh, run identity, and exact approval targets so the evidence contract is executable. |
| `recoder-4wdp` | 2 | DT-7.1 live-launch verify: renderer adopts reassigned backend port end-to-end | Beta live verification | Occupy the preferred port and verify all renderer HTTP/WS traffic follows the IPC-injected URL. |
| `recoder-lyzr` | 2 | DT-7.3b/7.4/stale-gate live-launch verify (GUI-gated residuals) | Beta live verification | Prove real GUI reconnect, stale-gate recovery, event replay, and session reconciliation. |
| `recoder-qtac` | 2 | website: prod is behind repo on convergence positioning + cli-auth identity - approval-gated deploy batch untracked | Beta supporting / owner | Deploy only the device-auth/account changes needed by invited testers; marketing rollout is separate. |

## 2. Core product follow-ups

| ID | P | Open bead | Disposition | Architecture action |
|---|---:|---|---|---|
| `recoder-elhh` | 2 | [backend] Checks/merge-readiness surface: git status, PR metadata, CI checks, todos, with merge blocked/discouraged on open work | Beta follow-up | Existing worktree and PR slices are partial. Keep soft readiness for beta; add TODO source/hard gate only from live evidence and owner governance decision. |
| `recoder-j8i4` | 2 | Dashboard: none of the widget tabs work; stale tabs (openfang, pal) still present | Close/reclassify after GUI proof | Notes say code defects are resolved and retired tabs are user-local. Capture a fresh screenshot, then close or file a narrower bug. |
| `recoder-r96t` | 2 | DECISION: PW3-9 workspace-detail container - tabs vs Wave tiling paradigm | Decision-made | Owner chose pop-out tabs while preserving tiling; close this decision after confirming `recoder-vxvq` owns the implementation remainder. |
| `recoder-vxvq` | 2 | Wire workspace-detail in-container pane switching and verify live Electron behavior | Beta follow-up | Implement and live-verify pane switching and embedded terminal behavior while preserving pop-out tiling. |
| `recoder-po7g` | 2 | [architecture] Sign-in port: move the cockpit sign-in wall off the client gate and unify identity across hub + cockpit | Beta follow-up | Keep hosted account identity and local solo execution principal explicit; implement only if current sign-in wall blocks beta runs. |

## 3. Evidence-driven product expansion

| ID | P | Open bead | Disposition | Architecture action |
|---|---:|---|---|---|
| `recoder-p8f3` | 2 | [oss] adopt: @pierre/diffs as cockpit diff rendering layer (diff review + merge/converge UI) | Expansion | Adopt only if beta reviews show the current renderer is the repeated bottleneck; use the non-React integration path if still required. |
| `recoder-ry9c` | 2 | Conductor: AST/tree-sitter same-region merge tier (deferred delta of recoder-8ti9) | Expansion | Start when same-region conflicts are frequent enough to justify an AST tier. This is the active remainder, not closed `recoder-8ti9`. |
| `recoder-uou2` | 2 | [architecture] Board <-> bd (beads) wiring: start a workspace from a bd issue, close/link on merge | Expansion | Design from observed issue-to-workspace behavior; preserve Beads as the issue/memory source of truth. |
| `recoder-4keq` | 2 | desktop P3: background-agents + PR-review bugbot surface | Expansion | Requires explicit unattended lifecycle, notifications, review ownership, and merge governance. |
| `recoder-55v9` | 2 | Desktop: x64 + universal mac build | Expansion | Begin after arm64 beta validates demand; produce per-arch Go/Rust/tmux/Loom/beads artifacts. |
| `recoder-b8ol` | 2 | Desktop: bundle Python engine sidecars into the mac DMG | Expansion | Avoid making Python a core dependency; select only sidecars with proven beta value and a relocatable size-bounded distribution. |
| `recoder-jgrx` | 2 | Expose the pal-brain FACET verdict (deny-biased consensus/debate) as the agent-callable tool | Expansion | Expose only as an optional governed, evidence-visible MCP tool. |
| `recoder-ne6o` | 2 | Loom bigger bet: governed recoder.skill.json (replace foregone plugin ecosystem) | Expansion | Define the product contract only after repeated workflow evidence; no inherited plugin marketplace. |
| `recoder-ubyg` | 2 | Wire the governed skill model + validate workspace path against known worktrees | Expansion / partial | Path validation landed. Remaining work is pinned registry, publisher keys, concrete executor, and symlink-normalized containment. |
| `recoder-n5pc` | 2 | Wire governed remote-attach (Bigger Bet C) into bootstrap + durable session store | Expansion / partial | Bootstrap tools landed. Remaining product is authenticated remote transport and durable/shared session storage. |
| `recoder-trk0` | 2 | Swarm-unblock policyGate is structurally un-deniable for a human Principal (needs workspace-agent profile) | Gate if enabled; otherwise expansion | Merge with or parent-link `recoder-vbg2`; thread a real workspace-agent policy profile and deny-capable decision. |
| `recoder-vbg2` | 2 | Swarm-unblock policyGate uses a permissive synthetic AgentProfile (rubber-stamps allow) | Gate if enabled; otherwise duplicate | Same root problem as `recoder-trk0`; one implementation issue should own the fix. |

## 4. Commercial, website, and deferred operations

| ID | P | Open bead | Disposition | Architecture action |
|---|---:|---|---|---|
| `recoder-nn4o` | 2 | P0: two disconnected billing systems - selling surface (Paddle/Dodo) != enforcing surface (Polar bridge) | Commercial deferred / owner | Keep paid paths out of private beta. If resumed, make Creem the single active selling/enforcing provider before launch. |
| `recoder-bb1n` | 2 | POLICY: does the Free tier grant a platform-inference token allowance, or is it strictly BYOK-only? [OWNER] | Commercial deferred / owner | Private beta is strictly BYOK. Resolve public/free policy separately. |
| `recoder-ll7l` | 2 | billing: advertised-vs-enforced drift - app pricing mirror still says Free 100k tokens | Commercial deferred | Do not expose contradictory pricing in beta; reconcile when commercial policy is chosen. |
| `recoder-sl5b` | 2 | billing-correctness: subscription cancel never cancels Paddle/Dodo (keeps charging) | Commercial deferred but high-risk if reachable | Disable legacy paid flows for beta. Must fix before either provider can be re-enabled. |
| `recoder-nh6c` | 3 | money: Paddle checkout writes passthrough userId but legacy webhook reads user_id - paid subscription never granted (create-checkout/route.ts:154) | Commercial deferred | Notes already defer because Creem is active. Close or retain only as a Paddle re-enable prerequisite. |
| `recoder-kj5s` | 2 | prod app is Next 15.4.11/React 18 on stale branch - needs deliberate migration to Next 16/React 19 tree before any full-source deploy | Website owner/deploy | Repo is already on Next 16/React 19; plan a production migration before a full-source deploy, separate from the desktop artifact. |
| `recoder-d6bg` | 2 | Sweep references to removed legacy surfaces (scripts/CI/nginx/A2A registry/apex app) | Operations/deferred | Clean only when touching affected deploy/A2A routes; avoid risky production-routing changes in product work. |
| `recoder-3wth` | 2 | DEFER: OpenShip email - re-eval 2+ quarters, INBOUND mail only | Deferred | Exclude from all beta milestones. |
| `recoder-klhy` | 2 | herdr DECISION: rebrand vs inherit 592-plugin ecosystem (mutually exclusive) | Close/reclassify | Owner decided full Recoder rebrand and no inherited plugin ecosystem. Close decision; file bounded rebrand implementation separately if needed. |
| `recoder-wisp-6v7` | 2 | live-test: sqlx dotenv landmine | Memory, not backlog | Keep as evidence-backed ephemeral memory or promote by policy; do not schedule as product work. |
| `recoder-4xn2` | 3 | flake: a2a-sdk suite failed once under recursive test:packages gate (passes isolated + 2 clean re-runs) | Operations/deferred | Reopen investigation only on recurrence with a captured full log. |

## 5. Cross-issue consolidation

The following changes make the issue graph usable as an architecture backlog:

1. Link `recoder-trk0` and `recoder-vbg2` under one swarm-policy implementation issue.
2. Close `recoder-klhy`; the decision is already recorded.
3. Close decision bead `recoder-r96t`; its GUI implementation residue is now tracked
   by `recoder-vxvq`.
4. Close `recoder-j8i4` after fresh-machine confirmation or file a narrower local-layout
   cleanup defect.
5. Close `recoder-rxn0` after the final Multica/non-bundling evidence is attached.
6. Reclassify `recoder-wisp-6v7` as memory rather than active product work.
7. Keep commercial billing beads grouped and excluded from private-beta acceptance.
8. Track the newly discovered RecoderGit packaged-health mismatch separately: the
   packager excludes it legally, but the Electron supervisor still treats
   `recodergit:cli` as packaged-required.

## 6. Critical path

```text
main/release line (recoder-mhyt)
  -> license + packaged-health truth (recoder-rxn0 + recoder-b7qh)
  -> approval/security disposition (recoder-adsk, recoder-4d8i, swarm gate if enabled)
  -> signed/notarized/stapled arm64 artifact
  -> dynamic-port + restart GUI proof (recoder-4wdp, recoder-lyzr)
  -> complete evidence capture (recoder-0w03)
  -> clean-machine core loop (recoder-1ejn)
  -> invite cohort
```

`recoder-5iqy` and the required slice of `recoder-qtac` run as owner-controlled
supporting gates because hosted device auth remains part of the beta path.
