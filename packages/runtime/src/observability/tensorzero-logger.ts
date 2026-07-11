/**
 * TensorZero inference logger — runtime seam client.
 *
 * Consumed by the run loop for provider calls + inference logging when the
 * TensorZero gateway is available. Degrade-safe: when TENSORZERO_URL is not
 * set and no managed binary was reported healthy this module returns truthful
 * "gateway unavailable" results; the run loop falls back to direct provider
 * calls unchanged.
 *
 * This is a THIN CLIENT — it does not spawn processes. The docker-backend
 * supervisor (tensorzero-client.ts) owns the binary lifecycle; this file reads
 * the resolved URL from env and forwards inference calls over HTTP.
 *
 * ENV VARS (read-only, never written here):
 *   TENSORZERO_URL             — base URL of the gateway (set by the supervisor
 *                                or by the operator for an external instance).
 *   TENSORZERO_GATEWAY_API_KEY — optional bearer token.
 */

/** Resolution: read the gateway URL from env (supervisor publishes it). */
function resolveGatewayUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env['TENSORZERO_URL']?.trim() || undefined;
}

export interface TensorzeroLoggerOptions {
  /** Override the gateway URL (useful in tests). */
  gatewayUrl?: string;
  /** Timeout per inference call in ms (default 60 000). */
  timeoutMs?: number;
}

export interface TensorzeroLogRecord {
  /** Whether this call was routed through the gateway. */
  routed: boolean;
  /** Gateway-assigned inference_id (only when routed=true). */
  inference_id?: string;
  /** Token usage reported by the gateway. */
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Human-readable reason when routed=false. */
  reason?: string;
}

export type TensorzeroLogInput = {
  /** TensorZero function name. */
  function_name: string;
  /** Input messages / structured content. */
  input: { messages: Array<{ role: string; content: string | unknown[] }>; [k: string]: unknown };
  /** Optional episode ID for multi-turn grouping. */
  episode_id?: string;
  [key: string]: unknown;
};

/**
 * TensorZeroLogger — runtime-side thin client for inference logging.
 *
 * Usage:
 *   const logger = new TensorZeroLogger();
 *   const result = await logger.log({ function_name: 'my-fn', input: { messages: [...] } });
 *   if (!result.routed) { // fall back to direct provider call }
 */
export class TensorZeroLogger {
  readonly #gatewayUrl: string | undefined;
  readonly #timeoutMs: number;

  constructor(options: TensorzeroLoggerOptions = {}) {
    this.#gatewayUrl = options.gatewayUrl ?? resolveGatewayUrl();
    this.#timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** Whether the gateway is configured (URL is set). Truthful — never faked. */
  get configured(): boolean {
    return this.#gatewayUrl !== undefined;
  }

  /** The resolved gateway URL (undefined when unconfigured). */
  get gatewayUrl(): string | undefined {
    return this.#gatewayUrl;
  }

  /**
   * Log an inference call to the TensorZero gateway. Returns a truthful record:
   * - `routed: true` + `inference_id` when the gateway accepted the call.
   * - `routed: false` + `reason` when the gateway is unavailable or the call
   *   failed — the run loop should then use a direct provider call.
   *
   * Never throws; callers must not assume the gateway is available.
   */
  async log(input: TensorzeroLogInput): Promise<TensorzeroLogRecord> {
    if (!this.#gatewayUrl) {
      return {
        routed: false,
        reason: 'TensorZero gateway unconfigured (TENSORZERO_URL not set) — using direct provider call',
      };
    }

    const apiKey = process.env['TENSORZERO_GATEWAY_API_KEY'];
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const resp = await fetch(`${this.#gatewayUrl}/inference`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      const text = await resp.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

      if (!resp.ok) {
        const msg = (json['error'] as string | undefined) ?? `HTTP ${resp.status}`;
        return { routed: false, reason: `TensorZero ${resp.status}: ${msg}` };
      }

      return {
        routed: true,
        inference_id: json['inference_id'] as string | undefined,
        usage: json['usage'] as TensorzeroLogRecord['usage'],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { routed: false, reason: `TensorZero request error: ${msg}` };
    }
  }

  /**
   * Probe the gateway /health endpoint. Returns { available: true } on 200,
   * otherwise { available: false, reason: "..." }. Never throws.
   */
  async health(): Promise<{ available: boolean; reason?: string }> {
    if (!this.#gatewayUrl) {
      return {
        available: false,
        reason: 'TensorZero gateway unconfigured (TENSORZERO_URL not set)',
      };
    }
    try {
      const resp = await fetch(`${this.#gatewayUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      return {
        available: resp.ok,
        reason: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : 'health check failed',
      };
    }
  }
}

/** Convenience factory. */
export function createTensorZeroLogger(options?: TensorzeroLoggerOptions): TensorZeroLogger {
  return new TensorZeroLogger(options);
}
