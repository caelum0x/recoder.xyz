# recoder-governance (Rust kernel — first slice)

The deep (Rust) tier under the already-shipped TypeScript governance facade in
`packages/governance`.

This is a **small standalone cargo workspace** — intentionally **not** inside the
gitignored vendored clones (`crates/openfang`, `crates/claw-code-parity`). It is
first-party, owned Recoder code.

## What's in this slice

The highest-value self-contained piece: the **tamper-evident audit chain**.

| Crate | Purpose |
|---|---|
| `recoder-governance-types` | Shared domain types: `RiskTier` (ordered enum), `AuditAction` (string-valued enum), `AuditEntry` / `AuditInput` / `AuditOutcome` (+ serde), `GovernanceTypeError`. |
| `recoder-governance-audit`  | SHA-256 Merkle hash-chain audit log fused from `openfang-runtime/src/audit.rs`, canonicalized to be **byte-interoperable** with the TS verifier. `chain.rs` / `entry.rs` / `hashing.rs` / `verify.rs`. |

## Design properties

- **Pure & deterministic.** Unlike the openfang original, the chain has no
  `Mutex`, no SQLite, no `tracing`. The clock is injected (each `AuditInput`
  carries its own `timestamp`) and the sequence number is the chain index, so
  the same code runs identically on either side of the IPC boundary and is
  trivially testable.
- **Tamper-evident.** Each entry stores `sha256(content ‖ prev_hash)`. Any edit
  to a past entry invalidates every subsequent hash; `verify_integrity` walks the
  chain and reports the **exact broken `seq`**.
- **Range proofs.** `range_proof(from, to)` anchors a contiguous range to genesis
  by re-verifying the prefix `[0, from)`, then validates the range links.
- **Deny-biased.** Any anomaly (sequence gap, broken link, hash mismatch) fails
  the whole verification.

## Cross-language interop contract (load-bearing)

The hash pre-image **must** match `packages/governance/src/audit/merkle-verifier.ts`
exactly. Fields are joined by a single ASCII space in this order:

```text
sha256( seq " " timestamp " " actor " " action " " detail " " outcome " " prevHash )
```

- `seq` is decimal; `action`/`outcome` use their dotted/snake wire strings
  (e.g. `policy.evaluated`, `needs_approval`); genesis `prevHash` is 64 `'0'`s.
- `tests/ts_interop.rs` pins a **golden hash vector produced by the actual TS
  algorithm** (via `node:crypto`). If the Rust hashing ever diverges from TS,
  that test fails — the two chains would no longer be interoperable.

## Verify

```bash
cd crates/recoder-governance
cargo fmt --check
cargo clippy --workspace --all-targets
cargo check --workspace
cargo test --workspace
```

Disk-aware: the dependency surface is intentionally tiny — `sha2`, `hex`,
`thiserror`, `serde`/`serde_json` only. No async runtime, no heavy crates.

## Not yet built (future slices)

`recoder-governance-permission`, `-approval`, `-routing`, `-kernel`, persistence,
checkpoints, replay, and the typed IPC/FFI daemon boundary.
