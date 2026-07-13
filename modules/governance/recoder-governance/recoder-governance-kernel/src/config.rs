//! [`GovernanceKernelConfig`] — the kernel's load/validate/hot-reload config.
//!
//! Every field carries a `#[serde(default)]` so a partial config (or none at
//! all) still produces a coherent, deny-biased kernel. Validation rejects
//! incoherent values (e.g. inverted routing thresholds) up front; the pipeline
//! never runs on an invalid config.

use crate::error::GovernanceKernelError;
use recoder_governance_routing::ModelRoutingConfig;
use recoder_governance_types::{ApprovalPolicy, RiskTier};
use serde::{Deserialize, Serialize};

/// Default forbidden-path fragments. A write whose target contains any of these
/// is denied outright (auth/billing/security boundaries — see the repo policy).
fn default_forbidden_paths() -> Vec<String> {
    vec![
        "auth".to_string(),
        "billing".to_string(),
        "security".to_string(),
        ".env".to_string(),
        "credentials".to_string(),
    ]
}

/// Default secret-path fragments. Any action touching one of these is treated as
/// secret access and routed to the highest tier / approval.
fn default_secret_paths() -> Vec<String> {
    vec![
        "secret".to_string(),
        "token".to_string(),
        "password".to_string(),
        "private_key".to_string(),
        "id_rsa".to_string(),
    ]
}

/// Default minimum tier that forces human approval. Actions resolving to this
/// tier or higher need approval.
const fn default_approval_tier() -> RiskTier {
    RiskTier::High
}

/// The kernel configuration. All fields default; the whole struct is
/// `#[serde(default)]` so an empty document deserializes to a safe default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct GovernanceKernelConfig {
    /// Path fragments that may never be written (deny-wins).
    pub forbidden_paths: Vec<String>,
    /// Path/tool fragments treated as secret access (force high tier + approval).
    pub secret_paths: Vec<String>,
    /// Tools that always require approval (seeds the approval policy).
    pub approval_policy: ApprovalPolicy,
    /// Model routing thresholds + model names.
    pub routing: ModelRoutingConfig,
    /// The minimum resolved tier that forces human approval.
    pub approval_tier: RiskTier,
}

impl Default for GovernanceKernelConfig {
    fn default() -> Self {
        Self {
            forbidden_paths: default_forbidden_paths(),
            secret_paths: default_secret_paths(),
            approval_policy: ApprovalPolicy::default(),
            routing: ModelRoutingConfig::default(),
            approval_tier: default_approval_tier(),
        }
    }
}

impl GovernanceKernelConfig {
    /// Validate the config, rejecting incoherent values. Called by the kernel
    /// constructor and on every hot-reload; a fault never reaches the pipeline.
    pub fn validate(&self) -> Result<(), GovernanceKernelError> {
        self.routing
            .validate()
            .map_err(GovernanceKernelError::InvalidConfig)?;
        self.approval_policy
            .validate()
            .map_err(GovernanceKernelError::InvalidConfig)?;
        Ok(())
    }

    /// Whether `target` matches a forbidden-path fragment (case-insensitive).
    #[must_use]
    pub fn is_forbidden_path(&self, target: &str) -> bool {
        let lower = target.to_ascii_lowercase();
        self.forbidden_paths
            .iter()
            .any(|fragment| lower.contains(&fragment.to_ascii_lowercase()))
    }

    /// Whether `target` matches a secret-path fragment (case-insensitive).
    #[must_use]
    pub fn is_secret_path(&self, target: &str) -> bool {
        let lower = target.to_ascii_lowercase();
        self.secret_paths
            .iter()
            .any(|fragment| lower.contains(&fragment.to_ascii_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_valid() {
        assert!(GovernanceKernelConfig::default().validate().is_ok());
    }

    #[test]
    fn empty_json_deserializes_to_default() {
        let cfg: GovernanceKernelConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(cfg, GovernanceKernelConfig::default());
    }

    #[test]
    fn forbidden_path_detection_is_case_insensitive() {
        let cfg = GovernanceKernelConfig::default();
        assert!(cfg.is_forbidden_path("src/AUTH/session.ts"));
        assert!(cfg.is_forbidden_path("packages/billing/stripe.ts"));
        assert!(!cfg.is_forbidden_path("src/components/Button.tsx"));
    }

    #[test]
    fn secret_path_detection() {
        let cfg = GovernanceKernelConfig::default();
        assert!(cfg.is_secret_path("/home/user/.ssh/id_rsa"));
        assert!(cfg.is_secret_path("config/SECRET_token.json"));
        assert!(!cfg.is_secret_path("README.md"));
    }

    #[test]
    fn inverted_routing_thresholds_rejected() {
        let mut cfg = GovernanceKernelConfig::default();
        cfg.routing.simple_threshold = 900;
        cfg.routing.complex_threshold = 100;
        assert!(matches!(
            cfg.validate(),
            Err(GovernanceKernelError::InvalidConfig(_))
        ));
    }
}
