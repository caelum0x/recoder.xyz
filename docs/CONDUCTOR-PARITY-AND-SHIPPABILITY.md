# Recoder Conductor — Parity & Shippability

> Generated 2026-07-31 by a 9-agent audit (Recoder conductor surface vs Conductor.build
> feature-by-feature + 6 production-readiness dimensions, code-grounded). Living planning
> doc — the roadmap below is the "here → production multi-user" path. 47 parity features
> mapped, 46 gaps found (6 blockers, 15 high, 19 medium, 6 low).
>
> **Progress update (2026-07-31, later same day).** The code-fixable roadmap is now
> **largely landed**: both P0 IDORs (#1/#2), billing entitlement drift (#3), auto-reconcile
> (#7), the durable run/event store (#8), the whole cross-tenant isolation surface across
> 6 more domains + the conductor group compare/converge residual (#14), the adoption-UX
> gaps (#15/#16), quota/manage integrity (#17/#18), solo-mode guard (#19), and the web
> hardening tranche (#24 headers, #25 CSRF+CORS) — plus the diff-comment→agent loop (#35)
> and onboarding probe (#33). What **truly remains** is now mostly **owner-gated** (canonical
> trunk, CI re-enable + secret rotation, prod deploy, the web-side auth-model prod-validation)
> plus **one XL** (billing-provider unification, #4). See the ✅ marks below and the rewritten
> **Critical path**.

## TL;DR

On **mechanics, Recoder is at or above Conductor.build across the board**, and strictly
**exceeds** it on the thesis-defining features Conductor.build has no equivalent for:
multi-agent parallelism (different agents — Claude/Codex/opencode/pi — on one task), the
**N→1 convergence flow**, and the **governance / audit / signed-evidence** layer. The gap
was **not capability — it is adoption trust and multi-tenant safety.** The two half-wired UX
affordances that sell the "walk away and it just works" story (mid-run "needs input"
notification + in-app agent install) are **now wired** (#15/#16), and the isolation defects
that made the build a strong **single-user demo** are **now closed** at the read/write seam
across conductor, agent-os, and 6 further domains — moving it toward a **multi-tenant-safe
product** once the owner-gated release/auth-model/billing items below land.

---

## Section 1 — Conductor.build parity

### A. Core mechanics (the parallel-agent engine)

| Feature | Status | Evidence / gap |
|---|---|---|
| Parallel agent workspaces over isolated worktrees | **Exceeds** | Runs *different* agents on one task, each in its own worktree/taskGroup (conductor.build is Claude-Code-only). |
| Workspace create + governed launch | Parity | Full gate→pal-plan→substrate→worktree→spawn→audit; degrade-truthful. |
| Isolated git worktrees | Parity | `git worktree add`, per-workspace path, compare grid = one pane per sibling. |
| Substrate: tmux_worktree (local) | Parity | Probes git+tmux; control-mode tailing. |
| Substrate: ACP (Agent Client Protocol) | **Exceeds** | Full ACP client, permission gating to real governance, path-contained fs, restart reattach via `session/load`. |
| Substrate: Daytona/cloud + SSH (remote) | Parity | Creds-gated ⇒ degrades to local. |
| Substrate: in-process / openfang (native) | Parity | Opt-in native NAPI runtime, truthful readiness. |
| Live output streaming | Parity | WS fan-out + poll fallback. |
| Diff / review | Parity | Whole-diff, tree, per-file, single-file patch (pathspec-hardened). |
| Merge (governed) | Parity (**exceeds** on governance) | Gated; pre-merge conflict probe; readiness never "ready" without a clean pass; PR path. |
| **Converge (N→1)** | **Exceeds** | Pure fold of N diffs → pick/synthesize → convergence worktree through the governed merge. **No conductor.build equivalent — the headline thesis.** |
| Checkpoints + compare | Parity | git-tag checkpoints, restore, branch-from-checkpoint, contested-overlap set. |
| Reconcile / restart survival | **✅ Parity** (P1 #7 done) | Governed reconcile now **auto-fires on boot** with a system principal before edges serve, so surviving runs re-attach after a restart (`bootstrap/conductor-reconcile-on-boot.ts`, `51c7ee66d`). |
| Continue / chat | Parity | message (new run) + steer (live send-keys), both gated. |
| Governance gate (write seam) | **Exceeds** | Module refuses to construct without a gate; every mutation decide→audit; deny never reaches git/gh. |
| Convergence evidence / export | **Exceeds** | Signed, content-hashed evidence + SOC2/EU-AI-Act/DORA compliance pack. |
| Preview verification (browser) | **Exceeds** | Bounded browser run asserts text + screenshot, seals audit. |
| Memory / code-intel enrichment | **Exceeds** | mem0∪beads→ColBERT rerank prompt enrich + completion harvest. |
| Coordination admission (double-assignment guard) | **Exceeds** | Defers launch + governed reroute when 2+ agents hold the issue. |
| MCP tool injection | Parity | Secret-free `.mcp.json` into worktree. |
| Approvals | **Partial** | needs-approval verdicts + `awaiting_approval` surfaced; dedicated approval-queue UI lives in agent-os. |
| Diff-comment → agent (inline review feeds agent) | **✅ Parity** (#35 done) | Line-anchored review comments (incl. old-side deleted lines) compose into an agent prompt and route back to the run (`conductor/review/{review-comments,send-review-comments}.ts`, `84c6e22f1`/`8b240af5c`). |

### B. Onboarding / UX (adoption surface)

| Feature | Status | Notes |
|---|---|---|
| Entry cards ("it just works") | Parity | Open project / GitHub / Quick start + live setup checklist. |
| Agent auto-detection from PATH | **Exceeds** | GUI PATH root cause fixed; detects multiple runtimes; greys launch truthfully when none. |
| Environment import ("we found your setup") | **Exceeds** | git identity, agents, gh-auth, shell. |
| Per-workspace terminal, diff UI, merge, archive, run history, ⌘K palette, clone modal, keyboard shortcuts, quick start, per-message model | Parity | All present. |
| **Notifications when agent needs input** | **✅ Parity** (#15 done) | The `needs_input` classifier verdict now reaches the board badge + notification, not just awaiting_review/failed — the "walk away, get pinged" promise is wired (`desktop/.../recoder-board-logic.ts` + `recoder-model.ts`, `1e5ee10f6`). |
| In-app agent install / setup | **✅ Parity** (#16 done) | First-run agent-setup surface installs/points at a coding agent so a non-terminal user no longer dead-ends at "No agents found" (`desktop/.../recoder-agent-setup.tsx`, `1e5ee10f6`). |
| Identity / profile (name + avatar) | **Partial** | Avatar landed; embedded/cookie desktop path still drops real name/email/plan → generic "Signed in FREE" (#42, `recoder-4st1`). |

---

## Section 2 — Shippability roadmap (here → production multi-user)

### P0 — Blocks any real launch

| # | Title | Effort | Status |
|---|---|---|---|
| 1 | **Cross-tenant IDOR: conductor workspaces have no owner/tenant scoping** on read or write | L | **✅ Done** (`51c7ee66d`). A single `requireWorkspaceAccess` guard covers all 28 workspace-scoped routes + list filtering; a non-owner gets a 404 byte-identical to a missing workspace (no existence oracle); admin/internal operators bypass; org-tenant scoped when present (`conductor/routes/workspace-access.ts`). |
| 2 | **Agent-OS CRUD is cross-tenant** readable; PUT `/spaces/:id/policy` lets anyone rewrite another tenant's forbiddenPaths/approval gates | L | **✅ Done** (`51c7ee66d`). New `space-authz` seam derives owner from `req.principal` (never the body), tenant-scopes list/get, and guards `PUT /spaces/:id/policy` so only the owner/operator can rewrite forbiddenPaths/approval gates (`agent-os/services/space-authz.ts`). |
| 3 | Paying website customers treated as **Free** by the enforcing gate (plan-ID vocabulary drift `pro-monthly`→?) | M | **✅ Done** (`51c7ee66d`). Plan-alias map (`pro-monthly/pro-yearly→pro`, unknown→`free`); advertised quotas now derived from the enforced source (`app/lib/config/enforced-quotas.ts`); `subscription/manage` 402-refuses client-driven paid upgrades. |
| 4 | Two disconnected billing systems — the surface that **sells** (Paddle/Dodo) ≠ the one that **enforces** (Polar) | XL | **Open — the one XL.** Pick ONE MoR provider + ONE checkout/webhook; website routes thin proxies; drive `subscriptionPlan` from backend webhook projection only. The plan-alias fix (#3) stops the Free-misread symptom; unifying the providers is the durable fix. |
| 5 | **No canonical release line** — origin/main frozen ~2 months; all work on the feature branch; ~552 conflicts | XL | **Open — owner-gated.** Fast-forward/replace main, or staged reconciliation. No repeatable release until one trunk is authoritative. |
| 6 | **All 33 CI/CD workflows disabled** — zero release automation, zero gate enforcement | L | **Open — owner-gated.** Re-enable a green core (test + secret-scan on PR) first, then deploy/release once trunk is canonical. |

### P1 — Blocks trustworthy multi-tenant (highlights)

- **✅ #7 auto-reconcile on boot** — governed reconcile now fires once on boot with a system principal before edges serve; surviving runs re-attach after a restart (`bootstrap/conductor-reconcile-on-boot.ts`, `51c7ee66d`). (M)
- **✅ #8 durable run/event read model** — the conductor run/event reads are now bound to the durable store (`conductor/adapters/{run-event-sink,workspace-repository}.adapter.ts` + `ports/workspace-repository.port.ts`, `fd6621902`); run history survives restart instead of returning `[]`. (M)
- **🟡 #9/#10/#11 org identity + RBAC + auto-provisioning — backend landed, web side owner-gated.** The isolation guards derive/scope by `orgId` when a principal carries one (org-tenant scoped in #1/#2), and **backend org auto-provisioning is now committed**: `OrgProvisioningService` auto-provisions a default org per owner (idempotent) and `principal.service` resolves + attaches `principal.orgId` (`domains/identity/{org-provisioning.service,principal.service}.ts`). **Remaining (owner-script-gated):** stamp `orgId` onto the primary **Next/Better-Auth web session** (cross-subdomain), provision on first web login, and reconcile the `user`/`users` split (#40). This is the auth-model prod-validation blocker. (M/L)
- **#12/#13 no CI security gates; secrets in git history unscrubbed** — re-enable dep-audit/CodeQL/gitleaks; rotate historical leaks. *Owner-gated.* (M/L)
- **✅ #14 the post-audit IDOR sweep** — 17 cross-tenant holes closed across **6 domains** (memory / governance / social / cloud / observability / inference; `00a12168d`), plus the conductor **group compare/converge** residual (`365fc1c92`). Read-scoping, principal-bound ownership guards, and per-domain configs added, each TDD'd. **Remaining of the original 8:** `interop` and `edge` still to be IDOR-reviewed. (L)
- **✅ #15 mid-run "needs input" attention reaches board + notifications** — the adoption-critical UX gap is wired (`1e5ee10f6`). (M)
- **✅ #16 in-app agent install/setup** — non-terminal user no longer dead-ends at "No agents found" (`recoder-agent-setup.tsx`, `1e5ee10f6`). (L)
- **✅ #17/#18 quota + manage integrity** — advertised quotas derived from the enforced source (no ~10× drift); `subscription/manage` 402-refuses paid grants with no payment (`51c7ee66d`). (M)
- **✅ #19 solo-mode guard** — refuses to boot `RECODER_SOLO_MODE` on a non-loopback / shared-DB host, so the intentional single-user fail-open can't be reached on a shared host (`bootstrap/solo-mode-guard.ts`, `51c7ee66d`). (M)
- Still open: desktop signing/notarization uncommitted (#20, owner-gated), `desktop-release.yml` broken (#21, owner-gated), manual deploy bypasses gates (#22, owner-gated), entitlement id-split (#23).

### P2 — Polish / hardening (highlights)

- **✅ #24 security headers** — CSP/HSTS/nosniff/frame-deny as the first middleware, dependency-free, safe for a JSON backend (`51c7ee66d`).
- **✅ #25 CSRF + credentialed CORS** — CSRF middleware + a boot-time credentialed-CORS guard (`http/middleware/csrf.ts` + `bootstrap/cors-credentials-guard`, `365fc1c92`).
- **✅ #35 diff-comment→agent loop** — line-anchored review comments (incl. old-side deleted lines) route back to the agent (`84c6e22f1`/`8b240af5c`).
- **✅ #33 onboarding auth probe** — first-run `GET /environment` import probes git identity, agent configs, gh-auth, and shell; surfaced by the "We found your setup" card (`4ee503971` + `b532c9c52`). **✅ #34 git-init affordance** — an explicit in-app git-init action for a non-repo workspace root is now wired via the `recoder:git-init` emain bridge, with re-verify after init.
- **✅ #43 (partial)** — agent-os **event-log idempotency** (`postgres`/`in-memory` repos, `recoder-4euj`) + `app/lib/plan-limits.ts` vocabulary-drift fix (`recoder-wvth`), both in `7cceb681e`; plus the assorted low-risk items from the 21-vuln batch (`12477bc34`).
- **🟡 #41 indexed `tenant_id`** — cross-tenant scoping is now **enforced in the guard/query layer** (principal/orgId-bound) by #1/#2/#14; a dedicated **indexed** `tenant_id` column for SQL-level filtering at scale is the remaining refinement.
- **🟢 #27 A2A ed25519 — external ingress enforced.** The signed-envelope schema carries `ed25519` alongside `hmac-sha256`, and the ingress gate now **refuses untrusted external HMAC-only requests** (`401 external_ingress_requires_ed25519`; `domains/interop-wire/wire/ed25519-ingress.gate.ts` + `signed-ingress` carries a `trusted` flag so internal/loopback callers keep HMAC). **Remaining:** per-actor ed25519 enforcement for internal actors.
- **🟢 #29/#30 dunning grace + overage CTA — code-landed.** `past_due` subscriptions retain entitlements for a **7-day dunning-grace** window (`DUNNING_GRACE_DAYS`, `withinDunningGrace`) instead of hard-failing on the first missed webhook, and quota exhaustion surfaces an `UpgradeHint` naming the next tier that clears the limit (`upgradeTierForQuota`) for a real CTA (`domains/billing/services/{entitlement,plan-catalog}.service.ts`). Sits **on top of** billing-provider unification (#4, still open). Overage **proration** is the remaining slice.
- **Open:** distributed rate-limit / Redis (#26), non-root images / Docker (#28), overage proration on the #4 unification, durable run-history fallout (#31/#32), collapse the two Better-Auth configs (#36), deploy entrypoint cleanup (#37/#38), in-app agent re-scan (#39), `users→user` backfill (#40, owner-gated), embedded-path identity (#42).

---

## Critical path (what TRULY remains — now mostly owner-gated + one XL)

Most of the original critical path is **done** (see the ✅ marks above): both blocker IDORs
(#1/#2) and the 6-domain + group-IDOR sweep (#14) are closed; billing entitlement drift is
aliased (#3); auto-reconcile (#7) + the durable run/event store (#8) survive restart; the
adoption UX (#15/#16), quota/manage integrity (#17/#18), solo-mode guard (#19), and web
hardening (#24/#25) all landed. What is left is **not code we can freely write** — it is
release/auth-model/billing decisions and infra:

1. **Establish a canonical trunk (#5).** *Owner-gated.* Nothing ships repeatably until one
   branch is authoritative (origin/main frozen ~2 months; ~552 conflicts).
2. **Re-enable a minimal green CI core (#6, #12) + rotate historical secrets (#13).**
   *Owner-gated.* The gate every subsequent change passes through.
3. **Auth-model prod-validation (web side of #9/#10/#11 + #40).** The backend isolation seam
   is in place and scopes by `orgId` when present; the remaining work is on the primary
   **Next/Better-Auth** login: stamp `orgId` on the cross-subdomain web session,
   auto-provision a personal org on first login, run the `users→user` backfill, and validate
   cross-subdomain session behavior with the existing scripts before claiming multi-tenant.
   *Owner-script-gated* (prod DB + cross-subdomain access).
4. **Billing-provider unification (#4).** *The one XL.* Collapse the sells-vs-enforces split
   to one MoR provider + one checkout/webhook so revenue durably unlocks capability. Then the
   dunning-grace / overage / overage-CTA polish (#29/#30) sits on top.
5. **Prod deploy + infra hardening.** Deploy from the canonical trunk once CI is green
   (owner-gated), then distributed rate-limit / Redis (#26) and run-as-non-root images (#28)
   before opening a shared multi-tenant host.

Net: the build is now a **security-hardened, isolation-correct** product; the ship-blockers
are **owner decisions** (trunk, CI, prod deploy, auth-model prod-validation, secret rotation)
plus **one XL** (billing unification). See **[SECURITY-POSTURE.md](./SECURITY-POSTURE.md)** for
the fixed-vs-residual security picture and **[STATUS.md](./STATUS.md)** for the headline.
