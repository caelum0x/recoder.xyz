# Recoder Conductor — Parity & Shippability

> Generated 2026-07-31 by a 9-agent audit (Recoder conductor surface vs Conductor.build
> feature-by-feature + 6 production-readiness dimensions, code-grounded). Living planning
> doc — the roadmap below is the "here → production multi-user" path. 47 parity features
> mapped, 46 gaps found (6 blockers, 15 high, 19 medium, 6 low).

## TL;DR

On **mechanics, Recoder is at or above Conductor.build across the board**, and strictly
**exceeds** it on the thesis-defining features Conductor.build has no equivalent for:
multi-agent parallelism (different agents — Claude/Codex/opencode/pi — on one task), the
**N→1 convergence flow**, and the **governance / audit / signed-evidence** layer. The gap
is **not capability — it is adoption trust and multi-tenant safety.** Two half-wired UX
affordances (mid-run "needs input" notification + a truthful signed-in profile) are exactly
what sells the "walk away and it just works" story, and behind the polished surface sit
correctness/isolation defects (below) that make the current build a strong **single-user
demo**, not yet a safe **multi-tenant product**.

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
| Reconcile / restart survival | Parity (code) — **not auto-triggered** (P1 #7) | Governed reconcile exists but only a manual endpoint calls it. |
| Continue / chat | Parity | message (new run) + steer (live send-keys), both gated. |
| Governance gate (write seam) | **Exceeds** | Module refuses to construct without a gate; every mutation decide→audit; deny never reaches git/gh. |
| Convergence evidence / export | **Exceeds** | Signed, content-hashed evidence + SOC2/EU-AI-Act/DORA compliance pack. |
| Preview verification (browser) | **Exceeds** | Bounded browser run asserts text + screenshot, seals audit. |
| Memory / code-intel enrichment | **Exceeds** | mem0∪beads→ColBERT rerank prompt enrich + completion harvest. |
| Coordination admission (double-assignment guard) | **Exceeds** | Defers launch + governed reroute when 2+ agents hold the issue. |
| MCP tool injection | Parity | Secret-free `.mcp.json` into worktree. |
| Approvals | **Partial** | needs-approval verdicts + `awaiting_approval` surfaced; dedicated approval-queue UI lives in agent-os. |
| Diff-comment → agent (inline review feeds agent) | **Gap** | Routes exist; comment→agent-prompt plumbing not wired end-to-end (`recoder-aiio`). |

### B. Onboarding / UX (adoption surface)

| Feature | Status | Notes |
|---|---|---|
| Entry cards ("it just works") | Parity | Open project / GitHub / Quick start + live setup checklist. |
| Agent auto-detection from PATH | **Exceeds** | GUI PATH root cause fixed; detects multiple runtimes; greys launch truthfully when none. |
| Environment import ("we found your setup") | **Exceeds** | git identity, agents, gh-auth, shell. |
| Per-workspace terminal, diff UI, merge, archive, run history, ⌘K palette, clone modal, keyboard shortcuts, quick start, per-message model | Parity | All present. |
| **Notifications when agent needs input** | **Partial** | Fires on awaiting_review/failed only; the classifier computes needs_input but the notifier ignores it — the "walk away, get pinged" promise is half-wired (`recoder-wupr`). |
| Identity / profile (name + avatar) | **Partial** | Avatar landed; embedded/cookie desktop path drops real name/email/plan → generic "Signed in FREE" (`recoder-4st1`). |

---

## Section 2 — Shippability roadmap (here → production multi-user)

### P0 — Blocks any real launch

| # | Title | Effort | Recommendation |
|---|---|---|---|
| 1 | **Cross-tenant IDOR: conductor workspaces have no owner/tenant scoping** on read or write | L | Add `principal` to every read; enforce `createdBy`/org match; tenant-filter list/query in SQL. Any authed user can list/diff/steer/stop/**merge** another tenant's workspace by guessing an id. |
| 2 | **Agent-OS CRUD is cross-tenant** readable; PUT `/spaces/:id/policy` lets anyone rewrite another tenant's forbiddenPaths/approval gates | L | Derive ownerId from `req.principal` (never body); reject unowned upsert; tenant-scope every list/get. |
| 3 | Paying website customers treated as **Free** by the enforcing gate (plan-ID vocabulary drift `pro-monthly`→?) | M | Alias `pro-monthly/pro-yearly→pro`; unknown coerces to `free`; contract test every website planId → non-free. |
| 4 | Two disconnected billing systems — the surface that **sells** (Paddle/Dodo) ≠ the one that **enforces** (Polar) | XL | Pick ONE MoR provider + ONE checkout/webhook; website routes thin proxies; drive `subscriptionPlan` from backend webhook projection only. |
| 5 | **No canonical release line** — origin/main frozen ~2 months; all work on the feature branch; ~552 conflicts | XL | *Owner-gated:* fast-forward/replace main, or staged reconciliation. No repeatable release until one trunk is authoritative. |
| 6 | **All 33 CI/CD workflows disabled** — zero release automation, zero gate enforcement | L | *Owner-gated:* re-enable a green core (test + secret-scan on PR) first, then deploy/release once trunk is canonical. |

### P1 — Blocks trustworthy multi-tenant (highlights)

- **#7 reconcile never auto-triggered** — surviving runs stop streaming, crashed runs stay stuck. Auto-run on boot with a system principal. (M)
- **#8 conductor run/event read model is in-memory-only**, mislabeled "durable" — run history returns `[]` after any restart. Bind to the durable agent-os store. (M)
- **#9 web sessions carry no `orgId`** → org/RBAC isolation structurally unreachable for the primary login. (M)
- **#10 RBAC evaluator wired to nothing but org-member mgmt** — attach `requirePermission`/ownership to conductor + agent-os mutating routes. (L)
- **#11 no org auto-provisioning on signup** — real users have no tenant boundary. Auto-create a personal org on first login. (M)
- **#12/#13 no CI security gates; secrets in git history unscrubbed** — re-enable dep-audit/CodeQL/gitleaks; rotate historical leaks. (M/L)
- **#14 8 post-audit domains never reviewed for IDOR** (social/cloud/inference/memory/observability/interop/governance/edge). (L)
- **#15 mid-run "needs input" attention never reaches board/notifications** — *the adoption-critical UX gap.* (M)
- **#16 no coding agent bundled/installable in-app** — non-terminal user dead-ends at "No agents found." (L)
- Plus: quotas advertised ~10× enforced (#17), `subscription/manage` grants paid with no payment (#18), solo-mode fail-open on shared host (#19), desktop signing/notarization uncommitted (#20), `desktop-release.yml` broken (#21), manual deploy bypasses gates (#22), entitlement id-split (#23).

### P2 — Polish / hardening (highlights)

Security headers/helmet (#24), CSRF + credentialed CORS (#25), distributed rate-limit (#26),
A2A ed25519 over shared HMAC (#27), non-root images (#28); dunning grace (#29), overage/proration (#30);
durable run-history fallout (#31/#32); agent auth probe at onboarding (#33), git-init affordance (#34),
diff-comment→agent loop (#35), collapse the two Better-Auth configs (#36), deploy entrypoint cleanup (#37/#38),
in-app agent re-scan (#39), users→user backfill (#40), indexed `tenant_id` column (#41), embedded-path identity (#42),
assorted low-risk security (#43).

---

## Critical path (the 5–8 that most move the needle)

1. **Establish a canonical trunk (#5).** *Owner-gated.* Nothing ships repeatably until one branch is authoritative.
2. **Re-enable a minimal green CI core (#6, #12, #13)** + rotate historical secrets. The gate every subsequent fix passes through.
3. **Close the two blocker IDORs (#1, #2), backed by a queryable `tenant_id` column (#41).** The single biggest correctness/safety win — unblocks multi-user at all.
4. **Fix entitlement + billing coherence (#3, #4).** Alias the plan vocabulary (same-day) so paying customers stop reading Free; then unify to one MoR provider so revenue unlocks capability.
5. **Wire org identity + RBAC + auto-provisioning (#9, #10, #11).** The isolation primitives exist; connect them.
6. **Durable + automatic restart-survival (#7, #8).** Auto-reconcile on boot; back run/event reads with the durable store — else a routine restart is the classic "backend 200s but nothing works."
7. **Wire mid-run "needs input" notification + badge (#15) and remove the agent-install dead-end (#16).** The adoption unlock — what makes the "walk away and it just works" thesis true for a non-terminal user. The engine already exceeds Conductor.build; this is where the *perceived* gap lives.
