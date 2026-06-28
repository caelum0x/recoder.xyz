//! Autonomous-mode auto-approval with a tier ceiling.
//!
//! Honors [`ApprovalPolicy::auto_approve`] / [`ApprovalPolicy::auto_approve_autonomous`]
//! but never auto-approves above the configured
//! [`ApprovalPolicy::auto_approve_ceiling`] — e.g. `critical` actions always
//! require a human even in autonomous mode.

use recoder_governance_types::{ApprovalPolicy, RiskTier};

/// Decide whether an action at `tier` may be auto-approved under `policy`.
///
/// Returns `true` only when auto-approval is enabled (globally or autonomous)
/// **and** `tier` is at or below the policy's ceiling. The comparison is
/// deny-biased: anything above the ceiling is never auto-approved.
#[must_use]
pub fn can_auto_approve(policy: &ApprovalPolicy, tier: RiskTier) -> bool {
    let enabled = policy.auto_approve || policy.auto_approve_autonomous;
    enabled && tier.rank() <= policy.auto_approve_ceiling.rank()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(auto: bool, autonomous: bool, ceiling: RiskTier) -> ApprovalPolicy {
        ApprovalPolicy {
            auto_approve: auto,
            auto_approve_autonomous: autonomous,
            auto_approve_ceiling: ceiling,
            ..Default::default()
        }
    }

    #[test]
    fn disabled_never_approves() {
        let p = policy(false, false, RiskTier::Critical);
        assert!(!can_auto_approve(&p, RiskTier::Low));
    }

    #[test]
    fn autonomous_approves_up_to_ceiling() {
        let p = policy(false, true, RiskTier::Medium);
        assert!(can_auto_approve(&p, RiskTier::Low));
        assert!(can_auto_approve(&p, RiskTier::Medium));
        assert!(!can_auto_approve(&p, RiskTier::High));
        assert!(!can_auto_approve(&p, RiskTier::Critical));
    }

    #[test]
    fn global_auto_approve_respects_ceiling() {
        let p = policy(true, false, RiskTier::High);
        assert!(can_auto_approve(&p, RiskTier::High));
        // Critical is always above any sub-critical ceiling.
        assert!(!can_auto_approve(&p, RiskTier::Critical));
    }

    #[test]
    fn critical_ceiling_allows_everything_when_enabled() {
        let p = policy(true, false, RiskTier::Critical);
        for tier in RiskTier::ALL {
            assert!(can_auto_approve(&p, tier));
        }
    }
}
