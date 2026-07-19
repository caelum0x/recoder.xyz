/**
 * `BrowserExtClient` — the raw HTTP client for the DEEP browsing endpoints the
 * `browser-use` Python sidecar exposes on top of the deterministic control plane
 * (`service_entry.py`): schema-guided `/extract_structured`, the LLM-driven
 * `/run_task` autonomy loop, annotated `/screenshot_annotate`, and interactive
 * `/fill_form`.
 *
 * WHY a separate client (not the `@recoder/agent-browser` engine): that engine's
 * `BrowserDriver` seam is deliberately narrow — `navigate` / `extractText` /
 * `screenshot` only. The four deep capabilities are sidecar-native (they need the
 * live Chrome/CDP the Python engine drives), so this client speaks directly to the
 * SAME live loopback base URL the adapter already resolves (`supervisor.handle`
 * → operator `externalUrls` → null), re-resolved per call so a sidecar that comes
 * up after boot is picked up.
 *
 * DEGRADE-SAFE LAW: no live sidecar URL ⇒ every method returns a truthful
 * `{ ok:false, code:'unavailable' }` (the deep ops have no puppeteer fallback —
 * they are Chrome/CDP-native). A `503` from the sidecar (browser absent, or
 * `/run_task` with no provider key) maps to `unavailable`; a `4xx` maps to
 * `bad_input`; any other non-2xx or thrown transport error is a truthful failure.
 * Nothing is ever fabricated.
 */
import type { BrowserFetch } from '@recoder/agent-browser';
import { fail, ok, type InvokeResult } from '../../types.js';

/** Schema-guided extraction: each field is a CSS selector or a selector spec. */
export interface ExtractStructuredInput {
  readonly url: string;
  /** `{ name: "css" | { selector, attr?, all? } }` — evaluated over live CDP. */
  readonly fields: Record<string, unknown>;
}

/** The LLM-driven multi-step task run (`browser_use.Agent`). */
export interface RunTaskInput {
  readonly task: string;
  /** Hard cap on agent steps (default 25 in the sidecar). */
  readonly maxSteps?: number;
}

/** Annotated screenshot: labeled boxes over interactive elements. */
export interface ScreenshotAnnotateInput {
  readonly url: string;
  readonly fullPage?: boolean;
  readonly maxElements?: number;
}

/** Interactive form-fill: set each field over CDP, optionally click submit. */
export interface FillFormInput {
  readonly url: string;
  readonly fields: ReadonlyArray<{ readonly selector: string; readonly value: unknown; readonly type?: string }>;
  readonly submit?: string;
}

/** The deep-browsing surface the MCP binder registers handlers over. */
export interface BrowserExtPort {
  extractStructured(input: ExtractStructuredInput): Promise<InvokeResult<unknown>>;
  runTask(input: RunTaskInput): Promise<InvokeResult<unknown>>;
  screenshotAnnotate(input: ScreenshotAnnotateInput): Promise<InvokeResult<unknown>>;
  fillForm(input: FillFormInput): Promise<InvokeResult<unknown>>;
}

export interface BrowserExtClientDeps {
  /** Re-resolve the live sidecar base URL per call (null ⇒ no sidecar reachable). */
  readonly resolveUrl: () => string | null;
  /** Injected fetch (defaults to global fetch). */
  readonly fetch?: BrowserFetch;
}

export class BrowserExtClient implements BrowserExtPort {
  private readonly resolveUrl: () => string | null;
  private readonly fetchImpl: BrowserFetch;

  constructor(deps: BrowserExtClientDeps) {
    this.resolveUrl = deps.resolveUrl;
    this.fetchImpl = deps.fetch ?? (globalThis.fetch as unknown as BrowserFetch);
  }

  async extractStructured(input: ExtractStructuredInput): Promise<InvokeResult<unknown>> {
    if (!isNonEmptyString(input.url)) return fail('extract_structured requires a url', 'bad_input');
    if (!isNonEmptyRecord(input.fields)) {
      return fail('extract_structured requires a non-empty fields map', 'bad_input');
    }
    return this.post('/extract_structured', { url: input.url, fields: input.fields });
  }

  async runTask(input: RunTaskInput): Promise<InvokeResult<unknown>> {
    if (!isNonEmptyString(input.task)) return fail('run_task requires a task string', 'bad_input');
    const body: Record<string, unknown> = { task: input.task };
    if (typeof input.maxSteps === 'number' && Number.isFinite(input.maxSteps)) {
      body.max_steps = input.maxSteps;
    }
    return this.post('/run_task', body);
  }

  async screenshotAnnotate(input: ScreenshotAnnotateInput): Promise<InvokeResult<unknown>> {
    if (!isNonEmptyString(input.url)) return fail('screenshot_annotate requires a url', 'bad_input');
    const body: Record<string, unknown> = { url: input.url };
    if (typeof input.fullPage === 'boolean') body.full_page = input.fullPage;
    if (typeof input.maxElements === 'number' && Number.isFinite(input.maxElements)) {
      body.max_elements = input.maxElements;
    }
    return this.post('/screenshot_annotate', body);
  }

  async fillForm(input: FillFormInput): Promise<InvokeResult<unknown>> {
    if (!isNonEmptyString(input.url)) return fail('fill_form requires a url', 'bad_input');
    if (!Array.isArray(input.fields) || input.fields.length === 0) {
      return fail('fill_form requires a non-empty fields array', 'bad_input');
    }
    for (const field of input.fields) {
      if (!field || !isNonEmptyString(field.selector)) {
        return fail('each fill_form field requires a selector', 'bad_input');
      }
    }
    const body: Record<string, unknown> = { url: input.url, fields: input.fields };
    if (isNonEmptyString(input.submit)) body.submit = input.submit;
    return this.post('/fill_form', body);
  }

  /**
   * POST a deep-op body to the live sidecar and normalize the response into an
   * `InvokeResult`. No live URL ⇒ truthful `unavailable` (deep ops are Chrome/CDP
   * -native — there is no local fallback). A `503` (browser absent / no LLM key)
   * ⇒ `unavailable`; a `4xx` ⇒ `bad_input`; any other non-2xx/thrown ⇒ failure.
   */
  private async post(path: string, body: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const base = this.resolveUrl();
    if (!base) {
      return fail(
        `browser-use deep op ${path} unavailable: no live sidecar (set BROWSER_USE_URL or start the supervised sidecar)`,
        'unavailable',
      );
    }
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      res = await this.fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return fail(`browser-use ${path} transport error: ${message(err)}`, 'transport');
    }
    const payload = await res.json().catch(() => null);
    if (res.ok) return ok(payload);
    const reason = extractError(payload) ?? `browser-use ${path} failed (HTTP ${res.status})`;
    if (res.status === 503) return fail(reason, 'unavailable');
    if (res.status >= 400 && res.status < 500) return fail(reason, 'bad_input');
    return fail(reason, 'browser_error');
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

function extractError(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return null;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
