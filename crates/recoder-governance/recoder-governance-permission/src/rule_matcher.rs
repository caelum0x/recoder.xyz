//! Rule-content parsing helpers (merged from claw `permissions.rs`).
//!
//! These functions handle the escaping rules of the `tool(subject)` rule syntax
//! and the JSON subject extraction used to match a rule against a tool input.

use serde_json::Value;

/// Unescape `\(`, `\)`, and `\\` inside rule content.
#[must_use]
pub fn unescape_rule_content(content: &str) -> String {
    content
        .replace(r"\(", "(")
        .replace(r"\)", ")")
        .replace(r"\\", r"\")
}

/// Find the first `needle` that is not backslash-escaped.
#[must_use]
pub fn find_first_unescaped(value: &str, needle: char) -> Option<usize> {
    let mut escaped = false;
    for (idx, ch) in value.char_indices() {
        if ch == '\\' {
            escaped = !escaped;
            continue;
        }
        if ch == needle && !escaped {
            return Some(idx);
        }
        escaped = false;
    }
    None
}

/// Find the last `needle` that is not backslash-escaped.
#[must_use]
pub fn find_last_unescaped(value: &str, needle: char) -> Option<usize> {
    let chars = value.char_indices().collect::<Vec<_>>();
    for (pos, (idx, ch)) in chars.iter().enumerate().rev() {
        if *ch != needle {
            continue;
        }
        let mut backslashes = 0;
        for (_, prev) in chars[..pos].iter().rev() {
            if *prev == '\\' {
                backslashes += 1;
            } else {
                break;
            }
        }
        if backslashes % 2 == 0 {
            return Some(*idx);
        }
    }
    None
}

/// Extract the subject string a permission rule matches against.
///
/// If the input is a JSON object, the first present well-known key
/// (`command`, `path`, `file_path`, `url`, ...) is used. Otherwise the raw
/// non-empty input is used verbatim.
#[must_use]
pub fn extract_permission_subject(input: &str) -> Option<String> {
    if let Ok(Value::Object(object)) = serde_json::from_str::<Value>(input) {
        for key in [
            "command",
            "path",
            "file_path",
            "filePath",
            "notebook_path",
            "notebookPath",
            "url",
            "pattern",
            "code",
            "message",
        ] {
            if let Some(value) = object.get(key).and_then(Value::as_str) {
                return Some(value.to_string());
            }
        }
    }

    (!input.trim().is_empty()).then(|| input.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unescapes_parens_and_backslash() {
        assert_eq!(unescape_rule_content(r"a\(b\)c"), "a(b)c");
        assert_eq!(unescape_rule_content(r"x\\y"), r"x\y");
    }

    #[test]
    fn finds_unescaped_parens() {
        assert_eq!(find_first_unescaped("bash(git:*)", '('), Some(4));
        assert_eq!(find_last_unescaped("bash(git:*)", ')'), Some(10));
        // Escaped paren is skipped.
        assert_eq!(find_first_unescaped(r"a\(b(c", '('), Some(4));
    }

    #[test]
    fn extracts_subject_from_json_command() {
        assert_eq!(
            extract_permission_subject(r#"{"command":"git status"}"#),
            Some("git status".to_string())
        );
        assert_eq!(
            extract_permission_subject(r#"{"file_path":"/a/b"}"#),
            Some("/a/b".to_string())
        );
    }

    #[test]
    fn falls_back_to_raw_input() {
        assert_eq!(
            extract_permission_subject("plain text"),
            Some("plain text".to_string())
        );
        assert_eq!(extract_permission_subject("   "), None);
        // JSON object without a known key falls back to raw.
        assert_eq!(
            extract_permission_subject(r#"{"other":"x"}"#),
            Some(r#"{"other":"x"}"#.to_string())
        );
    }
}
