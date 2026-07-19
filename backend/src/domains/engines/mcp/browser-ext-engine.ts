/**
 * `recoder.browser-use.ext` — the MCP skin over the DEEP browsing capabilities the
 * `browser-use` engine gained on top of navigate/extract/screenshot:
 *
 *  - `browser.extract_structured` → schema-guided extraction (a `{ name: selector }`
 *    map) over the live page's CDP; deterministic, no LLM.
 *  - `browser.run_task`           → the REAL `browser_use.Agent` multi-step LLM
 *    autonomy loop; truthfully degrades when no provider key is configured.
 *  - `browser.screenshot_annotate`→ a screenshot with labeled boxes over the
 *    interactive elements + the structured annotation list.
 *  - `browser.fill_form`          → interactive form-fill over live CDP, optional
 *    submit.
 *
 * This is DISTINCT from `recoder.browser-use` (navigate/extract/screenshot, the
 * `@recoder/agent-browser` engine) and `recoder.browser` (open/snapshot/verify).
 * The package ships no engine for these deep ops, so this backend module defines
 * the server descriptor locally and registers the handlers directly on the shared
 * router over the injected {@link BrowserExtPort} (the `BrowserUseAdapter.ext()`).
 *
 * IDENTITY: these tools are NOT tenant-subject-bearing — they operate on a
 * caller-supplied URL and DOM, never on tenant-partitioned state, so there is no
 * cross-tenant subject to bind (the closed cross-tenant class stays closed: no
 * tenant-keyed data path is introduced here). For the two side-effecting ops
 * (`run_task`, `fill_form`) the host-authorized caller IS threaded into the result
 * metadata as `requestedBy` for a truthful audit trail. Every call still traverses
 * interop's `authorize → risk → execute → audit` gate at the host boundary.
 *
 * Truthful degrade: an unbound port (adapter absent) or a `{ ok:false }` from the
 * client (no live sidecar, no LLM key, bad input) throws the real reason — the
 * interop host records it. Nothing is ever fabricated.
 */
import type { McpToolRouter, McpToolResult, McpToolCallInput } from '@recoder/agent-mcp';
import type { McpServerRegistration } from '@recoder/interop';
import type { InvokeResult } from '../types.js';
import type {
  BrowserExtPort,
  ExtractStructuredInput,
  FillFormInput,
  ScreenshotAnnotateInput,
} from '../adapters/sidecar/browser-ext.client.js';

/** The in-proc server id for the deep browser-use tools. */
export const BROWSER_EXT_SERVER_ID = 'recoder.browser-use.ext';

/**
 * The server descriptor for the gated registry catalog. The serial integrator
 * adds this to `IN_PROC_SERVERS` (registration) + `ENGINE_SERVERS` (owned
 * handlers) so the wiring guard passes and the tools are agent-visible + callable.
 */
export const browserExtMcpServer: McpServerRegistration = {
  serverId: BROWSER_EXT_SERVER_ID,
  kind: 'custom',
  displayName: 'Recoder Browser (deep: extract/run/annotate/fill)',
  transport: 'http',
  enabled: true,
  toolNames: [
    'browser.extract_structured',
    'browser.run_task',
    'browser.screenshot_annotate',
    'browser.fill_form',
  ],
  metadata: { engine: 'browser-use' },
};

/**
 * Register the four deep-browsing handlers on the shared router over the injected
 * {@link BrowserExtPort}. An absent port (adapter not bound in the composer) still
 * registers handlers that throw a truthful "not bound" — so the tools never 404
 * and the wiring guard passes; they just report unavailability on call.
 */
export function registerBrowserExtMcpTools(
  router: McpToolRouter,
  port: BrowserExtPort | null,
): void {
  router.register(browserExtMcpServer, 'browser.extract_structured', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const parsed: ExtractStructuredInput = {
      url: requireString(args.url, 'browser.extract_structured requires args.url'),
      fields: requireRecord(args.fields, 'browser.extract_structured requires args.fields (a { name: selector } map)'),
    };
    return unwrap(await engine.extractStructured(parsed), 'browser.extract_structured');
  });

  router.register(browserExtMcpServer, 'browser.run_task', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const task = requireString(args.task, 'browser.run_task requires args.task');
    const maxSteps = optionalNumber(args.maxSteps ?? args.max_steps);
    return unwrap(
      await engine.runTask({ task, ...(maxSteps != null ? { maxSteps } : {}) }),
      'browser.run_task',
      { requestedBy: requestedBy(input) },
    );
  });

  router.register(browserExtMcpServer, 'browser.screenshot_annotate', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const parsed: ScreenshotAnnotateInput = {
      url: requireString(args.url, 'browser.screenshot_annotate requires args.url'),
      ...(typeof (args.fullPage ?? args.full_page) === 'boolean'
        ? { fullPage: Boolean(args.fullPage ?? args.full_page) }
        : {}),
      ...(optionalNumber(args.maxElements ?? args.max_elements) != null
        ? { maxElements: optionalNumber(args.maxElements ?? args.max_elements) as number }
        : {}),
    };
    return unwrap(await engine.screenshotAnnotate(parsed), 'browser.screenshot_annotate');
  });

  router.register(browserExtMcpServer, 'browser.fill_form', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const parsed: FillFormInput = {
      url: requireString(args.url, 'browser.fill_form requires args.url'),
      fields: parseFields(args.fields),
      ...(optionalString(args.submit) ? { submit: optionalString(args.submit) as string } : {}),
    };
    return unwrap(await engine.fillForm(parsed), 'browser.fill_form', { requestedBy: requestedBy(input) });
  });
}

/**
 * The `EngineToolBinder` factory the composer passes into
 * `InteropHostBundle({ engineBinders })`. Pass `adapter.ext()` (or null when the
 * browser-use adapter is not bound).
 */
export function browserExtEngineBinder(port: BrowserExtPort | null): (router: McpToolRouter) => void {
  return (router) => registerBrowserExtMcpTools(router, port);
}

/** Map an `InvokeResult` onto the MCP result envelope; a failure throws the reason. */
function unwrap(
  result: InvokeResult<unknown>,
  tool: string,
  extraMeta: Record<string, unknown> = {},
): McpToolResult {
  if (!result.ok) {
    throw new Error(`${tool} failed: ${result.reason}`);
  }
  return {
    content: result.value,
    metadata: { engine: 'browser-use', tool, ...pruneUndefined(extraMeta) },
  };
}

/**
 * Boundary-validate + parse the `fields` array for `browser.fill_form`. A malformed
 * entry throws with the exact problem — never silently dropped.
 */
function parseFields(value: unknown): FillFormInput['fields'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('browser.fill_form requires a non-empty args.fields array of { selector, value, type? }');
  }
  return value.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const selector = requireString(record.selector, 'browser.fill_form each field requires a selector');
    return {
      selector,
      value: record.value,
      ...(optionalString(record.type) ? { type: optionalString(record.type) as string } : {}),
    };
  });
}

/**
 * The host-authorized actor for audit attribution. Prefers the edge-bound
 * authenticated principal (`input.caller.userId`) over the caller-controlled
 * `actor.agentId`; returns `'internal'` for a trusted non-edge in-proc call.
 */
function requestedBy(input: McpToolCallInput): string {
  const edge = input as McpToolCallInput & { caller?: { userId?: string } };
  const principal = typeof edge.caller?.userId === 'string' ? edge.caller.userId.trim() : '';
  if (principal) return principal;
  const agentId = typeof input.actor?.agentId === 'string' ? input.actor.agentId.trim() : '';
  return agentId || 'internal';
}

function requirePort(port: BrowserExtPort | null): BrowserExtPort {
  if (!port) {
    throw new Error('browser-use engine not bound in the engines composer — deep browser tools unavailable');
  }
  return port;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(errorMessage);
}

function requireRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0) {
    return value as Record<string, unknown>;
  }
  throw new Error(errorMessage);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined));
}
