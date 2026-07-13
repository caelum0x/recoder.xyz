//! [`RiskTier`] — the canonical, totally-ordered risk classification used across
//! routing, approval, and enforcement.
//!
//! This mirrors `packages/governance/src/domain/risk-tier.ts`. The ordering is
//! load-bearing: a higher tier always subsumes the approval/enforcement
//! requirements of a lower one. Derived `PartialOrd`/`Ord` follow declaration
//! order, which is intentionally `Low < Medium < High < Critical`.

use crate::error::GovernanceTypeError;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// A totally-ordered risk tier. Serialized as a lowercase string to match the TS
/// mirror (`"low" | "medium" | "high" | "critical"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskTier {
    /// Routine, reversible, low-blast-radius actions.
    Low,
    /// Moderate-impact actions; may warrant logging or soft gates.
    Medium,
    /// High-impact actions; typically require approval.
    High,
    /// Maximum-severity actions (auth/billing/security/deploy boundaries).
    Critical,
}

impl RiskTier {
    /// All tiers in ascending severity order.
    pub const ALL: [RiskTier; 4] = [
        RiskTier::Low,
        RiskTier::Medium,
        RiskTier::High,
        RiskTier::Critical,
    ];

    /// The explicit ordinal rank (0..=3). Matches the TS `RISK_TIER_RANK` table.
    pub const fn rank(self) -> u8 {
        match self {
            RiskTier::Low => 0,
            RiskTier::Medium => 1,
            RiskTier::High => 2,
            RiskTier::Critical => 3,
        }
    }

    /// The canonical lowercase wire string.
    pub const fn as_str(self) -> &'static str {
        match self {
            RiskTier::Low => "low",
            RiskTier::Medium => "medium",
            RiskTier::High => "high",
            RiskTier::Critical => "critical",
        }
    }

    /// Returns the more severe of the two tiers (deny-biased toward higher risk).
    /// Mirrors TS `maxRiskTier`.
    pub fn max(self, other: RiskTier) -> RiskTier {
        if self.rank() >= other.rank() {
            self
        } else {
            other
        }
    }

    /// Clamp a tier to a ceiling. Mirrors TS `clampRiskTier`; used by the
    /// auto-approver tier-ceiling cap.
    pub fn clamp_to(self, ceiling: RiskTier) -> RiskTier {
        if self.rank() > ceiling.rank() {
            ceiling
        } else {
            self
        }
    }
}

impl std::fmt::Display for RiskTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for RiskTier {
    type Err = GovernanceTypeError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "low" => Ok(RiskTier::Low),
            "medium" => Ok(RiskTier::Medium),
            "high" => Ok(RiskTier::High),
            "critical" => Ok(RiskTier::Critical),
            other => Err(GovernanceTypeError::UnknownRiskTier(other.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_are_ascending_and_match_ts() {
        assert_eq!(RiskTier::Low.rank(), 0);
        assert_eq!(RiskTier::Medium.rank(), 1);
        assert_eq!(RiskTier::High.rank(), 2);
        assert_eq!(RiskTier::Critical.rank(), 3);
    }

    #[test]
    fn derived_ord_follows_severity() {
        assert!(RiskTier::Low < RiskTier::Medium);
        assert!(RiskTier::Medium < RiskTier::High);
        assert!(RiskTier::High < RiskTier::Critical);
        assert_eq!(
            RiskTier::ALL.iter().max().copied(),
            Some(RiskTier::Critical)
        );
    }

    #[test]
    fn max_is_deny_biased() {
        assert_eq!(RiskTier::Low.max(RiskTier::High), RiskTier::High);
        assert_eq!(RiskTier::Critical.max(RiskTier::Low), RiskTier::Critical);
        assert_eq!(RiskTier::Medium.max(RiskTier::Medium), RiskTier::Medium);
    }

    #[test]
    fn clamp_to_ceiling() {
        assert_eq!(
            RiskTier::Critical.clamp_to(RiskTier::Medium),
            RiskTier::Medium
        );
        assert_eq!(RiskTier::Low.clamp_to(RiskTier::High), RiskTier::Low);
    }

    #[test]
    fn parse_and_display_roundtrip() {
        for tier in RiskTier::ALL {
            assert_eq!(tier.to_string().parse::<RiskTier>().unwrap(), tier);
        }
        assert_eq!(
            "bogus".parse::<RiskTier>().unwrap_err(),
            GovernanceTypeError::UnknownRiskTier("bogus".to_string())
        );
    }

    #[test]
    fn serializes_as_lowercase_string() {
        let json = serde_json::to_string(&RiskTier::Critical).unwrap();
        assert_eq!(json, "\"critical\"");
        let back: RiskTier = serde_json::from_str("\"high\"").unwrap();
        assert_eq!(back, RiskTier::High);
    }
}
