# Recoder — Security Posture

> **Updated 2026-07-31.** Honest, code-grounded security posture for the Recoder
> convergence layer. Recoder is **self-hosted**: you run N coding agents in isolated
> git worktrees on infra you own and converge them into one governed merge. This doc
> states **what a scoped product-audit sweep found and fixed**, **what remains
> residual**, and **what must happen before a multi-tenant cloud launch**.
>
> Per repo policy: **truthful health, never fake success.** The audit was **scoped,
> not exhaustive** — a full pre-launch security pass is still required. Roadmap +
> gap IDs: **[CONDUCTOR-PARITY-AND-SHIPPABILITY.md](./CONDUCTOR-PARITY-AND-SHIPPABILITY.md)**.
> Live status: **[STATUS.md](./STATUS.md)**.

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

---

## 2. Residual risk (flagged by the parity audit's security dimension)

The **21-vuln sweep was scoped to the moat** (identity / api / billing / agent-os /
conductor / persistence / engines). The parity+shippability audit
(**[CONDUCTOR-PARITY-AND-SHIPPABILITY.md](./CONDUCTOR-PARITY-AND-SHIPPABILITY.md)**)
independently flagged the following as **RESIDUAL — open, not yet fixed**. These are
the reasons the current build is a strong **single-user** product, not yet a safe
**multi-tenant** one.

### Multi-tenant isolation (the biggest gap)

| Gap | Detail | ID |
|---|---|---|
| Cross-tenant IDOR (conductor) | Workspaces have **no owner/tenant scoping on read or write** — any authed user can list/diff/steer/stop/**merge** another tenant's workspace by guessing an id. Create now stamps `createdBy`; full read/write scoping is pending. | P0 #1 |
| Cross-tenant IDOR (agent-os) | CRUD is cross-tenant readable; `PUT /spaces/:id/policy` lets anyone rewrite another tenant's `forbiddenPaths` / approval gates. | P0 #2 |
| No queryable `tenant_id` | No indexed tenant column to enforce scoping in SQL. | P2 #41 |
| Org identity unwired | Web sessions carry no `orgId`; RBAC evaluator wired to nothing but org-member mgmt; no org auto-provisioning on signup. | P1 #9/#10/#11 |
| **8 domains never IDOR-reviewed** | social / cloud / inference / memory / observability / interop / governance / edge were **not** in the audit scope. | P1 #14 |

### Supply chain / CI / secrets

| Gap | Detail | ID |
|---|---|---|
| CI gates disabled | **All 33 CI/CD workflows disabled** — zero release automation, **zero gate enforcement** (no test/secret-scan/dep-audit/CodeQL on PR). | P0 #6 · P1 #12 |
| Secrets in git history | Historical leaks (e.g. `COMPOSIO_API_KEY`) **unscrubbed / unrotated**; code now reads env, but the history and live keys need rotation. | P1 #13 |
| Run-as-root images | Container images run as root. | P2 #28 |

### Web hardening (not yet applied)

| Gap | Detail | ID |
|---|---|---|
| Security headers | No helmet / security-header middleware. | P2 #24 |
| CSRF + CORS | No CSRF protection; credentialed CORS needs tightening. | P2 #25 |
| Rate limiting | No distributed rate-limit (per-instance only). | P2 #26 |
| A2A signing | A2A uses shared HMAC; ed25519 per-actor signing not yet enforced. | P2 #27 |

### Billing / entitlement integrity

| Gap | Detail | ID |
|---|---|---|
| Entitlement drift | Paying customers read as **Free** (plan-ID vocabulary drift `pro-monthly`→?). | P0 #3 |
| Two billing systems | The surface that **sells** (Paddle/Dodo) ≠ the one that **enforces** (Polar). | P0 #4 |
| Quotas mismatch | Advertised quotas ~10× enforced; `subscription/manage` can grant paid with no payment. | P1 #17/#18 |

### Self-hosted runtime

| Gap | Detail | ID |
|---|---|---|
| Solo-mode fail-open | `RECODER_SOLO_MODE` intentionally fails open on cloud write-gates for the DB-less desktop — **safe single-user, unsafe on a shared host**. | P1 #19 |
| Desktop signing | Signing / notarization uncommitted; unsigned arch-limited dmg. | P1 #20 · P2 |

---

## 3. Before-multi-tenant-cloud-launch security checklist

Ordered by the parity audit's **critical path**. None of these is done; a full
pre-launch pass (external review + the 8 unaudited domains) is still required.

- [ ] **Establish a canonical trunk** (P0 #5) — *owner-gated.* No repeatable release
      until one branch is authoritative.
- [ ] **Re-enable a minimal green CI core** (P0 #6, #12): test + secret-scan (gitleaks)
      on every PR; then dep-audit / CodeQL. Every subsequent fix passes through this gate.
- [ ] **Rotate historical secrets** (#13) and scrub git history of leaked keys.
- [ ] **Close the two blocker IDORs** (#1, #2) backed by an indexed `tenant_id`
      column (#41): derive `ownerId`/`orgId` from `req.principal` (never the body),
      tenant-filter every list/get/update in SQL, reject unowned upsert.
- [ ] **IDOR-review the 8 unaudited domains** (#14): social, cloud, inference, memory,
      observability, interop, governance, edge.
- [ ] **Wire org identity + RBAC + auto-provisioning** (#9/#10/#11): stamp `orgId` on
      web sessions, attach `requirePermission`/ownership to conductor + agent-os
      mutating routes, auto-create a personal org on first login.
- [ ] **Fix entitlement + billing coherence** (#3/#4): alias the plan vocabulary
      (`pro-monthly`/`pro-yearly`→`pro`, unknown→`free`) and unify to **one** MoR
      provider + one checkout/webhook.
- [ ] **Apply web hardening** (#24–#27): security headers/helmet, CSRF + credentialed
      CORS, distributed rate-limit, A2A ed25519.
- [ ] **Run-as-non-root images** (#28) and confirm solo-mode fail-open (#19) cannot be
      reached on a shared/multi-tenant host.
- [ ] **Sign + notarize the desktop build** (#20) before public distribution.
- [ ] **Commission a full, independent pre-launch security audit** — the internal
      sweep was scoped to the moat and is explicitly not exhaustive.

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

These are real, code-grounded strengths. They do **not** substitute for the
multi-tenant isolation, CI, and history-secret work above.
