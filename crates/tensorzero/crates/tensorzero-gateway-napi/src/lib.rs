//! `tensorzero-gateway-napi` — Native Node.js addon for TensorZero gateway
//! config-validate and version helpers.
//!
//! ## What is exposed
//!
//! This crate intentionally exposes only the small, cleanly-callable surface of
//! `tensorzero-core` that can be reached without starting the full async HTTP
//! gateway service:
//!
//! - [`gateway_version`] — returns the crate version string (sync, zero-cost).
//! - [`validate_config_path`] — async: loads and validates a TensorZero config
//!   from a file-system glob path without verifying provider credentials. Returns
//!   `Ok(())` on success or a human-readable error string on failure.
//!
//! ## Why not expose inference / full gateway
//!
//! `tensorzero-core`'s inference path is fundamentally async-service-heavy: it
//! requires ClickHouse, Postgres, object-store connections, and a running Axum
//! router. Wrapping that in an NAPI binding would essentially embed the entire
//! gateway server inside Node, which is neither safe nor practical from a single
//! `.node` file. The loopback/subprocess path in `tensorzero-client.ts` remains
//! the correct path for full inference routing.
//!
//! ## Degrade-safe contract
//!
//! The TypeScript facade (`tensorzero-client.ts`) `require()`s this module at
//! runtime. If the `.node` is absent (different arch, build deferred) the facade
//! falls through to the existing subprocess/loopback path with no behavior
//! change. This crate is purely additive.
//!
//! ## Safety
//!
//! There is no `unsafe` code in this file. `napi_derive` generates the FFI
//! glue; its invariants ensure every exported symbol is wrapped with the correct
//! N-API lifetimes and error conversion. All Rust-side state is either stateless
//! (version) or isolated per call (config load).

#![deny(clippy::all)]

use napi_derive::napi;
use tensorzero_core::config::{Config, ConfigFileGlob};

// ---------------------------------------------------------------------------
// Version helper (sync, zero-cost)
// ---------------------------------------------------------------------------

/// Return the TensorZero crate version string (`CARGO_PKG_VERSION`).
///
/// This is safe to call at any time with no side effects. The TypeScript facade
/// uses it to log/report the in-process native addon version vs the loopback
/// gateway version so operators can confirm they match.
#[napi]
pub fn gateway_version() -> String {
    tensorzero_core::endpoints::status::TENSORZERO_VERSION.to_string()
}

// ---------------------------------------------------------------------------
// Config validation (async — file I/O + TOML parse, no provider credentials)
// ---------------------------------------------------------------------------

/// Validate a TensorZero config at the given glob path without verifying
/// provider credentials or connecting to any external service.
///
/// Returns `Ok(null)` on success or `Err(reason)` with a human-readable
/// description of the first validation error found.
///
/// This is the only function in the binding that requires an active Tokio
/// runtime (supplied by the `napi` `tokio_rt` feature). The JS caller should
/// `await` it. Long paths with many TOML files may take a few hundred
/// milliseconds.
///
/// # Example (TypeScript)
/// ```ts
/// import { validateConfigPath } from './tensorzero-gateway-napi';
/// try {
///   await validateConfigPath('/etc/tensorzero/config.toml');
/// } catch (e) {
///   console.error('Config invalid:', e.message);
/// }
/// ```
#[napi]
pub async fn validate_config_path(config_path: String) -> Result<(), napi::Error> {
    let glob = ConfigFileGlob::new(config_path)
        .map_err(|e| napi::Error::from_reason(format!("tensorzero-gateway-napi: invalid config path: {e}")))?;

    // `load_from_path_optional_verify_credentials` with `validate_credentials = false`
    // loads and parses the TOML without connecting to providers — exactly the
    // surface we want to expose in-process.
    Config::load_from_path_optional_verify_credentials(&glob, false)
        .await
        .map(|_| ())
        .map_err(|e| napi::Error::from_reason(format!("tensorzero-gateway-napi: config validation failed: {e}")))
}
