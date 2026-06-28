//! Cross-language interop golden vector.
//!
//! These expected hashes were produced by the *actual* TypeScript verifier
//! algorithm (`packages/governance/src/audit/merkle-verifier.ts`,
//! `computeEntryHash`) using `node:crypto`:
//!
//! ```js
//! const FIELD_SEP = ' ';
//! const preimage = [String(seq), timestamp, actor, action, detail, outcome, prevHash].join(FIELD_SEP);
//! createHash('sha256').update(preimage, 'utf8').digest('hex');
//! ```
//!
//! If the Rust hashing ever diverges from the TS verifier, this test fails — the
//! two implementations would no longer be interoperable.

use recoder_governance_audit::{verify_integrity, AuditAction, AuditInput, AuditLog, AuditOutcome};

/// The golden vector: SHA-256 hex of each of the three chained entries, computed
/// by the TS algorithm. Do not edit by hand — regenerate from the TS verifier.
const TS_GOLDEN_HASHES: [&str; 3] = [
    "dd81b90382a3701229a69f0bd8cee06914defc6616d299bd9102b47b40bb3f10",
    "57639c68318bda5a27843dee8bbe8ed3dc8a614f575e9e936ce08cb507c4ee12",
    "2cc658c2fcee4984ca92f45044bd77cfbbe358c86d694535be41bd9104bed7bb",
];

fn golden_inputs() -> Vec<AuditInput> {
    vec![
        AuditInput::new(
            "2026-06-28T00:00:00Z",
            "agent-1",
            AuditAction::PolicyEvaluated,
            "evaluate push to main",
            AuditOutcome::Allow,
        ),
        AuditInput::new(
            "2026-06-28T00:00:01Z",
            "agent-1",
            AuditAction::EnforcementChecked,
            "bash: ls -la",
            AuditOutcome::Allow,
        ),
        AuditInput::new(
            "2026-06-28T00:00:02Z",
            "agent-2",
            AuditAction::DecisionMade,
            "spawn helper",
            AuditOutcome::NeedsApproval,
        ),
    ]
}

#[test]
fn rust_chain_matches_ts_golden_hashes() {
    let mut log = AuditLog::new();
    for input in golden_inputs() {
        log.append(input);
    }

    assert_eq!(log.len(), 3);
    let entries = log.entries();
    for (i, expected) in TS_GOLDEN_HASHES.iter().enumerate() {
        assert_eq!(
            &entries[i].hash, expected,
            "entry {i} hash diverged from the TS verifier — chains are no longer interoperable"
        );
    }

    // The tip must equal the last TS golden hash.
    assert_eq!(log.tip_hash(), TS_GOLDEN_HASHES[2]);
    // And the full integrity walk must pass.
    assert!(verify_integrity(entries).is_ok());
}

#[test]
fn ts_golden_chain_is_internally_linked() {
    let mut log = AuditLog::new();
    for input in golden_inputs() {
        log.append(input);
    }
    let entries = log.entries();
    assert_eq!(entries[0].prev_hash, "0".repeat(64));
    assert_eq!(entries[1].prev_hash, TS_GOLDEN_HASHES[0]);
    assert_eq!(entries[2].prev_hash, TS_GOLDEN_HASHES[1]);
}
