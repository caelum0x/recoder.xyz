# Supported Connectors Ledger

Date: 2026-02-15  
Canonical architecture: `shared/src/a2a/UNIFIED_A2A_UACB_ARCHITECTURE.md`  
Operational gate source: `ECOSYSTEM_PRODUCTION_BLUEPRINT.md`

## Status definitions

- `supported`: Tier-eligible connector with required release/support gates passing.
- `experimental`: Tier-eligible connector integrated, but support gates not yet passing.
- `backlog`: Connector intentionally deferred by tier policy.

## Tier policy

- Tier-1 (active): `codex`, `claude`
- Tier-2 (backlog): `cursor`, `windsurf`, `replit`, `vscode-copilot`, `jetbrains`
- Tier-2 promotion rule: blocked until successful no-skip Phase 3 closeout plus GA assertion pass.

## Gate-to-status rules

### Tier-1 (`codex`, `claude`)

- `supported` when all are true:
1. `ga_ready == true`
2. `release_evidence == PASS`
3. `smoke_phase1 == PASS`
4. `smoke_queue == PASS`
5. `smoke_static == PASS`
6. `a2a_interop == PASS`

- otherwise `experimental`

### Tier-2

- `backlog` until no-skip Phase 3 closeout succeeds and explicit promotion decision is recorded.

## Canonical current baseline (policy state)

| Connector | Tier | Baseline status | Reason |
|---|---|---|---|
| `codex` | Tier-1 | experimental | Promotes to `supported` only when Tier-1 gates pass in a qualifying run. |
| `claude` | Tier-1 | experimental | Promotes to `supported` only when Tier-1 gates pass in a qualifying run. |
| `cursor` | Tier-2 | backlog | Explicitly deferred by tier policy until no-skip closeout success. |
| `windsurf` | Tier-2 | backlog | Explicitly deferred by tier policy until no-skip closeout success. |
| `replit` | Tier-2 | backlog | Explicitly deferred by tier policy until no-skip closeout success. |
| `vscode-copilot` | Tier-2 | backlog | Explicitly deferred by tier policy until no-skip closeout success. |
| `jetbrains` | Tier-2 | backlog | Explicitly deferred by tier policy until no-skip closeout success. |

## Evidence artifacts

`phase3-production-gates.sh` emits connector support artifacts per run:

- `logs/phase3-gates/<run-id>-connectors-support.json`
- `logs/phase3-gates/<run-id>-connectors-support.md`

`phase3-evidence-pack.sh` includes these files in the bundle when present.

<!-- AUTO-PUBLISHED:TIER1-STATUS:START -->
## Auto-Published Tier-1 Status

Generated at: 2026-02-26T15:42:16Z
Artifact source: `phase3-gates`
Artifact file: `logs/phase3-gates/20260226-184148-connectors-support.json`

| Connector | Tier | Status | Reason |
|---|---|---|---|
| `codex` | tier1 | supported | Tier-1 connector gated by Phase 3 support gates |
| `claude` | tier1 | supported | Tier-1 connector gated by Phase 3 support gates |

Gate inputs:
| Input | Value |
|---|---|
| `release_evidence` | PASS |
| `smoke_phase1` | PASS |
| `smoke_queue` | PASS |
| `smoke_static` | PASS |
| `a2a_interop` | PASS |
| `a2a_runtime` | PASS |
| `a2a_production_smoke` | PASS |
| `ga_ready` | true |
| `support_gates_pass` | true |
| `no_skip_closeout_precondition` | true |
<!-- AUTO-PUBLISHED:TIER1-STATUS:END -->

