# Recoder — Completeness Analysis (measured, honest)

Status: 2026-08-05. Answers "is it fully coded / are the APIs full / is the
backend done / do we have Google + Apple auth" with real measurement, not
assurances.

## 1. Size (measured LOC, excluding tests, node_modules, dist, .next)

| Area | LOC (own, excl tests) | Note |
|---|---|---|
| backend/src (TS spine, 15 domains) | **122k** (204k incl tests) | boots, tsc 0, 4,183 tests |
| apps/desktop frontend (TS/TSX) | **80k** | the recoder-* views + emain |
| apps/desktop server (Go) | **71k** | Wave-fork terminal server |
| packages/ (shared + vendored engine forks) | **646k** | incl recoder-code (roo/kilo fork), opencode-*, cli-router, a2a, agent-os contracts |
| app/ website (Next) | **75k** | auth/billing/account plane |
| **Total (own + vendored, excl tests)** | **≈ 994k** | ~1.2M incl tests |

**On the "500k LOC each" expectation:** LOC is a poor completeness proxy, but
the honest read — the *own* backend is 122k and the *own* desktop frontend is
80k (+71k Go). The million-LOC total is real but inflated by vendored engine
forks in packages/. So: this is a LARGE codebase (~1M LOC), NOT a thin one; but
"500k of hand-written backend" is not the right target — depth per domain and a
clear, uncrowded product are what's missing, not raw lines.

## 2. Auth — the direct question

| Provider | State | Where |
|---|---|---|
| **GitHub** | ✅ DONE | `packages/auth/src/index.ts:121`, `app/lib/auth-config.ts` — env-gated, throws on half-creds in prod |
| **Google** | ✅ DONE | `packages/auth/src/index.ts:129`, `app/lib/auth-config.ts:64` — same gating |
| **Apple** | ❌ MISSING | no provider wired — the concrete auth gap |
| Email/password | ⚙️ gated OFF (OAuth-only, env re-enable for self-host) | wave-0 |

**Apple Sign-In needs:** the `apple` social provider in BOTH auth configs +
`https://appleid.apple.com` in trustedOrigins + a **signed-JWT client secret**
(Apple requires a JWT, not a static string) generated from Client ID / Team ID /
Key ID / private key via `jose`, ≤6-month expiry, using Better Auth's async
provider config. Caveats: Apple emits `email` only on FIRST auth (persist it;
no user-info endpoint to fetch later); `email_verified`/`is_private_email` are
string-serialized; no localhost in dev; native iOS uses the bundle ID as
`clientId`. (Source: better-auth.com/docs/authentication/apple.)

## 3. APIs — full?

- **Website (`app/app/api`): 182 route files** — auth, billing (Creem/Dodo/
  Paddle), account, CLI device-flow + entitlements, admin, webhooks. Broad;
  wave-14 rate-limited the public ones. Gaps: Polar/Creem provider parity, the
  narrow proxy-quota hole (recoder-y41k).
- **Backend (`backend/src/domains`):** conductor ~63 routes (workspaces/compare/
  converge/merge/evidence/checkpoints/pr/ad-hoc), agent-os 17, engines 6,
  inference 3, interop-wire 3, observability 2, identity 1. Governance/memory/
  persistence/billing/cloud are internal composers (no HTTP by design).
- **Verdict:** the API surface is SUBSTANTIAL and the convergence loop is
  end-to-end (proven by the e2e test). "Full" is the wrong frame — a few domains
  are HTTP-thin because they're consumed in-process, which is correct.

## 4. Is the backend "done"?

Boots, tsc 0, 4,183 tests green. But per RECODER-ARCHITECTURE "honestly shallow":
domain *depth* is the open work — composers boot but several are thin; some
engines are PARKED with honest reasons (mem0/browser-use python deep loops,
openfang Hands, xds live config). Not "done" in the sense of maximal depth;
"done" in the sense of the product loop working truthfully end-to-end.

## 5. The real gap (owner directive 2026-08-05): CLARITY, not LOC

The product is large and the loop works — but it's **too crowded and the "why"
isn't obvious** (see [PRODUCT-GAPS.md](./PRODUCT-GAPS.md) +
[positioning memory]). More lines won't fix that. The work that matters:

- **Apple Sign-In** (the one concrete auth gap) — do it.
- **De-crowd** the desktop until the fan-out→converge loop is the obvious thing.
- **Sharpen** existing features (the loop, the run screen) + add clarity-forward
  NEW features (a guided first-run that *demonstrates* the value).
- **Depth** where a domain is shallow AND a product verb needs it (not depth for
  its own sake).

## Open questions for the owner (defaults chosen where reasonable)
1. Apple Developer creds (Team ID, Key ID, `.p8` private key, Service ID) — need
   them in prod env to actually enable Apple sign-in; the code will ship gated.
2. Polar + Creem provider parity — build or de-scope (thesis names 4 MoR
   providers; code has 3). Default: de-scope to shipped set unless a deal needs it.
3. Windows/Linux — native cross-builds are hardware-gated (recoder-di8l).
