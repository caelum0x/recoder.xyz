//! Hand-rolled glob matcher (merged from openfang `tool_policy.rs`).
//!
//! Intentionally tiny — no `globset`/`regex` dependency. Supports `*` as a
//! wildcard that matches any sequence of characters (including empty). This is
//! sufficient for tool-name patterns like `shell_*`, `mcp_*_list`, `*`.

/// Match `text` against a `*`-glob `pattern`.
///
/// - `"*"` matches anything.
/// - A pattern with no `*` must match exactly.
/// - `"prefix_*"` / `"*_suffix"` / `"a_*_b"` are matched greedily left-to-right.
#[must_use]
pub fn glob_match(pattern: &str, text: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if !pattern.contains('*') {
        return pattern == text;
    }

    let parts: Vec<&str> = pattern.split('*').collect();

    if parts.len() == 2 {
        // Simple prefix/suffix match.
        let prefix = parts[0];
        let suffix = parts[1];
        return text.starts_with(prefix)
            && text.ends_with(suffix)
            && text.len() >= prefix.len() + suffix.len();
    }

    // General glob: greedy left-to-right matching.
    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            // Must match prefix.
            if !text.starts_with(part) {
                return false;
            }
            pos = part.len();
        } else if i == parts.len() - 1 {
            // Must match suffix.
            if !text[pos..].ends_with(part) {
                return false;
            }
        } else {
            // Must find in remaining text.
            match text[pos..].find(part) {
                Some(found) => pos = pos + found + part.len(),
                None => return false,
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        assert!(glob_match("shell_exec", "shell_exec"));
        assert!(!glob_match("shell_exec", "web_search"));
    }

    #[test]
    fn star_matches_everything() {
        assert!(glob_match("*", "anything"));
        assert!(glob_match("*", ""));
    }

    #[test]
    fn prefix_wildcard() {
        assert!(glob_match("shell_*", "shell_exec"));
        assert!(glob_match("shell_*", "shell_write"));
        assert!(!glob_match("shell_*", "web_search"));
    }

    #[test]
    fn prefix_and_suffix() {
        assert!(glob_match("mcp_*_list", "mcp_github_list"));
        assert!(!glob_match("mcp_*_list", "mcp_github_create"));
    }

    #[test]
    fn empty_wildcard_segment() {
        // "shell_*" must still require the prefix even for the empty match.
        assert!(glob_match("shell_*", "shell_"));
        assert!(!glob_match("shell_*", "shel"));
    }
}
