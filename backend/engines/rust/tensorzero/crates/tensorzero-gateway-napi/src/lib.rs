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

use std::path::PathBuf;

use napi_derive::napi;
use tensorzero_core::client::{
    Client, ClientBuilder, ClientBuilderMode, ClientInferenceParams, FeedbackParams,
    InferenceOutput,
};
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

// ---------------------------------------------------------------------------
// Embedded gateway — the REAL in-process fusion (Cursor↔VSCode style)
// ---------------------------------------------------------------------------

/// The TensorZero gateway embedded IN-PROCESS in Node — the same
/// `ClientBuilderMode::EmbeddedGateway` that `tensorzero-python` uses. No HTTP
/// server is started: the gateway's routing/fallback/config engine runs inside
/// this process and only makes outgoing calls to model providers (and, when
/// configured, ClickHouse for observability — omitted here by default).
///
/// All methods are async (napi `tokio_rt`) — the Node event loop is never
/// blocked, even during long LLM calls.
#[napi(js_name = "EmbeddedGateway")]
pub struct EmbeddedGateway {
    client: Client,
}

#[napi]
impl EmbeddedGateway {
    /// Boot the embedded gateway from a TensorZero config file (or `null` for a
    /// default empty config). `verify_credentials` is `false` so boot succeeds
    /// without provider keys — a real inference call surfaces the truthful
    /// provider error at call time instead.
    #[napi(factory)]
    pub async fn boot(
        config_file: Option<String>,
        clickhouse_url: Option<String>,
    ) -> Result<Self, napi::Error> {
        let client = ClientBuilder::new(ClientBuilderMode::EmbeddedGateway {
            config_file: config_file.map(PathBuf::from),
            clickhouse_url,
            postgres_config: None,
            valkey_url: None,
            timeout: None,
            verify_credentials: false,
            allow_batch_writes: false,
        })
        .build()
        .await
        .map_err(|e| {
            napi::Error::from_reason(format!("tensorzero embedded gateway boot failed: {e}"))
        })?;
        Ok(Self { client })
    }

    /// Run one inference through the embedded gateway (routing, variants,
    /// fallbacks — the full engine, in-process). `params_json` matches the
    /// gateway's `POST /inference` body (`ClientInferenceParams`). Streaming is
    /// forced off — this binding returns the complete response as JSON.
    #[napi]
    pub async fn inference(&self, params_json: String) -> Result<String, napi::Error> {
        let raw: serde_json::Value = serde_json::from_str(&params_json)
            .map_err(|e| napi::Error::from_reason(format!("invalid inference params: {e}")))?;
        // The HTTP wire format defaults most fields; the client struct does not.
        // Merge the caller's JSON over a serialized `Default` so the JS surface
        // matches `POST /inference` (callers only supply what they mean).
        let mut merged = serde_json::to_value(ClientInferenceParams::default())
            .map_err(|e| napi::Error::from_reason(format!("default params serialize: {e}")))?;
        if let (Some(base), Some(user)) = (merged.as_object_mut(), raw.as_object()) {
            for (key, value) in user {
                base.insert(key.clone(), value.clone());
            }
        }
        let mut params: ClientInferenceParams = serde_json::from_value(merged)
            .map_err(|e| napi::Error::from_reason(format!("invalid inference params: {e}")))?;
        params.stream = Some(false);
        let output = self
            .client
            .inference(params)
            .await
            .map_err(|e| napi::Error::from_reason(format!("inference failed: {e}")))?;
        let InferenceOutput::NonStreaming(response) = output else {
            return Err(napi::Error::from_reason(
                "unexpected streaming response with `stream: false`",
            ));
        };
        serde_json::to_string(&response)
            .map_err(|e| napi::Error::from_reason(format!("serialize response: {e}")))
    }

    /// Send feedback for a prior inference/episode. `params_json` matches the
    /// gateway's `POST /feedback` body (`FeedbackParams`).
    #[napi]
    pub async fn feedback(&self, params_json: String) -> Result<String, napi::Error> {
        let params: FeedbackParams = serde_json::from_str(&params_json)
            .map_err(|e| napi::Error::from_reason(format!("invalid feedback params: {e}")))?;
        let response = self
            .client
            .feedback(params)
            .await
            .map_err(|e| napi::Error::from_reason(format!("feedback failed: {e}")))?;
        serde_json::to_string(&response)
            .map_err(|e| napi::Error::from_reason(format!("serialize response: {e}")))
    }
}
