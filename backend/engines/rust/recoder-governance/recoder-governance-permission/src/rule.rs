//! Permission rule parsing (merged from claw `permissions.rs`).
//!
//! A rule is written as `tool(subject)`, where `subject` is one of:
//! - empty or `*` -> [`PermissionRuleMatcher::Any`] (matches any input)
//! - `prefix:*`   -> [`PermissionRuleMatcher::Prefix`] (subject starts-with prefix)
//! - anything else -> [`PermissionRuleMatcher::Exact`] (subject equals it)
//!
//! A bare `tool` (no parens) is equivalent to `tool(*)`.

use crate::rule_matcher::{
    extract_permission_subject, find_first_unescaped, find_last_unescaped, unescape_rule_content,
};

/// How a [`PermissionRule`] matches the extracted subject of a tool input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionRuleMatcher {
    /// Matches any input for the tool.
    Any,
    /// Matches when the subject equals the stored string.
    Exact(String),
    /// Matches when the subject starts with the stored prefix.
    Prefix(String),
}

/// A parsed permission rule bound to a single tool name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionRule {
    raw: String,
    tool_name: String,
    matcher: PermissionRuleMatcher,
}

impl PermissionRule {
    /// Parse a raw rule string (`tool(subject)` or bare `tool`).
    #[must_use]
    pub fn parse(raw: &str) -> Self {
        let trimmed = raw.trim();
        let open = find_first_unescaped(trimmed, '(');
        let close = find_last_unescaped(trimmed, ')');

        if let (Some(open), Some(close)) = (open, close) {
            if close == trimmed.len() - 1 && open < close {
                let tool_name = trimmed[..open].trim();
                let content = &trimmed[open + 1..close];
                if !tool_name.is_empty() {
                    return Self {
                        raw: trimmed.to_string(),
                        tool_name: tool_name.to_string(),
                        matcher: parse_rule_matcher(content),
                    };
                }
            }
        }

        Self {
            raw: trimmed.to_string(),
            tool_name: trimmed.to_string(),
            matcher: PermissionRuleMatcher::Any,
        }
    }

    /// The original (trimmed) rule string, used in deny/ask reasons.
    #[must_use]
    pub fn raw(&self) -> &str {
        &self.raw
    }

    /// The tool name this rule applies to.
    #[must_use]
    pub fn tool_name(&self) -> &str {
        &self.tool_name
    }

    /// The matcher classification.
    #[must_use]
    pub fn matcher(&self) -> &PermissionRuleMatcher {
        &self.matcher
    }

    /// Whether this rule matches a `(tool_name, input)` pair.
    #[must_use]
    pub fn matches(&self, tool_name: &str, input: &str) -> bool {
        if self.tool_name != tool_name {
            return false;
        }

        match &self.matcher {
            PermissionRuleMatcher::Any => true,
            PermissionRuleMatcher::Exact(expected) => {
                extract_permission_subject(input).is_some_and(|candidate| candidate == *expected)
            }
            PermissionRuleMatcher::Prefix(prefix) => extract_permission_subject(input)
                .is_some_and(|candidate| candidate.starts_with(prefix)),
        }
    }
}

/// Classify the content inside `tool(...)` into a matcher.
fn parse_rule_matcher(content: &str) -> PermissionRuleMatcher {
    let unescaped = unescape_rule_content(content.trim());
    if unescaped.is_empty() || unescaped == "*" {
        PermissionRuleMatcher::Any
    } else if let Some(prefix) = unescaped.strip_suffix(":*") {
        PermissionRuleMatcher::Prefix(prefix.to_string())
    } else {
        PermissionRuleMatcher::Exact(unescaped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_any_matcher() {
        assert_eq!(
            PermissionRule::parse("bash").matcher(),
            &PermissionRuleMatcher::Any
        );
        assert_eq!(
            PermissionRule::parse("bash(*)").matcher(),
            &PermissionRuleMatcher::Any
        );
        assert_eq!(
            PermissionRule::parse("bash()").matcher(),
            &PermissionRuleMatcher::Any
        );
    }

    #[test]
    fn parses_prefix_matcher() {
        let rule = PermissionRule::parse("bash(git:*)");
        assert_eq!(rule.tool_name(), "bash");
        assert_eq!(
            rule.matcher(),
            &PermissionRuleMatcher::Prefix("git".to_string())
        );
    }

    #[test]
    fn parses_exact_matcher() {
        let rule = PermissionRule::parse("bash(git status)");
        assert_eq!(
            rule.matcher(),
            &PermissionRuleMatcher::Exact("git status".to_string())
        );
    }

    #[test]
    fn matches_prefix_against_json_command() {
        let rule = PermissionRule::parse("bash(git:*)");
        assert!(rule.matches("bash", r#"{"command":"git status"}"#));
        assert!(!rule.matches("bash", r#"{"command":"rm -rf /"}"#));
        // Different tool name does not match.
        assert!(!rule.matches("python", r#"{"command":"git status"}"#));
    }

    #[test]
    fn exact_matcher_requires_full_equality() {
        let rule = PermissionRule::parse("bash(git status)");
        assert!(rule.matches("bash", r#"{"command":"git status"}"#));
        assert!(!rule.matches("bash", r#"{"command":"git status -s"}"#));
    }

    #[test]
    fn handles_escaped_parens_in_tool_name() {
        // A bare token with no terminal close-paren falls back to Any on the
        // whole string as the tool name.
        let rule = PermissionRule::parse("weird(name");
        assert_eq!(rule.matcher(), &PermissionRuleMatcher::Any);
        assert_eq!(rule.tool_name(), "weird(name");
    }
}
