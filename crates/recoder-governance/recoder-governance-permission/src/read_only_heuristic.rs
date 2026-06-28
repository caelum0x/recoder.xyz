//! Read-only bash heuristic (merged from claw `permission_enforcer.rs`).
//!
//! Conservative, deny-biased: a command is treated as read-only only if its
//! first token is a known read-only program AND it contains no in-place /
//! redirect markers. Anything ambiguous is treated as NOT read-only.

/// Programs that, invoked plainly, do not modify workspace state.
const READ_ONLY_COMMANDS: &[&str] = &[
    "cat",
    "head",
    "tail",
    "less",
    "more",
    "wc",
    "ls",
    "find",
    "grep",
    "rg",
    "awk",
    "sed",
    "echo",
    "printf",
    "which",
    "where",
    "whoami",
    "pwd",
    "env",
    "printenv",
    "date",
    "cal",
    "df",
    "du",
    "free",
    "uptime",
    "uname",
    "file",
    "stat",
    "diff",
    "sort",
    "uniq",
    "tr",
    "cut",
    "paste",
    "tee",
    "xargs",
    "test",
    "true",
    "false",
    "type",
    "readlink",
    "realpath",
    "basename",
    "dirname",
    "sha256sum",
    "md5sum",
    "b3sum",
    "xxd",
    "hexdump",
    "od",
    "strings",
    "tree",
    "jq",
    "yq",
    "python3",
    "python",
    "node",
    "ruby",
    "cargo",
    "rustc",
    "git",
    "gh",
];

/// Conservative heuristic: is this bash command read-only?
///
/// Returns `false` for an empty command, an unknown program, or a command that
/// contains an in-place flag (`-i `, `--in-place`) or a redirect (`>`/`>>`).
#[must_use]
pub fn is_read_only_command(command: &str) -> bool {
    let first_token = command
        .split_whitespace()
        .next()
        .unwrap_or("")
        .rsplit('/')
        .next()
        .unwrap_or("");

    READ_ONLY_COMMANDS.contains(&first_token)
        && !command.contains("-i ")
        && !command.contains("--in-place")
        && !command.contains(" > ")
        && !command.contains(" >> ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_commands_are_read_only() {
        assert!(is_read_only_command("cat file.txt"));
        assert!(is_read_only_command("grep pattern file"));
        assert!(is_read_only_command("git log --oneline"));
        assert!(is_read_only_command("ls -la"));
    }

    #[test]
    fn write_commands_are_not_read_only() {
        assert!(!is_read_only_command("rm file.txt"));
        assert!(!is_read_only_command("mkdir new"));
        assert!(!is_read_only_command("curl http://x"));
    }

    #[test]
    fn redirects_block_read_only() {
        assert!(!is_read_only_command("cat Cargo.toml > out.txt"));
        assert!(!is_read_only_command("echo test >> out.txt"));
    }

    #[test]
    fn in_place_flags_block_read_only() {
        assert!(!is_read_only_command("sed -i 's/a/b/' file"));
        assert!(!is_read_only_command("sed --in-place 's/a/b/' file.txt"));
        assert!(!is_read_only_command("python -i script.py"));
    }

    #[test]
    fn full_path_prefix_is_stripped() {
        assert!(is_read_only_command("/usr/bin/cat Cargo.toml"));
        assert!(is_read_only_command("/usr/local/bin/git status"));
    }

    #[test]
    fn empty_command_is_not_read_only() {
        assert!(!is_read_only_command(""));
        assert!(!is_read_only_command("   "));
    }
}
