# recoder-billing

> The Recoder **Distribution** billing & entitlement engine — the **fused** Polar
> monetization spine. This is **first-party Recoder code we own and edit**, merged
> from the open-source Polar Merchant-of-Record platform. It is **not** a thin HTTP
> wrapper of a closed service: Polar is the selected open-source Merchant of Record,
> and we merge its proven money/entitlement primitives directly.

`recoder-billing` is the durable money / entitlement / license authority for the
`@recoder/distribution` subsystem. The **only** surface `@recoder/distribution`
talks to is `recoder_billing.ipc.internal_api`, mounted at
`/internal/agent-os/billing/*`, protected by `INTERNAL_SERVICE_KEY` and a signed
envelope (`recoder_billing.ipc.envelope`). It is **never** a public source of
task / approval / artifact state — that stays canonical in `@recoder/agent-os`.

## What is fused in this slice (the testable spine)

This is the **first real slice**, not the full 268-file merge. It fuses the
self-contained, high-value primitives:

| Module | Fused from | Purpose |
|---|---|---|
| `config/settings.py` | `polar/config.py` | env-only settings; fail-safe (no faked allow) |
| `kit/jwt.py`, `kit/jwk.py`, `kit/crypto.py`, `kit/money.py`, `kit/currency.py` | `polar/kit/*` | self-contained primitives |
| `models/license_key.py`, `models/subscription.py`, `models/benefit_grant.py` | `polar/models/*` | canonical shapes (framework-light dataclasses) |
| `entitlements/license_key/service.py` | `polar/license_key/service.py` | issue / validate / activate license keys |
| `entitlements/benefit/{service.py,grant.py}` | `polar/benefit/*` | the grant-engine spine |
| `ipc/internal_api.py`, `ipc/envelope.py` | distribution.md §3.9 | `/internal/agent-os/billing/*` + signed-envelope verify |

## Fail-safe contract (production rule)

Missing keys (`POLAR_ACCESS_TOKEN`, `INTERNAL_SERVICE_KEY`, signing keys) degrade
to an **explicit unhealthy state and a deny** — never a faked "ok"/allow.
`recoder.xyz` is the auth source of truth: the device-flow / token primitives
verify against it, never a second authority. No hardcoded `localhost`/domains;
secrets come from env only.

## Status (truthful)

- The pure spine fused here is real first-party code with real, mirrored tests.
- `pytest` / FastAPI runtime needs a Python env that is **not present** in this
  workspace, so the test suite is verified by Python AST-compile only (see the
  slice report). Run `pip install -e ".[dev]" && pytest` in a real env.
- The remaining Polar modules (checkout / order / payout / stripe / webhook /
  meter / portal — hundreds of files) are the larger follow-up fusion.

## Layout

```
recoder_billing/
├── config/settings.py          # env-only settings, fail-safe
├── kit/                         # self-contained primitives (jwt, jwk, crypto, money, currency)
├── models/                      # canonical shapes (license_key, subscription, benefit_grant)
├── entitlements/
│   ├── license_key/service.py   # issue/validate/activate
│   └── benefit/{service,grant}.py
└── ipc/
    ├── envelope.py              # signed-envelope verify (never trust the wire)
    └── internal_api.py          # /internal/agent-os/billing/* surface
tests/                           # mirrored tests for the pure parts
```
</content>
