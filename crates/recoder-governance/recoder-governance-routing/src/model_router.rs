//! Model router (merged from openfang `routing.rs`).
//!
//! Classifies a [`ScoringInput`] into a [`TaskComplexity`] tier via [`score_raw`]
//! and the configured thresholds, then selects the cheapest model that can
//! handle the task.

use crate::complexity::{score_raw, ScoringInput, TaskComplexity};
use serde::{Deserialize, Serialize};

/// Model routing configuration: per-tier model names and the score thresholds
/// that separate the tiers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ModelRoutingConfig {
    /// Model used for [`TaskComplexity::Simple`].
    pub simple_model: String,
    /// Model used for [`TaskComplexity::Medium`].
    pub medium_model: String,
    /// Model used for [`TaskComplexity::Complex`].
    pub complex_model: String,
    /// Scores below this are [`TaskComplexity::Simple`].
    pub simple_threshold: u32,
    /// Scores at or above this are [`TaskComplexity::Complex`].
    pub complex_threshold: u32,
}

impl Default for ModelRoutingConfig {
    fn default() -> Self {
        Self {
            simple_model: "haiku".to_string(),
            medium_model: "sonnet".to_string(),
            complex_model: "opus".to_string(),
            simple_threshold: 200,
            complex_threshold: 800,
        }
    }
}

impl ModelRoutingConfig {
    /// Validate that the thresholds are coherent (`simple < complex`).
    pub fn validate(&self) -> Result<(), String> {
        if self.simple_threshold >= self.complex_threshold {
            return Err(format!(
                "simple_threshold ({}) must be < complex_threshold ({})",
                self.simple_threshold, self.complex_threshold
            ));
        }
        Ok(())
    }
}

/// Selects a model by scored query complexity.
#[derive(Debug, Clone)]
pub struct ModelRouter {
    config: ModelRoutingConfig,
}

impl ModelRouter {
    /// Create a router from a routing config.
    #[must_use]
    pub fn new(config: ModelRoutingConfig) -> Self {
        Self { config }
    }

    /// The routing config.
    #[must_use]
    pub fn config(&self) -> &ModelRoutingConfig {
        &self.config
    }

    /// Score an input and classify it into a complexity tier.
    #[must_use]
    pub fn score(&self, input: &ScoringInput) -> TaskComplexity {
        let score = score_raw(input);
        if score < self.config.simple_threshold {
            TaskComplexity::Simple
        } else if score >= self.config.complex_threshold {
            TaskComplexity::Complex
        } else {
            TaskComplexity::Medium
        }
    }

    /// The model name for a complexity tier.
    #[must_use]
    pub fn model_for_complexity(&self, complexity: TaskComplexity) -> &str {
        match complexity {
            TaskComplexity::Simple => &self.config.simple_model,
            TaskComplexity::Medium => &self.config.medium_model,
            TaskComplexity::Complex => &self.config.complex_model,
        }
    }

    /// Score an input and return the selected model name + complexity.
    #[must_use]
    pub fn select_model(&self, input: &ScoringInput) -> (TaskComplexity, String) {
        let complexity = self.score(input);
        let model = self.model_for_complexity(complexity).to_string();
        (complexity, model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> ModelRoutingConfig {
        ModelRoutingConfig {
            simple_model: "llama".to_string(),
            medium_model: "sonnet".to_string(),
            complex_model: "opus".to_string(),
            simple_threshold: 200,
            complex_threshold: 800,
        }
    }

    #[test]
    fn simple_greeting_routes_to_simple() {
        let router = ModelRouter::new(config());
        let (complexity, model) =
            router.select_model(&ScoringInput::from_messages(vec!["Hello!".to_string()]));
        assert_eq!(complexity, TaskComplexity::Simple);
        assert_eq!(model, "llama");
    }

    #[test]
    fn many_tools_route_higher() {
        let router = ModelRouter::new(config());
        // 15 tools * 20 = 300 -> at least Medium.
        let input = ScoringInput::from_messages(vec!["use tools".to_string()]).with_tools(15);
        assert_ne!(router.score(&input), TaskComplexity::Simple);
    }

    #[test]
    fn large_input_routes_complex() {
        let router = ModelRouter::new(config());
        // ~3600 chars / 4 = 900 >= 800 complex threshold.
        let input = ScoringInput::from_messages(vec!["a".repeat(3600)]);
        assert_eq!(router.score(&input), TaskComplexity::Complex);
    }

    #[test]
    fn model_for_each_tier() {
        let router = ModelRouter::new(config());
        assert_eq!(router.model_for_complexity(TaskComplexity::Simple), "llama");
        assert_eq!(
            router.model_for_complexity(TaskComplexity::Medium),
            "sonnet"
        );
        assert_eq!(router.model_for_complexity(TaskComplexity::Complex), "opus");
    }

    #[test]
    fn config_validates_thresholds() {
        assert!(config().validate().is_ok());
        let bad = ModelRoutingConfig {
            simple_threshold: 900,
            complex_threshold: 800,
            ..config()
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn config_roundtrips_with_serde_defaults() {
        let c: ModelRoutingConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(c, ModelRoutingConfig::default());
    }
}
