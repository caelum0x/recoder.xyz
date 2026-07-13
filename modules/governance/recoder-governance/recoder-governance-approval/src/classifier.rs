//! Risk classification (merged from openfang-kernel `approval.rs` `classify_risk`).
//!
//! Maps a tool name to a [`RiskLevel`] and (via the lossless 1:1 mapping in
//! `recoder-governance-types`) to a [`RiskTier`].

use recoder_governance_types::{RiskLevel, RiskTier};

/// Classify the risk level of a tool invocation.
///
/// Deny-biased defaults: anything not explicitly known is [`RiskLevel::Low`],
/// but the well-known dangerous tools are tagged at their real severity.
#[must_use]
pub fn classify_risk(tool_name: &str) -> RiskLevel {
    match tool_name {
        "shell_exec" => RiskLevel::Critical,
        "file_write" | "file_delete" => RiskLevel::High,
        "web_fetch" | "browser_navigate" => RiskLevel::Medium,
        _ => RiskLevel::Low,
    }
}

/// Classify a tool directly into the canonical [`RiskTier`].
#[must_use]
pub fn classify_tier(tool_name: &str) -> RiskTier {
    classify_risk(tool_name).to_tier()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_known_tools() {
        assert_eq!(classify_risk("shell_exec"), RiskLevel::Critical);
        assert_eq!(classify_risk("file_write"), RiskLevel::High);
        assert_eq!(classify_risk("file_delete"), RiskLevel::High);
        assert_eq!(classify_risk("web_fetch"), RiskLevel::Medium);
        assert_eq!(classify_risk("browser_navigate"), RiskLevel::Medium);
    }

    #[test]
    fn unknown_tools_are_low() {
        assert_eq!(classify_risk("file_read"), RiskLevel::Low);
        assert_eq!(classify_risk("custom_tool"), RiskLevel::Low);
    }

    #[test]
    fn tier_mapping_is_consistent() {
        assert_eq!(classify_tier("shell_exec"), RiskTier::Critical);
        assert_eq!(classify_tier("file_write"), RiskTier::High);
        assert_eq!(classify_tier("web_fetch"), RiskTier::Medium);
        assert_eq!(classify_tier("file_read"), RiskTier::Low);
    }
}
