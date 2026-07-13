//! `recoder-governance-audit` — the tamper-evident SHA-256 Merkle hash-chain
//! audit log, fused from `openfang-runtime/src/audit.rs` and canonicalized to be
//! byte-interoperable with the shipped TypeScript verifier in
//! `packages/governance/src/audit/merkle-verifier.ts`.
//!
//! ## Design
//!
//! Every auditable event is appended to an append-only log where each entry
//! holds the SHA-256 hash of its own canonical content concatenated with the
//! hash of the previous entry — a Merkle hash chain. Tampering with any entry
//! invalidates every hash from that point forward, so [`verify::verify_integrity`]
//! can detect it and report the exact broken sequence number.
//!
//! ## Purity / determinism
//!
//! Unlike the original openfang `AuditLog`, this implementation is **pure**: the
//! clock and sequence number are injected by the caller (via [`entry::AuditInput`]'s
//! `timestamp` and the chain's internal counter), there is no interior mutability
//! beyond an owned `Vec`, and no `Mutex`/SQLite/`tracing` coupling. That makes the
//! chain trivially testable and lets the same code run on either side of the IPC
//! boundary.
//!
//! ## Cross-language interop (critical)
//!
//! The hash pre-image is built in [`hashing::compute_entry_hash`] and **must**
//! match the TS verifier exactly:
//!
//! ```text
//! sha256( seq " " timestamp " " actor " " action " " detail " " outcome " " prevHash )
//! ```
//!
//! where fields are joined by a single ASCII space, `seq` is rendered in decimal,
//! `action`/`outcome` use their dotted/snake wire strings, and the genesis
//! `prevHash` is 64 ASCII `'0'` characters.
//!
//! ## Modules
//!
//! - [`hashing`] — the pre-image construction, genesis sentinel, and SHA-256.
//! - [`entry`] — re-exports the entry/input/action/outcome types and the sealing
//!   helper.
//! - [`chain`] — the append-only [`chain::AuditLog`].
//! - [`verify`] — [`verify::verify_integrity`], prefix/range proofs, and the
//!   [`verify::IntegrityReport`] result.

pub mod chain;
pub mod entry;
pub mod hashing;
pub mod verify;

pub use chain::AuditLog;
pub use entry::{seal_entry, AuditAction, AuditEntry, AuditInput, AuditOutcome};
pub use hashing::{compute_entry_hash, genesis_prev_hash, GENESIS_PREV_HASH};
pub use verify::{verify_integrity, verify_range, IntegrityReport, RangeProof};
