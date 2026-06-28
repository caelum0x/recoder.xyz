# docker-backend distribution module

Wires `@recoder/distribution` into docker-backend with concrete, injected ports.
This module is the USED surface of the distribution subsystem: CLI device-flow
auth, billing/entitlement/quota status, the enterprise device kill-switch, org
seats, an entitlement-gating middleware, and the signature-verified Polar webhook.

## Injected ports (real, never stubbed)

| Port        | Concrete implementation                                              |
|-------------|---------------------------------------------------------------------|
| `AuthPort`  | `recoder-auth-port.ts` → recoder.xyz `/api/auth/verify-token` (signed internal envelope). recoder.xyz is the auth source of truth. |
| `BillingPort` | the package's real Polar (Merchant-of-Record) adapter; fail-safe `unhealthy`/deny when `POLAR_ACCESS_TOKEN` is absent. Provider-agnostic — Dodo/Creem/Paddle is a one-adapter swap in `module.ts`. |
| `EventBusPort` | `event-bus-port.ts` → durable, bounded, auditable `RunEvent` sink (persistence + logger). |
| `SecretPort` | env-backed (`createEnvSecretPort`). |

Plan resolution uses docker-backend's live Polar subscription state
(`billing/subscription-tier.resolveUserTier`), falling back to Polar
entitlement grants, then the `free` floor — never an inflated plan on error.

## Mounted routes (`server.ts`)

- `POST /api/auth/cli/device|authorize|token|verify` — RFC 8628 device flow.
  Matches the `scripts/verify-cli-device-flow-e2e.sh` contract. `/token`
  handles both the `device_code` exchange and the `refresh_token` grant.
- `GET/POST /api/billing/*` — subscription/entitlement/quota status, hosted
  checkout, device register/list/revoke, org seats assign/list/revoke, and two
  entitlement-gated capability endpoints (`cloud-sync`, `parallel-workspaces`).
- `POST /internal/billing/webhook` — Polar webhook, mounted with a RAW body
  parser BEFORE the global JSON parser so the Standard-Webhooks signature
  verifies over the exact bytes. Untrusted/invalid → deny (never a faked 200).

## Fail-safe guarantees

- Missing `POLAR_ACCESS_TOKEN` → billing `unhealthy`, every money/entitlement
  call denies.
- Missing `CLI_TOKEN_SIGNING_KEY` → CLI token issue/verify denied (503/deny).
- Missing `POLAR_WEBHOOK_SECRET` / bad signature / stale timestamp / malformed
  body → webhook denied (`webhook_untrusted`).
- Entitlement-gate resolution error or over-plan → `402 upgrade_required`.

## Tests

`distribution.routes.test.ts` proves, over a real Express server: device-flow
issue+verify, single-use grant, gate allowed-under-plan / denied-over-plan, a
signed webhook updating entitlement (RunEvent emitted), unsigned-webhook deny,
and webhook dedupe.
