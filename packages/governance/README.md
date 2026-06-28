# @recoder/governance

The policy spine of the Recoder Agent OS control plane. Governance decides whether
an agent action is **allowed**, **needs approval**, or is **denied**; routes work to
a model/runtime tier by risk + complexity; enforces permission modes and tool
access **below the model** (never trusting agent output); and records a
tamper-evident SHA-256 Merkle audit chain.

> Blueprint: [`docs/subsystems/governance.md`](../../docs/subsystems/governance.md).

## Status: deny-biased pure-TS fallback (Rust daemon deferred)

The full blueprint specifies an owned **Rust governance daemon** spoken to over a
typed UDS/CBOR + FFI boundary. That daemon is **deferred** in this build (Rust
cannot be compiled on the current disk). This package implements the **REAL
deny-biased pure-TS fallback path** the blueprint mandates for when the daemon is
down — it is usable governance, not a stub:

- Every verdict is marked `degraded: true` and `health().daemon === 'unavailable'`
  so the degraded condition is **truthful evidence**, never hidden.
- On any ambiguity the enforcer **denies** or requires approval. There is no
  silent-allow path.

## What it composes (does not absorb)

`@recoder/agent-policy` is **fused by composition**: the governance policy chain
calls the exact upstream rule functions (`evaluateSecretAccess`,
`evaluateApprovalRequired`, …) and the upstream `decision()` factory, then injects
two governance-only rules at deny-biased positions:

```
secret-access → forbidden-path (NEW) → work-lock (NEW) → approval-required
  → command-risk → mcp-tool-risk → network-access → tool-use → file-access → allow
```

- **forbidden-path**: hard-denies writes to auth / billing / security paths.
- **work-lock**: hard-denies writes outside the work-lock envelope the agent holds.

`@recoder/agent-policy`'s files are left intact and untouched; this package
depends on the published package.

## Quickstart

```ts
import { Governance, createGovernanceRequest } from '@recoder/governance';

const gov = await Governance.create({ autoApprove: { enabled: false, ceiling: 'medium' } });

const verdict = await gov.decide(
  createGovernanceRequest({
    actor,                       // @recoder/agent-os AgentProfile
    task,                        // @recoder/agent-os TaskSpec
    action: 'file.write',
    target: { path: 'src/auth/login.ts' },
    workLocks,
  }),
);

verdict.effect;      // 'deny'  (forbidden auth path)
verdict.tier;        // 'critical'
verdict.routing;     // unroutable
verdict.auditHash;   // sealed into the Merkle chain
gov.verifyAudit();   // { ok: true, tipHash }
```

`Governance` implements the agent-os `PolicyEnginePort`, so it drops in wherever
the control plane expects a policy engine:

```ts
const decision = gov.evaluate({ actor, action: 'file.read', target: { path } });
```

## Public surface

- `Governance` facade: `create`, `evaluate` (agent-os port), `decide`, `route`,
  `enforceTool`, `requestApproval`/`resolveApproval`, `recordAudit`/`verifyAudit`,
  `health`.
- Domain: `RiskTier`, `PermissionMode`, `GovernanceRequest`, `GovernanceVerdict`,
  `RoutingDecision`, `EnforcementResult`, `ToolAccessResult`, `AuditEntry`/`AuditAction`.
- Capability modules: `policy/`, `routing/`, `approval/`, `enforcement/`, `audit/`.
- `errors.ts` typed hierarchy + `result.ts` `Result<T,E>` envelope.

## Verification

```bash
pnpm -F @recoder/governance check-types   # 0 errors
pnpm -F @recoder/governance test          # 92 tests, mirrored under tests/
pnpm -F @recoder/governance build         # tsup dual ESM/CJS + d.ts
```

## Deferred (see governance.md)

The Rust daemon + IPC/FFI (`crates/recoder-governance-*`), the OPA evaluator
backend, the SQLite-persisted audit store + signed Merkle checkpoints, the
ops-recorder Python work-signal feed, and full replay reconstruction are **not**
built here. The TS package ships the fail-safe fallback that those pieces degrade
to when unavailable.
