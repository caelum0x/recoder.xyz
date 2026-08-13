//! Pre-spawn policy gate for the plugin command runtime.
//!
//! Loom's plugin system spawns free-argv commands, which is a remote code
//! execution surface. In the Recoder fork the governed skill model replaces
//! plugins, so plugin spawning defaults to DENY. A spawn may proceed only when
//! the host operator has affirmatively opted in, either through the
//! `LOOM_PLUGIN_SPAWN_ALLOW` environment flag read when the app is constructed
//! or through the injected capability on `AppState`.
//!
//! The decision depends solely on that host-owned capability. Plugin-supplied
//! data (id, command, manifest metadata) is deliberately never an input, so a
//! plugin cannot mark itself allowed.

/// Environment flag a host operator sets to permit plugin spawns.
pub(crate) const PLUGIN_SPAWN_ALLOW_ENV: &str = "LOOM_PLUGIN_SPAWN_ALLOW";

/// Error surfaced when a plugin spawn is refused by the gate.
pub(crate) const PLUGIN_SPAWN_DISABLED_MESSAGE: &str =
    "plugin execution is disabled (governed skill model replaces it)";

/// Error code paired with [`PLUGIN_SPAWN_DISABLED_MESSAGE`].
pub(crate) const PLUGIN_SPAWN_DISABLED_CODE: &str = "plugin_execution_disabled";

/// Authoritative pre-spawn decision.
///
/// The only input is the host-owned capability. Plugin metadata is intentionally
/// not a parameter, so the outcome cannot be influenced by a plugin. Without an
/// affirmative capability the spawn is denied.
pub(crate) fn authorize_plugin_spawn(host_capability: bool) -> Result<(), &'static str> {
    if host_capability {
        Ok(())
    } else {
        Err(PLUGIN_SPAWN_DISABLED_MESSAGE)
    }
}

/// Read the host-operator capability flag from the process environment.
///
/// Returns `true` only for an affirmative value. Unset, empty, or any other
/// value denies.
pub(crate) fn host_capability_from_env() -> bool {
    std::env::var(PLUGIN_SPAWN_ALLOW_ENV)
        .ok()
        .as_deref()
        .map(is_affirmative)
        .unwrap_or(false)
}

fn is_affirmative(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denies_spawn_without_host_capability() {
        assert_eq!(
            authorize_plugin_spawn(false),
            Err(PLUGIN_SPAWN_DISABLED_MESSAGE)
        );
    }

    #[test]
    fn allows_spawn_only_with_host_capability() {
        assert_eq!(authorize_plugin_spawn(true), Ok(()));
    }

    #[test]
    fn affirmative_values_enable_capability() {
        for value in ["1", "true", "TRUE", "yes", "On", "  true  "] {
            assert!(
                is_affirmative(value),
                "expected {value:?} to be affirmative"
            );
        }
    }

    #[test]
    fn non_affirmative_values_deny_capability() {
        for value in ["", "0", "false", "no", "off", "allow", "plugin"] {
            assert!(
                !is_affirmative(value),
                "expected {value:?} to be non-affirmative"
            );
        }
    }
}
