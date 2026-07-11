/**
 * GatewayPanel — TensorZero LLM gateway surface.
 *
 * Surfaces:
 *   GET  /api/gateway/health   — truthful health snapshot (no auth required)
 *   GET  /api/gateway/status   — authenticated status: mode, baseUrl, binaryFound
 *   POST /api/gateway/inference — simple inference test through the gateway
 *
 * DEGRADE-SAFE: when the gateway binary is absent or unconfigured the backend
 * returns 503 and this panel shows a truthful "unavailable — <reason>" banner.
 * No mock data is ever rendered. When both health and status 503, the panel
 * surfaces the reason from whichever call responded.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { GatewayHealth, GatewayStatus, GatewayInferenceResult } from '../types';

const POLL_MS = 15_000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Gateway error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Mode badge ────────────────────────────────────────────────────────────────

interface ModeBadgeProps {
  mode: GatewayHealth['mode'] | undefined;
  available: boolean;
}

function ModeBadge({ mode, available }: ModeBadgeProps) {
  if (!mode) return null;
  const tone = available ? 'ok' : 'muted';
  return (
    <span class={`badge tone-${tone}`}>
      {mode}
    </span>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────

interface StatusRowProps {
  label: string;
  value: string | null | undefined;
}

function StatusRow({ label, value }: StatusRowProps) {
  return (
    <div class="gateway-row">
      <span class="gateway-label">{label}</span>
      <span class="gateway-value">{value ?? '—'}</span>
    </div>
  );
}

// ── Inference test form ───────────────────────────────────────────────────────

interface InferenceFormProps {
  available: boolean;
}

function InferenceForm({ available }: InferenceFormProps) {
  const [functionName, setFunctionName] = useState('chat');
  const [prompt, setPrompt] = useState('Hello, are you available?');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GatewayInferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!functionName.trim() || !prompt.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.gatewayInference({
        function_name: functionName.trim(),
        input: { messages: [{ role: 'user', content: prompt.trim() }] },
      });
      setResult(res);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="gateway-inference-form" onSubmit={submit}>
      <div class="panel-section-head">
        <strong>Inference test</strong>
        {!available && (
          <span class="gateway-hint">Gateway unavailable — test will return 503</span>
        )}
      </div>
      <div class="field">
        <span>Function name</span>
        <input
          value={functionName}
          onInput={(e) => setFunctionName((e.target as HTMLInputElement).value)}
          placeholder="chat"
          disabled={busy}
        />
      </div>
      <div class="field">
        <span>User message</span>
        <textarea
          rows={2}
          value={prompt}
          onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          placeholder="Hello, are you available?"
          disabled={busy}
        />
      </div>
      {result && (
        <div class="gateway-result">
          <div class={`gateway-routed ${result.routed ? 'tone-ok' : 'tone-warn'}`}>
            {result.routed ? 'Routed through gateway' : `Not routed — ${result.reason ?? 'fallback'}`}
          </div>
          {result.routed && (
            <>
              {result.inference_id && (
                <div class="gateway-inference-id">inference_id: {result.inference_id}</div>
              )}
              {result.usage && (
                <div class="gateway-usage">
                  tokens: {result.usage.input_tokens ?? 0} in / {result.usage.output_tokens ?? 0} out
                </div>
              )}
            </>
          )}
        </div>
      )}
      {error && <p class="action-error">{error}</p>}
      <div class="modal-actions">
        <button
          class="btn btn-sm btn-primary"
          type="submit"
          disabled={!functionName.trim() || !prompt.trim() || busy}
        >
          {busy ? 'Testing…' : 'Run inference test'}
        </button>
      </div>
    </form>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function GatewayPanel() {
  const health = usePoll(() => api.gatewayHealth(), POLL_MS);
  const status = usePoll(() => api.gatewayStatus(), POLL_MS);

  const healthData: GatewayHealth | null = health.data;
  const statusData: GatewayStatus | null = status.data;

  const unreachable =
    health.error instanceof BackendUnreachableError ||
    status.error instanceof BackendUnreachableError;

  // True when the backend replied but the gateway seam is 503/unavailable.
  const gatewayUnavailable =
    !unreachable &&
    ((health.error instanceof ApiError && health.error.status === 503) ||
      (status.error instanceof ApiError && status.error.status === 503) ||
      healthData?.available === false);

  // A non-503 error (backend up, unexpected failure).
  const unexpectedError = health.error ?? status.error;

  // Best-effort reason from whichever call gave us useful context.
  const unavailableReason =
    healthData?.reason ??
    (health.error instanceof ApiError ? health.error.message : null) ??
    (status.error instanceof ApiError ? status.error.message : null) ??
    'Gateway binary absent or not configured';

  const isAvailable = healthData?.available === true;

  return (
    <section class="gateway-panel">
      <div class="panel-head">
        <h2 class="panel-title">Inference / Gateway</h2>
        <div class="panel-head-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              health.refresh();
              status.refresh();
            }}
            disabled={health.loading || status.loading}
          >
            {health.loading || status.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>Gateway surface unavailable.</strong> Backend unreachable — cannot read gateway status.
        </div>
      )}

      {!unreachable && gatewayUnavailable && (
        <div class="banner banner-warn">
          <strong>TensorZero gateway not running.</strong> {unavailableReason}
          <p class="banner-hint">
            Set <code>TENSORZERO_URL</code> to an external gateway or build{' '}
            <code>crates/tensorzero</code> to enable inference logging and routing.
            The run loop falls back to direct provider calls.
          </p>
        </div>
      )}

      {!unreachable && unexpectedError && !gatewayUnavailable && (
        <p class="action-error">Gateway error: {unexpectedError.message}</p>
      )}

      {(healthData || statusData) && (
        <div class="gateway-status-block">
          <div class="gateway-status-row">
            <ModeBadge
              mode={healthData?.mode ?? statusData?.mode}
              available={isAvailable}
            />
            <span class={`gateway-availability ${isAvailable ? 'tone-ok' : 'tone-muted'}`}>
              {isAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <div class="gateway-details">
            <StatusRow label="Gateway" value={statusData?.gateway ?? 'tensorzero'} />
            <StatusRow label="Mode" value={healthData?.mode ?? statusData?.mode} />
            <StatusRow label="Base URL" value={healthData?.baseUrl ?? statusData?.baseUrl} />
            <StatusRow label="Listen addr" value={healthData?.listenAddr ?? statusData?.listenAddr} />
            {statusData !== null && (
              <StatusRow label="Binary found" value={statusData.binaryFound ? 'yes' : 'no'} />
            )}
            {unavailableReason && !isAvailable && (
              <StatusRow label="Reason" value={unavailableReason} />
            )}
          </div>
        </div>
      )}

      {!unreachable && !health.loading && !status.loading && (
        <div class="gateway-inference-section">
          <InferenceForm available={isAvailable} />
        </div>
      )}

      {(health.loading || status.loading) && !healthData && !statusData && (
        <div class="panel-empty">Loading gateway status…</div>
      )}
    </section>
  );
}
