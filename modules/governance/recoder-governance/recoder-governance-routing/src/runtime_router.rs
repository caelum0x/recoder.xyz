//! Runtime adapter preference per assurance tier (NEW — governance.md §3.4).
//!
//! Maps the resolved [`RiskTier`] to a preferred runtime adapter consumed by
//! `packages/agent-runtimes`. Higher tiers prefer the highest-assurance runtime.

use recoder_governance_types::RiskTier;

/// A runtime adapter preference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeAdapter {
    /// Generic / cheapest runtime (low-assurance work).
    Generic,
    /// Codex runtime (mid-assurance).
    Codex,
    /// Claude Code runtime (highest assurance).
    ClaudeCode,
}

impl RuntimeAdapter {
    /// The canonical adapter id string.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            RuntimeAdapter::Generic => "generic",
            RuntimeAdapter::Codex => "codex",
            RuntimeAdapter::ClaudeCode => "claude-code",
        }
    }
}

/// Select the preferred runtime adapter for an assurance tier.
#[must_use]
pub fn runtime_for_tier(tier: RiskTier) -> RuntimeAdapter {
    match tier {
        RiskTier::Low => RuntimeAdapter::Generic,
        RiskTier::Medium => RuntimeAdapter::Codex,
        RiskTier::High | RiskTier::Critical => RuntimeAdapter::ClaudeCode,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_tiers_to_runtimes() {
        assert_eq!(runtime_for_tier(RiskTier::Low), RuntimeAdapter::Generic);
        assert_eq!(runtime_for_tier(RiskTier::Medium), RuntimeAdapter::Codex);
        assert_eq!(runtime_for_tier(RiskTier::High), RuntimeAdapter::ClaudeCode);
        assert_eq!(
            runtime_for_tier(RiskTier::Critical),
            RuntimeAdapter::ClaudeCode
        );
    }

    #[test]
    fn adapter_strings() {
        assert_eq!(RuntimeAdapter::Generic.as_str(), "generic");
        assert_eq!(RuntimeAdapter::Codex.as_str(), "codex");
        assert_eq!(RuntimeAdapter::ClaudeCode.as_str(), "claude-code");
    }
}
