# Recoder — Security Posture

> **Updated 2026-07-31.** Honest, code-grounded security posture for the Recoder
> convergence layer. Recoder is **self-hosted**: you run N coding agents in isolated
> git worktrees on infra you own and converge them into one governed merge. This doc
> states **what a scoped product-audit sweep found and fixed**, **what remains
> residual**, and **what must happen before a multi-tenant cloud launch**.
>
> Per repo policy: **truthful health, never fake success.** The audits were **scoped,
> not exhaustive** — a full independent pre-launch security pass is still warranted.
> Roadmap + gap IDs: **[CONDUCTOR-PARITY-AND-SHIPPABILITY.md](./CONDUCTOR-PARITY-AND-SHIPPABILITY.md)**.
> Live status: **[STATUS.md](./STATUS.md)**.
>
> **Update (2026-07-31, later same day).** Beyond the 21-vuln sweep (§1), the **entire
> cross-tenant isolation surface** is now owner-bound: both P0 IDORs (conductor + agent-os),
> a **17-hole wave across 6 more domains** (memory / governance / social / cloud /
> observability / inference), and the conductor **group compare/converge** residual — all
> closed. **Web hardening** (security headers, CSRF, credentialed-CORS guard) and **durability
> idempotency** (event-log + durable run/event store) also landed. These moved out of
> §2 *residual* into §1 *fixed* (§1.2 below).

---

## 1. What the product-audit sweep found + fixed

A product-wide defect sweep (31-agent find→verify workflow) surfaced **21 confirmed,
adversarially-verified vulnerabilities** — **3 critical, 7 high, 9 medium, 2 low** —
across the backend/packages moat. **All fixed**, each TDD'd (failing test first) and
verified; backend `tsc` 0, **1,351 tests green** across the touched + rippled domains
(commit `12477bc34`, `fix(security): close 21 adversarially-verified vulns from the
product-wide audit`).

### Critical (3)

| Class | Vuln | Fix |
|---|---|---|
| Privilege escalation | `sk_` API-key mint stored caller-supplied scopes verbatim → any authed user could mint an admin/internal key (super-user). | Minted scopes are now a **subset of the minter's**; privileged scopes refused unless already held (`identity/api-key.service.ts` + routes + ports). |
| RCE | `recoder.workflow.verify` MCP tool shelled caller-supplied `checks[].command` with full `process.env`. | Defense in depth: **registry-only** commands (caller command stripped), **minimal PATH/HOME-only env** (no shell inheritance), the MCP boundary **drops the `command` field**, and `workflow.verify` raised to **`needs_approval`** in the risk classifier. |

### High (7)

| Class | Vuln | Fix |
|---|---|---|
| Retrieval LFI | HTTP ingest read an arbitrary filesystem path via `search`. | **Inline-text only** + **tenant-namespaced** collections (`memory/routes/retrieval.routes.ts`). |
| Auth fail-open | `getAuthEnv` returned an empty `BETTER_AUTH_SECRET` under `DOCKER=1`. | Removed the short-circuit; **missing secrets fail fast** (`packages/auth/keys.ts`). |
| Forbidden-path bypass | `**/` glob didn't match repo-root files; `rm -rf` gate defeated by flag reordering. | Leading `**/` now an optional segment; `rm -rf` gate hardened against flag reorder / long-form (`packages/agent-policy/rules/{glob,command-risk}.ts`). |
| Governance blind to nested args | `describeToolInput` dropped arrays/objects → secrets/paths in nested args unseen by the gate. | **Recursive secret-free projection** with depth/size bounds (`governance/tool-exec-gate.ts`). |
| Billing undercharge | polar/dodo `emitUsage` swallowed push errors → undelivered usage marked flushed. | **Re-throw** on push failure; **webhook timestamp-freshness** blocks replay (`billing/adapters/{polar,dodo,shared}.ts`). |
| Secret-in-logs | Stub auth senders logged token-bearing magic-link / reset URLs. | Log **email + not-wired only** (`identity/adapters/better-auth.adapter.ts`). |
| IDOR (invite) | `acceptInvite` lacked an ownership check. | Ownership-scoped (`identity/org.service.ts`). |

### Medium / Low (11)

Retrieval cross-tenant collections (principal-bound); OPA response **validated
fail-closed**; run-tailer attached-guard cleared on completion (continued runs stream);
metering **idempotency keyed per-event** (no under-count); control-mode probe race;
`db_schema_inspect` privilege gate; comma-join `FROM`-allowlist bypass; `KvStore`
silent write-drop → rethrow; migration split-on-`;` inside literals/comments.

> **Boundary discipline reinforced:** the fixes tighten the same trust boundary the
> repo policy names — never trust agent output, MCP tool descriptions, memory
> candidates, or runtime-reported success; always enforce below the model
> (see `.claude/rules/security.md`).

### 1.2 Cross-tenant isolation + web hardening + durability (second wave, same day)

The parity+shippability audit's isolation defects (previously *residual*, §2) were then
closed as their own TDD'd tranche. **All fixed:**

| Class | Vuln | Fix | Commit |
|---|---|---|---|
| IDOR (conductor) | Workspaces had **no owner/tenant scoping on read or write** — any authed user could list/diff/steer/stop/**merge** another tenant's workspace by guessing an id. | One `requireWorkspaceAccess` guard over all **28** workspace-scoped routes + list filtering; non-owner gets a 404 **byte-identical** to a missing workspace (no existence oracle); admin/internal bypass; org-tenant scoped when present (`conductor/routes/workspace-access.ts`). | `51c7ee66d` |
| IDOR (agent-os) | CRUD cross-tenant readable; `PUT /spaces/:id/policy` let anyone rewrite another tenant's `forbiddenPaths` / approval gates. | `space-authz` seam: owner from `req.principal` (never body); tenant-scoped list/get; policy PUT owner/operator-only (`agent-os/services/space-authz.ts`). | `51c7ee66d` |
| IDOR (6 domains) | **17 cross-tenant holes** across memory / governance / social / cloud / observability / inference (read-scope leaks, ownership-less mutations, usage-ledger cross-read, approvals visibility). | Principal-bound ownership guards + read-scoping + per-domain config, each with a dedicated IDOR test (`governance-approvals-idor`, `usage-ledger.ownership`, `candidate-repository.adapter`, `cloud-mesh-fleet-scope`, …). | `00a12168d` |
| IDOR (conductor groups) | Group-scoped compare/converge could read across tenants (the residual left by the workspace-level fix). | Group-access guard on compare/converge routes (`conductor/compare-group-idor.test.ts`, `compare.routes.ts`/`compare.service.ts`). | `365fc1c92` |
| Web hardening | No security headers; no CSRF; credentialed CORS unguarded. | CSP/HSTS/nosniff/frame-deny as the first middleware (`51c7ee66d`); CSRF middleware (`http/middleware/csrf.ts`) + boot-time credentialed-CORS guard (`bootstrap/cors-credentials-guard`) (`365fc1c92`). | `51c7ee66d` · `365fc1c92` |
| Durability / integrity | Run/event reads were in-memory-only (history `[]` after restart); event-log lacked idempotency (double-apply risk). | Run/event reads bound to the **durable store** (`fd6621902`); agent-os **event-log idempotency** keyed per event across postgres + in-memory repos (`7cceb681e`). | `fd6621902` · `7cceb681e` |
| Reliability guard | `RECODER_SOLO_MODE` fail-open reachable on a shared host. | Boot guard refuses solo-mode on a non-loopback / shared-DB host (`bootstrap/solo-mode-guard.ts`). | `51c7ee66d` |

**Final wave (2026-07-31) — the last 2 of the original 8 IDOR domains:**
`interop` and `edge` completed the audit (adversarial find→verify sweep `wrxr15ae9`):
2 confirmed-reachable holes fixed (A2A task ownership + `/internal/persistence/*` gating);
1 residual filed (`recoder-xiqj`, governance approval-clearance principal-binding).

---

## 2. Residual risk (flagged by the parity audit's security dimension)

The 21-vuln sweep (§1) plus the isolation/hardening wave (§1.2) closed the moat +
the cross-tenant read/write surface. What the parity+shippability audit
(**[CONDUCTOR-PARITY-AND-SHIPPABILITY.md](./CONDUCTOR-PARITY-AND-SHIPPABILITY.md)**)
still flags as **RESIDUAL — open or partial** is below. The isolation defects that made
this a single-user-only build are now closed; the residuals are the **owner-gated auth-model
prod-validation, CI/secret work, billing unification, and infra hardening**.

### Multi-tenant isolation (largely closed — remaining pieces)

| Gap | Detail | ID | State |
|---|---|---|---|
| Cross-tenant IDOR (conductor / agent-os / 6 domains / groups) | The read/write cross-tenant surface. | P0 #1/#2 · P1 #14 | **✅ Fixed** (§1.2). |
| Cross-tenant IDOR (`interop` + `edge`) | The last two of the original 8 domains, audited via an adversarial find→verify sweep. **Two confirmed-reachable holes fixed:** A2A task ownership bound to the verified ed25519 signer instead of a spoofable `params.userId` (`interop-wire`), and `/internal/persistence/*` gated behind `requireInternal` (was unauthenticated — full schema disclosure + migration trigger). | audit `wrxr15ae9` | **✅ Fixed** (2 holes) — one **residual filed** (`recoder-xiqj`, governance approval-clearance principal-binding: real gap, doubtful reach, needs a policy decision). |
| Indexed `tenant_id` | Scoping is enforced in the **guard/query layer** (principal/orgId-bound); a dedicated **indexed** `tenant_id` column for SQL-level filtering at scale is a refinement. | P2 #41 | **🟡 Partial** — enforced in-app; indexed column pending. |
| Org identity | Backend seam scopes by `orgId` when a principal carries one. **✅ Backend auto-provisioning committed** (`OrgProvisioningService` per-owner default org + `principal.orgId`). **Remaining (owner-script-gated):** stamp `orgId` on the primary **Next/Better-Auth** cross-subdomain session, provision on first web login, reconcile the `user`/`users` split (#40). | P1 #9/#10/#11 | **🟡 Backend landed; web session owner-gated.** |

### Supply chain / CI / secrets

| Gap | Detail | ID |
|---|---|---|
| CI gates disabled | **All 33 CI/CD workflows disabled** — zero release automation, **zero gate enforcement** (no test/secret-scan/dep-audit/CodeQL on PR). | P0 #6 · P1 #12 |
| Secrets in git history | Historical leaks (e.g. `COMPOSIO_API_KEY`) **unscrubbed / unrotated**; code now reads env, but the history and live keys need rotation. | P1 #13 |
| Run-as-root images | Container images run as root. | P2 #28 |

### Web hardening (mostly applied)

| Gap | Detail | ID | State |
|---|---|---|---|
| Security headers | CSP/HSTS/nosniff/frame-deny as first middleware. | P2 #24 | **✅ Fixed** (§1.2). |
| CSRF + CORS | CSRF middleware + boot-time credentialed-CORS guard. | P2 #25 | **✅ Fixed** (§1.2). |
| Rate limiting | No distributed rate-limit (per-instance only). | P2 #26 | **Open** (needs Redis/shared store). |
| A2A signing | Envelope schema carries `ed25519` alongside `hmac-sha256`, and **external ingress now refuses HMAC-only untrusted requests** (`401 external_ingress_requires_ed25519`; trusted/loopback keep HMAC). Per-actor internal enforcement pending. | P2 #27 | **🟢 External ingress enforced; internal per-actor pending.** |

### Billing / entitlement integrity

| Gap | Detail | ID | State |
|---|---|---|---|
| Entitlement drift | Plan-alias map (`pro-monthly/pro-yearly→pro`, unknown→`free`) so paying customers stop reading Free. | P0 #3 | **✅ Fixed** (`51c7ee66d`). |
| Quotas mismatch | Advertised quotas now derived from the enforced source; `subscription/manage` 402-refuses paid-with-no-payment. | P1 #17/#18 | **✅ Fixed** (`51c7ee66d`). |
| Two billing systems | The surface that **sells** (Paddle/Dodo) ≠ the one that **enforces** (Polar) — still two providers. The **dunning-grace + overage-CTA logic (#29/#30) is now landed** on the enforce side; overage **proration** and the provider unification itself remain. | P0 #4 · #29/#30 | **Open — the one XL** (dunning/overage-CTA landed on top). |

### Self-hosted runtime

| Gap | Detail | ID | State |
|---|---|---|---|
| Solo-mode fail-open | `RECODER_SOLO_MODE` intentionally fails open on cloud write-gates for the DB-less desktop; a boot guard now refuses it on a non-loopback / shared-DB host, so it can't be reached on a shared host. | P1 #19 | **✅ Guarded** (`51c7ee66d`). |
| Desktop signing | Signing / notarization uncommitted; unsigned arch-limited dmg. | P1 #20 · P2 | **Open — owner-gated.** |

---

## 3. Before-multi-tenant-cloud-launch security checklist

Ordered by the parity audit's **critical path**. Much is now done (✅); the rest is
**owner-gated + one XL**. A full independent pre-launch pass (external review + the
2 remaining unaudited domains) is still required.

- [x] **Close the two blocker IDORs** (#1, #2) — done; principal-derived, tenant-scoped,
      404-not-403 for non-owners (§1.2).
- [x] **IDOR-review the post-audit domains** (#14) — all 8 done (memory, governance,
      social, cloud, observability, inference, interop, edge) + the conductor group residual
      (2 holes in interop/edge fixed, 1 residual filed).
- [x] **Apply the core web hardening** (#24/#25) — security headers, CSRF, credentialed-CORS
      guard (§1.2).
- [x] **Fix entitlement + quota coherence** (#3/#17/#18) — plan-alias + enforced-source quotas
      + `subscription/manage` 402-refuse.
- [x] **Guard solo-mode fail-open** (#19) — boot guard refuses shared-host solo-mode.
- [x] **Durable + idempotent run/event store** (#8, event-log idempotency) — survives restart,
      no double-apply.
- [ ] **Establish a canonical trunk** (P0 #5) — *owner-gated.* No repeatable release
      until one branch is authoritative.
- [ ] **Re-enable a minimal green CI core** (P0 #6, #12): test + secret-scan (gitleaks)
      on every PR; then dep-audit / CodeQL. *Owner-gated.*
- [ ] **Rotate historical secrets** (#13) and scrub git history of leaked keys. *Owner-gated.*
- [ ] **Complete org identity — web side** (#9/#10/#11 + #40): stamp `orgId` on the
      Next/Better-Auth cross-subdomain session, auto-provision a personal org on first login,
      run the `users→user` backfill, validate cross-subdomain behavior. *Owner-script-gated.*
- [ ] **Unify billing providers** (#4) — one MoR provider + one checkout/webhook; then
      dunning-grace / overage / overage-CTA (#29/#30). *The one XL.*
- [ ] **Remaining hardening** — indexed `tenant_id` column (#41), distributed rate-limit /
      Redis (#26), per-actor **A2A ed25519 enforcement** (#27), run-as-non-root images (#28).
- [ ] **Sign + notarize the desktop build** (#20) before public distribution. *Owner-gated.*
- [ ] **Commission a full, independent pre-launch security audit** — the internal
      sweeps were scoped and are explicitly not exhaustive.

---

## 4. What is already strong

- **Governance write-seam:** the conductor module refuses to construct without a
  policy gate; every mutation is decide→audit; a deny never reaches git/gh.
- **Signed, content-hashed convergence evidence:** Ed25519-signed (env-gated
  `EVIDENCE_SIGNING_KEY`), Merkle-chained audit, framework-mapped export (SOC2 CC8.1 /
  EU AI Act Art. 12 / DORA) with each control status **derived** from present evidence.
- **Path containment:** ACP substrate fs bridge is symlink-contained and path-scoped;
  forbidden-path + `rm -rf` policy hardened.
- **Least-privilege scopes:** `sk_` minting is now subset-bounded; privileged tool
  verbs (`workflow.verify`, `db_schema_inspect`) are approval-gated.
- **Fail-fast secrets:** empty auth secrets fail fast rather than fail open.

- **Cross-tenant isolation (new, §1.2):** the read/write cross-tenant surface is now
  owner-bound across conductor, agent-os, and 6 further domains + the conductor group
  compare/converge path — non-owners get a 404-not-403 (no existence oracle).
- **Web hardening (new, §1.2):** security headers, CSRF, credentialed-CORS guard.

These are real, code-grounded strengths. They do **not** substitute for the **owner-gated**
release/auth-model/secret work, the **billing-provider unification**, or the still-warranted
**independent pre-launch audit** above.
