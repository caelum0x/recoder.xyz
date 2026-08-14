use std::io;
use std::path::PathBuf;
#[cfg(test)]
use std::sync::{Mutex, MutexGuard, OnceLock};

use portable_pty::CommandBuilder;

pub(crate) const LOOM_PANE_ID_ENV_VAR: &str = "LOOM_PANE_ID";
pub(crate) const LOOM_TAB_ID_ENV_VAR: &str = "LOOM_TAB_ID";
pub(crate) const LOOM_WORKSPACE_ID_ENV_VAR: &str = "LOOM_WORKSPACE_ID";

pub(crate) const PI_CODING_AGENT_DIR_ENV_VAR: &str = "PI_CODING_AGENT_DIR";
pub(crate) const OMP_CONFIG_DIR_ENV_VAR: &str = "PI_CONFIG_DIR";
pub(crate) const CLAUDE_CONFIG_DIR_ENV_VAR: &str = "CLAUDE_CONFIG_DIR";
pub(crate) const CODEX_HOME_ENV_VAR: &str = "CODEX_HOME";
pub(crate) const KIMI_CODE_HOME_ENV_VAR: &str = "KIMI_CODE_HOME";
pub(crate) const COPILOT_HOME_ENV_VAR: &str = "COPILOT_HOME";
pub(crate) const QODERCLI_CONFIG_DIR_ENV_VAR: &str = "QODER_CONFIG_DIR";
pub(crate) const CURSOR_CONFIG_DIR_ENV_VAR: &str = "CURSOR_CONFIG_DIR";
pub(crate) const ANTIGRAVITY_CLI_CONFIG_DIR_ENV_VAR: &str = "ANTIGRAVITY_CLI_CONFIG_DIR";
pub(crate) const GROK_CONFIG_DIR_ENV_VAR: &str = "GROK_CONFIG_DIR";
/// The grok CLI's own config-home override (documented alongside
/// `$GROK_HOME/config.toml` and `$GROK_HOME/auth.json`).
pub(crate) const GROK_HOME_ENV_VAR: &str = "GROK_HOME";
pub(crate) const HERMES_HOME_ENV_VAR: &str = "HERMES_HOME";

/// Host-provided socket that a managed agent uses to reach the Recoder MCP
/// route. Sourced from Loom's own environment; never fabricated.
pub(crate) const RECODER_MCP_SOCKET_ENV_VAR: &str = "RECODER_MCP_SOCKET";
/// Per-pane capability token injected into a managed pane so the host can bind
/// the pane's MCP traffic to a single, unpredictable credential.
pub(crate) const RECODER_PANE_TOKEN_ENV_VAR: &str = "RECODER_PANE_TOKEN";

/// Bytes of OS CSPRNG entropy behind a per-pane capability token. 32 bytes is
/// 256 bits, rendered as 64 lowercase hex characters.
const PANE_CAPABILITY_TOKEN_BYTES: usize = 32;

pub(crate) fn apply_pane_base_env(cmd: &mut CommandBuilder) {
    cmd.env(crate::api::SOCKET_PATH_ENV_VAR, crate::api::socket_path());
    if let Ok(executable) = std::env::current_exe() {
        cmd.env("LOOM_BIN_PATH", executable);
    }
}

/// Injects the Recoder managed-pane handshake into a managed pane's launch
/// environment: the host MCP socket (sourced from Loom's own environment, never
/// fabricated) and a freshly generated per-pane capability token. A managed
/// agent can then drive the gated MCP route by construction. The socket is set
/// only when the host actually exported one; the token is set only when the OS
/// RNG produced one. This is scoped to managed panes on purpose so a plain user
/// shell or popup never receives a capability token.
pub(crate) fn apply_managed_pane_handshake_env(
    cmd: &mut CommandBuilder,
    capability_token: Option<&str>,
) {
    if let Some(socket) =
        std::env::var_os(RECODER_MCP_SOCKET_ENV_VAR).filter(|value| !value.is_empty())
    {
        cmd.env(RECODER_MCP_SOCKET_ENV_VAR, socket);
    }
    if let Some(token) = capability_token {
        cmd.env(RECODER_PANE_TOKEN_ENV_VAR, token);
    }
}

/// Generates a fresh, unpredictable per-pane capability token.
///
/// The token is 256 bits of OS CSPRNG entropy rendered as lowercase hex, so it
/// carries no shell metacharacters and is safe to place in an environment
/// value. It is never reused across panes. Returns `None` when the OS RNG is
/// unavailable so a managed pane launches without a token rather than with a
/// weak or predictable one.
pub(crate) fn generate_pane_capability_token() -> Option<String> {
    let mut bytes = [0u8; PANE_CAPABILITY_TOKEN_BYTES];
    getrandom::fill(&mut bytes).ok()?;
    let mut token = String::with_capacity(PANE_CAPABILITY_TOKEN_BYTES * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        // Writing hex into a String is infallible; the formatting Result cannot fail here.
        let _ = write!(token, "{byte:02x}");
    }
    Some(token)
}

/// Filters a caller-supplied environment map down to the entries that are safe
/// to apply to a managed pane. The denylist is authoritative: an entry is kept
/// only when its key is syntactically valid, is not a reserved Loom/Recoder
/// runtime variable, and does not match a host-secret pattern. A matching entry
/// is dropped — never passed through, and never allowed to override a Loom
/// runtime variable.
pub(crate) fn sanitize_caller_pane_env<I>(entries: I) -> Vec<(String, String)>
where
    I: IntoIterator<Item = (String, String)>,
{
    entries
        .into_iter()
        .filter(|(key, _)| {
            is_valid_env_key(key) && !is_reserved_pane_env_key(key) && !is_secret_pane_env_key(key)
        })
        .collect()
}

/// Returns true when `key` is a syntactically valid POSIX environment variable
/// name: non-empty, starting with an ASCII letter or underscore and otherwise
/// only ASCII letters, digits, and underscores.
pub(crate) fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic() || first == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

/// Returns true when `key` names a Loom runtime or Recoder-managed environment
/// variable that a caller must never set or override on a managed pane. Every
/// Loom runtime variable is namespaced `LOOM_*`, so the prefix rule covers the
/// socket paths, session, identity, bin path, and plugin variables at once.
pub(crate) fn is_reserved_pane_env_key(key: &str) -> bool {
    if key
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("LOOM_"))
    {
        return true;
    }
    [RECODER_MCP_SOCKET_ENV_VAR, RECODER_PANE_TOKEN_ENV_VAR]
        .iter()
        .any(|reserved| reserved.eq_ignore_ascii_case(key))
}

/// Returns true when `key` looks like it carries a host secret. Conservative,
/// case-insensitive: any well-known secret marker as a substring, plus the
/// trailing `_KEY` convention (`AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`,
/// `GITHUB_TOKEN`, ...). Erring toward dropping keeps host secrets out of a
/// pane env by construction.
pub(crate) fn is_secret_pane_env_key(key: &str) -> bool {
    const MARKERS: &[&str] = &[
        "SECRET",
        "TOKEN",
        "PASSWORD",
        "PASSWD",
        "PASSPHRASE",
        "CREDENTIAL",
        "APIKEY",
        "ACCESS_KEY",
        "PRIVATE_KEY",
        "AUTH",
    ];
    let upper = key.to_ascii_uppercase();
    if MARKERS.iter().any(|marker| upper.contains(marker)) {
        return true;
    }
    upper == "KEY" || upper.ends_with("_KEY")
}

pub(crate) fn pi_extension_dir() -> io::Result<PathBuf> {
    Ok(
        config_dir_from_env_or_home(PI_CODING_AGENT_DIR_ENV_VAR, &[".pi", "agent"])?
            .join("extensions"),
    )
}

pub(crate) fn omp_extension_dir() -> io::Result<PathBuf> {
    if let Some(value) =
        std::env::var_os(PI_CODING_AGENT_DIR_ENV_VAR).filter(|value| !value.is_empty())
    {
        return expand_tilde_path(PathBuf::from(value)).map(|path| path.join("extensions"));
    }

    let config_dir = std::env::var_os(OMP_CONFIG_DIR_ENV_VAR)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| ".omp".into());
    Ok(home_dir()?
        .join(config_dir)
        .join("agent")
        .join("extensions"))
}

pub(crate) fn claude_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(CLAUDE_CONFIG_DIR_ENV_VAR, &[".claude"])
}

pub(crate) fn codex_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(CODEX_HOME_ENV_VAR, &[".codex"])
}

pub(crate) fn kimi_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(KIMI_CODE_HOME_ENV_VAR, &[".kimi-code"])
}

pub(crate) fn copilot_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(COPILOT_HOME_ENV_VAR, &[".copilot"])
}

pub(crate) fn devin_dir() -> io::Result<PathBuf> {
    if let Some(value) = std::env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
        return expand_tilde_path(PathBuf::from(value)).map(|path| path.join("devin"));
    }

    Ok(home_dir()?.join(".config").join("devin"))
}

pub(crate) fn droid_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join(".factory"))
}

pub(crate) fn config_dir_from_env_or_home(
    env_var: &str,
    home_relative_segments: &[&str],
) -> io::Result<PathBuf> {
    if let Some(value) = std::env::var_os(env_var).filter(|value| !value.is_empty()) {
        return expand_tilde_path(PathBuf::from(value));
    }

    let mut path = home_dir()?;
    for segment in home_relative_segments {
        path.push(segment);
    }
    Ok(path)
}

pub(crate) fn expand_tilde_path(path: PathBuf) -> io::Result<PathBuf> {
    let Some(raw) = path.to_str() else {
        return Ok(path);
    };

    if raw == "~" {
        return home_dir();
    }

    if let Some(rest) = raw
        .strip_prefix("~/")
        .or_else(|| raw.strip_prefix("~\\"))
        .or_else(|| raw.strip_prefix('~'))
    {
        return Ok(home_dir()?.join(rest));
    }

    Ok(path)
}

pub(crate) fn opencode_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join(".config/opencode"))
}

pub(crate) fn kilo_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join(".config/kilo"))
}

pub(crate) fn hermes_dir() -> io::Result<PathBuf> {
    if let Some(value) = std::env::var_os(HERMES_HOME_ENV_VAR).filter(|value| !value.is_empty()) {
        return expand_tilde_path(PathBuf::from(value));
    }

    #[cfg(windows)]
    {
        let explicit_home = std::env::var_os("HOME").filter(|value| !value.is_empty());
        let profile = std::env::var_os("USERPROFILE").filter(|value| !value.is_empty());
        if let Some(home) = explicit_home.filter(|home| profile.as_ref() != Some(home)) {
            return Ok(PathBuf::from(home).join(".hermes"));
        }
        if let Some(local_app_data) =
            std::env::var_os("LOCALAPPDATA").filter(|value| !value.is_empty())
        {
            return Ok(PathBuf::from(local_app_data).join("hermes"));
        }
    }

    Ok(home_dir()?.join(".hermes"))
}

pub(crate) fn hermes_plugin_dir() -> io::Result<PathBuf> {
    Ok(hermes_dir()?
        .join("plugins")
        .join(super::HERMES_PLUGIN_INSTALL_NAME))
}

pub(crate) fn qodercli_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(QODERCLI_CONFIG_DIR_ENV_VAR, &[".qoder"])
}

pub(crate) fn cursor_dir() -> io::Result<PathBuf> {
    config_dir_from_env_or_home(CURSOR_CONFIG_DIR_ENV_VAR, &[".cursor"])
}

pub(crate) fn mastracode_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join(".mastracode"))
}

pub(crate) fn antigravity_cli_dir() -> io::Result<PathBuf> {
    // Antigravity CLI discovers global customizations (hooks.json included)
    // from ~/.gemini/config; ~/.gemini/antigravity-cli holds runtime data and
    // is never read for hooks.
    config_dir_from_env_or_home(ANTIGRAVITY_CLI_CONFIG_DIR_ENV_VAR, &[".gemini", "config"])
}

pub(crate) fn grok_dir() -> io::Result<PathBuf> {
    // GROK_CONFIG_DIR is a loom-level override only (primarily a test
    // seam); the grok CLI does not honor it, so it stays first and explicit.
    if let Some(value) = std::env::var_os(GROK_CONFIG_DIR_ENV_VAR).filter(|value| !value.is_empty())
    {
        return expand_tilde_path(PathBuf::from(value));
    }
    // The grok CLI honors GROK_HOME as its config home (config.toml,
    // auth.json, hooks/); mirror it so hook installs land where grok looks.
    config_dir_from_env_or_home(GROK_HOME_ENV_VAR, &[".grok"])
}

pub(crate) fn home_dir() -> io::Result<PathBuf> {
    if let Some(home) = std::env::var_os("HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(home));
    }

    #[cfg(windows)]
    {
        if let Some(profile) = std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()) {
            return Ok(PathBuf::from(profile));
        }
        if let (Some(drive), Some(path)) = (
            std::env::var_os("HOMEDRIVE").filter(|value| !value.is_empty()),
            std::env::var_os("HOMEPATH").filter(|value| !value.is_empty()),
        ) {
            let mut home = PathBuf::from(drive);
            home.push(path);
            return Ok(home);
        }
    }

    Err(io::Error::other(
        "home directory is not set; cannot locate home directory",
    ))
}

#[cfg(test)]
pub(crate) fn integration_env_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

#[cfg(test)]
mod managed_pane_env_tests {
    use super::*;

    #[test]
    fn sanitize_keeps_only_safe_caller_entries() {
        let entries = vec![
            ("MY_FLAG".to_string(), "1".to_string()),
            ("PROJECT_MODE".to_string(), "ci".to_string()),
            // Reserved Loom runtime vars must never pass through or override.
            ("LOOM_SOCKET_PATH".to_string(), "/tmp/evil.sock".to_string()),
            ("LOOM_PANE_ID".to_string(), "w9:p9".to_string()),
            ("loom_env".to_string(), "0".to_string()),
            // Reserved Recoder handshake vars must never be caller-set.
            (
                RECODER_MCP_SOCKET_ENV_VAR.to_string(),
                "/tmp/fake.sock".to_string(),
            ),
            (RECODER_PANE_TOKEN_ENV_VAR.to_string(), "forged".to_string()),
            // Host-secret patterns must be dropped.
            ("AWS_SECRET_ACCESS_KEY".to_string(), "shh".to_string()),
            ("GITHUB_TOKEN".to_string(), "ghp_x".to_string()),
            ("OPENAI_API_KEY".to_string(), "sk-x".to_string()),
            ("DB_PASSWORD".to_string(), "hunter2".to_string()),
            ("SSH_PRIVATE_KEY".to_string(), "----".to_string()),
            ("MY_KEY".to_string(), "nope".to_string()),
            // Invalid key syntax must be dropped.
            ("1BAD".to_string(), "x".to_string()),
            ("has space".to_string(), "x".to_string()),
            (String::new(), "x".to_string()),
        ];

        let allowed = sanitize_caller_pane_env(entries);

        assert_eq!(
            allowed,
            vec![
                ("MY_FLAG".to_string(), "1".to_string()),
                ("PROJECT_MODE".to_string(), "ci".to_string()),
            ]
        );
    }

    #[test]
    fn reserved_keys_cover_loom_and_recoder_namespaces() {
        for key in [
            "LOOM_SOCKET_PATH",
            "LOOM_CLIENT_SOCKET_PATH",
            "LOOM_SESSION",
            "LOOM_ENV",
            "LOOM_BIN_PATH",
            "LOOM_PANE_ID",
            "LOOM_TAB_ID",
            "LOOM_WORKSPACE_ID",
            "LOOM_PLUGIN_ANYTHING",
            "loom_pane_id",
            RECODER_MCP_SOCKET_ENV_VAR,
            RECODER_PANE_TOKEN_ENV_VAR,
        ] {
            assert!(is_reserved_pane_env_key(key), "{key} must be reserved");
        }
        for key in ["LOOM", "PATH", "MY_FLAG", "RECODER_REGION"] {
            assert!(!is_reserved_pane_env_key(key), "{key} must not be reserved");
        }
    }

    #[test]
    fn secret_pattern_catches_common_credential_names() {
        for key in [
            "AWS_SECRET_ACCESS_KEY",
            "GITHUB_TOKEN",
            "OPENAI_API_KEY",
            "STRIPE_APIKEY",
            "DB_PASSWORD",
            "PGPASSWORD",
            "SSH_PASSPHRASE",
            "GCP_CREDENTIALS",
            "AUTHORIZATION",
            "PRIVATE_KEY",
            "KEY",
            "SIGNING_KEY",
        ] {
            assert!(is_secret_pane_env_key(key), "{key} must look secret");
        }
        for key in ["MY_FLAG", "PROJECT_MODE", "REGION", "MONKEY_MODE"] {
            assert!(!is_secret_pane_env_key(key), "{key} must not look secret");
        }
    }

    #[test]
    fn capability_token_is_random_hex_and_unique_per_pane() {
        let first = generate_pane_capability_token().expect("token");
        let second = generate_pane_capability_token().expect("token");
        assert_ne!(first, second, "token must be unique per pane");
        for token in [&first, &second] {
            assert_eq!(token.len(), PANE_CAPABILITY_TOKEN_BYTES * 2);
            assert!(
                token
                    .chars()
                    .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()),
                "token must be lowercase hex: {token}"
            );
        }
    }

    fn injected_env(cmd: &CommandBuilder) -> std::collections::HashMap<String, String> {
        cmd.iter_extra_env_as_str()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn managed_handshake_injects_sourced_socket_and_fresh_token() {
        let _guard = integration_env_lock();
        let previous = std::env::var_os(RECODER_MCP_SOCKET_ENV_VAR);
        std::env::set_var(RECODER_MCP_SOCKET_ENV_VAR, "/run/recoder/mcp.sock");

        let mut cmd = CommandBuilder::new("sh");
        let token = generate_pane_capability_token();
        apply_managed_pane_handshake_env(&mut cmd, token.as_deref());
        let injected = injected_env(&cmd);

        assert_eq!(
            injected.get(RECODER_MCP_SOCKET_ENV_VAR).map(String::as_str),
            Some("/run/recoder/mcp.sock"),
        );
        let token = injected
            .get(RECODER_PANE_TOKEN_ENV_VAR)
            .expect("token injected");
        assert_eq!(token.len(), PANE_CAPABILITY_TOKEN_BYTES * 2);
        assert_ne!(token, "/run/recoder/mcp.sock");

        match previous {
            Some(value) => std::env::set_var(RECODER_MCP_SOCKET_ENV_VAR, value),
            None => std::env::remove_var(RECODER_MCP_SOCKET_ENV_VAR),
        }
    }

    #[test]
    fn managed_handshake_omits_socket_when_host_did_not_export_one() {
        let _guard = integration_env_lock();
        let previous = std::env::var_os(RECODER_MCP_SOCKET_ENV_VAR);
        std::env::remove_var(RECODER_MCP_SOCKET_ENV_VAR);

        let mut cmd = CommandBuilder::new("sh");
        let token = generate_pane_capability_token();
        apply_managed_pane_handshake_env(&mut cmd, token.as_deref());
        let injected = injected_env(&cmd);

        assert!(!injected.contains_key(RECODER_MCP_SOCKET_ENV_VAR));
        assert!(injected.contains_key(RECODER_PANE_TOKEN_ENV_VAR));

        if let Some(value) = previous {
            std::env::set_var(RECODER_MCP_SOCKET_ENV_VAR, value);
        }
    }
}
