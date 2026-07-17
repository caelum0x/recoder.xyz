//! `tensorzero-gateway-napi` — Native Node.js addon that runs the TensorZero
//! gateway engine IN-PROCESS (the Cursor↔VSCode fusion model): no HTTP hop, no
//! subprocess. The full routing/variant/fallback engine is compiled into this
//! `.node` and called directly from Node.
//!
//! ## What is exposed
//!
//! Free helpers (no gateway boot required):
//! - [`gateway_version`] — the TensorZero crate version string (sync, zero-cost).
//! - [`validate_config_path`] — async: loads and validates a TensorZero config
//!   from a file-system glob path without verifying provider credentials. Returns
//!   `Ok(())` on success or a human-readable error string on failure.
//!
//! The embedded gateway ([`EmbeddedGateway`], the real in-process fusion):
//! - `boot` — builds `ClientBuilderMode::EmbeddedGateway` (the same mode the
//!   TensorZero Python client uses); no Axum HTTP server is started.
//! - `inference` — one full inference (routing + variants + fallbacks), async.
//! - `inferenceStream` — one STREAMED inference: every `InferenceResponseChunk`
//!   is delivered through a `ThreadsafeFunction` callback as JSON (real
//!   per-token deltas, in-process), followed by a `done` event on the SAME
//!   callback (FIFO — the JS side can rely on all chunks having been delivered
//!   once `done` arrives). The promise resolves with an aggregated summary.
//! - `feedback` — record metric/comment feedback for a prior inference/episode.
//!
//! ## What is NOT exposed (and why, truthfully)
//!
//! Embeddings are intentionally absent: `tensorzero-core`'s `http_embeddings`
//! returns `"HTTP embeddings is not supported in embedded gateway mode"` — the
//! embeddings path only exists in `HTTPGateway` mode, so there is no in-process
//! surface to wrap. Callers needing embeddings must use the HTTP gateway. Full
//! HTTP-specific responses (raw request/response capture) likewise stay on the
//! loopback path.
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

use futures::StreamExt;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
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
    let glob = ConfigFileGlob::new(config_path).map_err(|e| {
        napi::Error::from_reason(format!("tensorzero-gateway-napi: invalid config path: {e}"))
    })?;

    // `load_from_path_optional_verify_credentials` with `validate_credentials = false`
    // loads and parses the TOML without connecting to providers — exactly the
    // surface we want to expose in-process.
    Config::load_from_path_optional_verify_credentials(&glob, false)
        .await
        .map(|_| ())
        .map_err(|e| {
            napi::Error::from_reason(format!(
                "tensorzero-gateway-napi: config validation failed: {e}"
            ))
        })
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
        let mut params = parse_inference_params(&params_json)?;
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

    /// Run one STREAMED inference through the embedded gateway (real per-token
    /// deltas, in-process — the napi equivalent of `POST /inference` with
    /// `stream: true`).
    ///
    /// Each `InferenceResponseChunk` is serialized and delivered to `on_event`
    /// as `{"chunk": <InferenceResponseChunk>}`. After the final chunk a
    /// `{"done": <summary>}` event is delivered on the SAME callback — the
    /// threadsafe-function queue is FIFO, so once JS observes `done` every
    /// chunk has been delivered (the async promise resolution and the callback
    /// queue have no cross-ordering guarantee; `done` is the truthful flush
    /// barrier). The promise resolves with the same aggregated summary JSON:
    /// `{"inference_id","episode_id","content","usage","chunks"}`.
    ///
    /// A mid-stream provider error rejects the promise (truthful failure —
    /// never a silently truncated success).
    #[napi]
    pub async fn inference_stream(
        &self,
        params_json: String,
        on_event: ThreadsafeFunction<String>,
    ) -> Result<String, napi::Error> {
        let mut params = parse_inference_params(&params_json)?;
        params.stream = Some(true);
        let output = self
            .client
            .inference(params)
            .await
            .map_err(|e| napi::Error::from_reason(format!("inference failed: {e}")))?;
        let InferenceOutput::Streaming(mut stream) = output else {
            return Err(napi::Error::from_reason(
                "unexpected non-streaming response with `stream: true`",
            ));
        };

        // Aggregate a truthful summary while forwarding every chunk.
        let mut content = String::new();
        let mut inference_id = serde_json::Value::Null;
        let mut episode_id = serde_json::Value::Null;
        let mut usage = serde_json::Value::Null;
        let mut chunks: u32 = 0;
        while let Some(item) = stream.next().await {
            let chunk = item
                .map_err(|e| napi::Error::from_reason(format!("inference stream failed: {e}")))?;
            let value = serde_json::to_value(&chunk)
                .map_err(|e| napi::Error::from_reason(format!("serialize chunk: {e}")))?;
            aggregate_chunk(
                &value,
                &mut content,
                &mut inference_id,
                &mut episode_id,
                &mut usage,
            );
            chunks += 1;
            let event = serde_json::to_string(&serde_json::json!({ "chunk": value }))
                .map_err(|e| napi::Error::from_reason(format!("serialize chunk event: {e}")))?;
            on_event.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
        }

        let summary = serde_json::json!({
            "inference_id": inference_id,
            "episode_id": episode_id,
            "content": content,
            "usage": usage,
            "chunks": chunks,
        });
        let done = serde_json::to_string(&serde_json::json!({ "done": summary }))
            .map_err(|e| napi::Error::from_reason(format!("serialize done event: {e}")))?;
        on_event.call(Ok(done), ThreadsafeFunctionCallMode::NonBlocking);
        serde_json::to_string(&summary)
            .map_err(|e| napi::Error::from_reason(format!("serialize summary: {e}")))
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

/// Parse a `POST /inference`-shaped JSON body into `ClientInferenceParams`.
///
/// The HTTP wire format defaults most fields; the client struct does not.
/// Merge the caller's JSON over a serialized `Default` so the JS surface
/// matches `POST /inference` (callers only supply what they mean).
fn parse_inference_params(params_json: &str) -> Result<ClientInferenceParams, napi::Error> {
    let raw: serde_json::Value = serde_json::from_str(params_json)
        .map_err(|e| napi::Error::from_reason(format!("invalid inference params: {e}")))?;
    let mut merged = serde_json::to_value(ClientInferenceParams::default())
        .map_err(|e| napi::Error::from_reason(format!("default params serialize: {e}")))?;
    if let (Some(base), Some(user)) = (merged.as_object_mut(), raw.as_object()) {
        for (key, value) in user {
            base.insert(key.clone(), value.clone());
        }
    }
    serde_json::from_value(merged)
        .map_err(|e| napi::Error::from_reason(format!("invalid inference params: {e}")))
}

/// Fold one serialized `InferenceResponseChunk` into the streaming summary.
///
/// Works on the JSON wire shape (the untagged chat/json chunk union): chat
/// chunks carry `content: [ContentBlockChunk]` (text blocks appended in order),
/// json chunks carry `raw: String`. Ids come from the first chunk that has
/// them; `usage` keeps the last non-null value (the gateway emits it on the
/// final chunk).
fn aggregate_chunk(
    value: &serde_json::Value,
    content: &mut String,
    inference_id: &mut serde_json::Value,
    episode_id: &mut serde_json::Value,
    usage: &mut serde_json::Value,
) {
    if inference_id.is_null()
        && let Some(id) = value.get("inference_id").filter(|v| !v.is_null())
    {
        *inference_id = id.clone();
    }
    if episode_id.is_null()
        && let Some(id) = value.get("episode_id").filter(|v| !v.is_null())
    {
        *episode_id = id.clone();
    }
    if let Some(next_usage) = value.get("usage").filter(|v| !v.is_null()) {
        *usage = next_usage.clone();
    }
    if let Some(blocks) = value.get("content").and_then(serde_json::Value::as_array) {
        for block in blocks {
            let is_text = block.get("type").and_then(serde_json::Value::as_str) == Some("text");
            if !is_text {
                continue;
            }
            if let Some(text) = block.get("text").and_then(serde_json::Value::as_str) {
                content.push_str(text);
            }
        }
    } else if let Some(raw) = value.get("raw").and_then(serde_json::Value::as_str) {
        content.push_str(raw);
    }
}
