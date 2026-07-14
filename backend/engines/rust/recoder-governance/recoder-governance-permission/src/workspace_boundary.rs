//! Workspace-boundary containment (merged from claw `permission_enforcer.rs`).
//!
//! A `WorkspaceWrite` agent may only write inside the workspace root. The check
//! is a normalized prefix containment that defends against the classic
//! `/workspace` vs `/workspacex` prefix-confusion bug by always comparing
//! against a root that ends in `/`.

/// Whether `path` is contained within `workspace_root`.
///
/// Relative paths are resolved against the root. A path equal to the root
/// itself counts as inside. A sibling directory that merely shares a string
/// prefix (e.g. `/workspacex`) is correctly rejected.
#[must_use]
pub fn is_within_workspace(path: &str, workspace_root: &str) -> bool {
    let normalized = if path.starts_with('/') {
        path.to_owned()
    } else {
        format!("{workspace_root}/{path}")
    };

    let root = if workspace_root.ends_with('/') {
        workspace_root.to_owned()
    } else {
        format!("{workspace_root}/")
    };

    normalized.starts_with(&root) || normalized == workspace_root.trim_end_matches('/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_inside_workspace() {
        assert!(is_within_workspace("/workspace/src/main.rs", "/workspace"));
        assert!(is_within_workspace("/workspace", "/workspace"));
    }

    #[test]
    fn paths_outside_workspace() {
        assert!(!is_within_workspace("/etc/passwd", "/workspace"));
    }

    #[test]
    fn rejects_prefix_confusion() {
        // /workspacex must NOT count as inside /workspace.
        assert!(!is_within_workspace("/workspacex/hack", "/workspace"));
    }

    #[test]
    fn relative_paths_resolve_against_root() {
        assert!(is_within_workspace("src/main.rs", "/workspace"));
    }

    #[test]
    fn trailing_slash_root() {
        assert!(is_within_workspace("/workspace/src/main.rs", "/workspace/"));
        assert!(is_within_workspace("/workspace", "/workspace/"));
    }
}
