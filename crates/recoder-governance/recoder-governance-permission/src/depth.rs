//! Subagent depth restrictions (merged from openfang `tool_policy.rs`).
//!
//! Top-level agents (`depth == 0`) are unrestricted. Subagents lose admin /
//! scheduling tools, and leaf subagents additionally lose the ability to spawn
//! deeper chains.

/// Tools denied to ALL subagents (`depth > 0`). Admin/scheduling tools that
/// should only be invoked by a top-level agent.
const SUBAGENT_DENY_ALWAYS: &[&str] = &[
    "cron_create",
    "cron_cancel",
    "schedule_create",
    "schedule_delete",
    "hand_activate",
    "hand_deactivate",
    "process_start",
];

/// Tools denied to leaf subagents (`depth >= max_depth - 1`). Prevents
/// unbounded spawn chains.
const SUBAGENT_DENY_LEAF: &[&str] = &["agent_spawn", "agent_kill"];

/// Whether a tool name spawns/calls a subagent (used for the depth ceiling in
/// [`crate::tool_policy::resolve_tool_access`]).
#[must_use]
pub fn is_subagent_tool(name: &str) -> bool {
    name == "agent_spawn" || name == "agent_call" || name == "spawn_agent"
}

/// Filter a list of tools based on the current agent depth.
///
/// - `depth == 0`: no restrictions (top-level agent).
/// - `depth > 0`: strips [`SUBAGENT_DENY_ALWAYS`] tools.
/// - `depth >= max_depth - 1`: additionally strips [`SUBAGENT_DENY_LEAF`] tools.
#[must_use]
pub fn filter_tools_by_depth(tools: &[String], depth: u32, max_depth: u32) -> Vec<String> {
    if depth == 0 {
        return tools.to_vec();
    }

    let is_leaf = max_depth > 0 && depth >= max_depth.saturating_sub(1);

    tools
        .iter()
        .filter(|name| {
            let n = name.as_str();
            if SUBAGENT_DENY_ALWAYS.contains(&n) {
                return false;
            }
            if is_leaf && SUBAGENT_DENY_LEAF.contains(&n) {
                return false;
            }
            true
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tools(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn depth_0_allows_all() {
        let t = tools(&["cron_create", "agent_spawn", "web_search", "file_read"]);
        assert_eq!(filter_tools_by_depth(&t, 0, 5).len(), 4);
    }

    #[test]
    fn depth_1_denies_admin_tools() {
        let t = tools(&[
            "cron_create",
            "cron_cancel",
            "schedule_create",
            "schedule_delete",
            "hand_activate",
            "hand_deactivate",
            "process_start",
            "web_search",
            "file_read",
            "agent_spawn",
        ]);
        let filtered = filter_tools_by_depth(&t, 1, 5);
        // Keeps non-admin tools, including agent_spawn (not leaf at depth 1).
        assert_eq!(filtered.len(), 3);
        assert!(filtered.contains(&"web_search".to_string()));
        assert!(filtered.contains(&"file_read".to_string()));
        assert!(filtered.contains(&"agent_spawn".to_string()));
    }

    #[test]
    fn leaf_depth_denies_spawn() {
        let t = tools(&["agent_spawn", "agent_kill", "web_search", "file_read"]);
        // max_depth=5, depth=4 -> leaf (4 >= 5-1).
        let filtered = filter_tools_by_depth(&t, 4, 5);
        assert_eq!(filtered.len(), 2);
        assert!(!filtered.contains(&"agent_spawn".to_string()));
        assert!(!filtered.contains(&"agent_kill".to_string()));
    }

    #[test]
    fn preserves_unknown_tools() {
        let t = tools(&["custom_tool", "mcp_github_create"]);
        assert_eq!(filter_tools_by_depth(&t, 3, 5).len(), 2);
    }

    #[test]
    fn empty_list() {
        let t: Vec<String> = vec![];
        assert!(filter_tools_by_depth(&t, 2, 5).is_empty());
    }

    #[test]
    fn subagent_tool_detection() {
        assert!(is_subagent_tool("agent_spawn"));
        assert!(is_subagent_tool("agent_call"));
        assert!(is_subagent_tool("spawn_agent"));
        assert!(!is_subagent_tool("file_read"));
    }
}
