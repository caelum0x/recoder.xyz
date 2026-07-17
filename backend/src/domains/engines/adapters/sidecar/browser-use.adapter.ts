/**
 * `BrowserUseAdapter` — the `EngineClientPort` over the OWNED `@recoder/agent-browser`
 * engine (the "browser agent" pillar). It composes the package's REAL engine over
 * a LAZILY-RESOLVED driver: the HTTP `browser-use` driver pointed at the
 * SUPERVISED sidecar's live base URL (`supervisor.handle('browser-use')`) or the
 * operator's `externalUrls['browser-use']`, else the env-selected default
 * (`BROWSER_USE_URL` → HTTP, else dynamic-imported puppeteer). Because the
 * sidecar comes up after boot, the URL is re-resolved on every `invoke` and the
 * cached engine is rebuilt when it changes — so calls actually reach the owned
 * Python engine once it is ready. It maps the engine's `navigate` / `extract` /
 * `screenshot` agent-loop steps onto the seam.
 *
 * REUSE: the concrete MCP wiring is the existing `registerBrowserUseMcpTools`
 * (agent-os/mcp/browser-use-engine.ts) — this adapter exports a binder factory
 * around it so the composer registers the real `browser.*` tools behind the
 * interop gate.
 *
 * DEGRADE-SAFE LAW: no puppeteer + no `BROWSER_USE_URL` ⇒ the driver reports
 * `not_configured`, so `health()` is a truthful `down` and every `invoke` returns
 * `{ ok:false, reason }` — never a fabricated page result, never a thrown seam.
 */
import {
  createBrowserEngine,
  createDefaultBrowserDriver,
  createHttpBrowserDriver,
} from '@recoder/agent-browser';
import type { BrowserDriver, BrowserEngine, BrowserEnv, BrowserFetch } from '@recoder/agent-browser';
import { registerBrowserUseMcpTools } from '../../browser-use-engine.js';
import type { McpToolRouter } from '@recoder/agent-mcp';
import { join } from 'node:path';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled, sidecarEnvFor } from '../../config.js';
import { DEFAULT_LOOPBACK } from '../../constants.js';
import { resolveEnginesPyRoot, resolveVenvPython } from './sidecar-paths.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import type { SidecarSpec, SidecarSupervisorPort } from '../../ports/sidecar-supervisor.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';

/** The browser agent-loop ops the adapter maps onto the engine. */
export type BrowserUseOp = 'navigate' | 'extract' | 'screenshot';

export interface BrowserUseAdapterDeps {
  readonly supervisor: SidecarSupervisorPort;
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Inject a concrete driver (defaults to the env-selected default driver). */
  readonly driver?: BrowserDriver;
  /** Inject fetch for the HTTP `browser-use` driver (defaults to global fetch). */
  readonly fetch?: BrowserFetch;
  /** Env subset the default driver reads (defaults to `process.env`). */
  readonly env?: BrowserEnv;
}

export class BrowserUseAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: BrowserUseAdapterDeps;
  private engine: BrowserEngine | null = null;
  /** The live URL the cached engine was built against (null = default driver). */
  private engineUrl: string | null = null;

  constructor(deps: BrowserUseAdapterDeps) {
    super('browser-use', 'sidecar');
    this.deps = deps;
  }

  /** Idempotent: build the engine once and (best-effort) start an HTTP sidecar. */
  override async start(): Promise<void> {
    if (!isEngineEnabled(this.deps.config, 'browser-use')) return;
    this.ensureEngine();
    const spec = this.spec();
    if (spec) {
      try {
        await this.deps.supervisor.ensureStarted(spec);
      } catch (err) {
        this.deps.log.warn({ err: message(err) }, 'browser-use sidecar ensureStarted failed — driver path only');
      }
    }
  }

  override async stop(): Promise<void> {
    this.engine = null;
    this.engineUrl = null;
    try {
      await this.deps.supervisor.stop('browser-use');
    } catch {
      // idempotent, degrade-safe
    }
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'browser-use')) {
      return fail('browser-use engine disabled by config', 'disabled');
    }
    const engine = this.ensureEngine();
    if (!engine) return fail('browser-use engine could not be constructed', 'unavailable');
    const op = call.op as BrowserUseOp;
    const input = (call.input ?? {}) as Record<string, unknown>;
    const url = typeof input.url === 'string' ? input.url : undefined;
    try {
      switch (op) {
        case 'navigate': {
          if (!url) return fail('browser-use navigate requires a url', 'bad_input');
          return classify(await engine.navigate(url));
        }
        case 'extract':
          return classify(await engine.extractText(url));
        case 'screenshot':
          return classify(await engine.screenshot(url));
        default:
          return fail(`unknown browser-use op '${call.op}'`, 'bad_op');
      }
    } catch (err) {
      return fail(`browser-use ${op} failed: ${message(err)}`);
    }
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'browser-use')) {
      return down('browser-use', 'sidecar', 'browser-use engine disabled by config');
    }
    // An externally-managed / supervised HTTP service is the strongest signal.
    const spec = this.spec();
    if (spec) {
      const sidecar = await this.deps.supervisor.health(spec).catch(() => null);
      if (sidecar && sidecar.status === 'up') return sidecar;
    }
    // Else the local puppeteer driver: truthful up only when puppeteer resolves.
    const puppeteer = await puppeteerAvailable();
    if (puppeteer) return up('browser-use', 'sidecar', { bindingPath: 'puppeteer' });
    return down(
      'browser-use',
      'sidecar',
      'no BROWSER_USE_URL sidecar and puppeteer not installed — browser agent unavailable',
    );
  }

  /**
   * Build (or rebuild) the engine over the CURRENT best driver. The supervised
   * sidecar publishes its base URL only after it has come up (post-boot), so the
   * live URL is re-resolved on every call and the cached engine is rebuilt when
   * it changes — never a one-shot snapshot (see engines-module `endpoint()`).
   */
  private ensureEngine(): BrowserEngine | null {
    const liveUrl = this.deps.driver ? null : this.resolveLiveUrl();
    if (this.engine && this.engineUrl === liveUrl) return this.engine;
    try {
      this.engine = createBrowserEngine({ driver: this.deps.driver ?? this.buildDriver(liveUrl) });
      this.engineUrl = liveUrl;
      return this.engine;
    } catch (err) {
      this.deps.log.warn({ err: message(err) }, 'browser-use engine construction failed');
      return null;
    }
  }

  /**
   * The live `browser-use` HTTP base: the supervised sidecar's handle first,
   * then the operator's external URL, else null (default-driver path).
   */
  private resolveLiveUrl(): string | null {
    const handle = this.deps.supervisor.handle('browser-use');
    if (handle?.transport === 'loopback-http' && handle.baseUrl) return handle.baseUrl;
    return this.deps.config.externalUrls['browser-use'] ?? null;
  }

  /** HTTP driver at the live URL when one exists, else the env-selected default. */
  private buildDriver(liveUrl: string | null): BrowserDriver {
    if (liveUrl) {
      return createHttpBrowserDriver({
        url: liveUrl,
        ...(this.deps.fetch ? { fetchImpl: this.deps.fetch } : {}),
      });
    }
    const env = this.deps.env ?? (process.env as BrowserEnv);
    return createDefaultBrowserDriver({ env, ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}) });
  }

  /**
   * Build the browser-use sidecar spec, or null when no sidecar is possible.
   * External URL → skip-spawn (the HTTP driver reaches the operator instance);
   * else resolve the venv python by convention and run `service_entry.py` in the
   * `engines/py/browser-use` dir with `PORT` in the minimal env (`/health`).
   */
  private spec(): SidecarSpec | null {
    const external = this.deps.config.externalUrls['browser-use'];
    const pyRoot = resolveEnginesPyRoot(this.deps.config.repoRoot);
    const engineDir = pyRoot ? join(pyRoot, 'browser-use') : null;
    const python = external
      ? null
      : this.deps.config.sidecarPython['browser-use'] ?? (engineDir ? resolveVenvPython(engineDir) : null);
    if (!external && !python) return null;
    const entrypoint = engineDir ? join(engineDir, 'service_entry.py') : null;
    const port = DEFAULT_LOOPBACK['browser-use'].split(':')[1] ?? '8897';
    const env: Record<string, string> = {
      PORT: port,
      ...(external ? { BROWSER_USE_URL: external } : {}),
      ...sidecarEnvFor(this.deps.config, 'browser-use'),
    };
    return {
      engineId: 'browser-use',
      transport: 'loopback-http',
      pythonPath: python,
      entrypoint,
      ...(engineDir ? { cwd: engineDir } : {}),
      listenAddr: DEFAULT_LOOPBACK['browser-use'],
      env,
    };
  }
}

/**
 * The MCP binder factory: registers the REAL `browser.navigate` / `browser.extract`
 * / `browser.screenshot` handlers (via the reused `registerBrowserUseMcpTools`)
 * onto the shared in-proc router. The composer passes the returned binder into
 * `getInteropHostBundle({ engineBinders })`.
 */
export function browserUseEngineBinder(
  deps: { driver?: BrowserDriver; fetch?: BrowserFetch; env?: BrowserEnv } = {},
): (router: McpToolRouter) => void {
  return (router) => registerBrowserUseMcpTools(router, deps);
}

/** Map an engine result's `status` onto the invoke discriminant. */
function classify(result: unknown): InvokeResult<unknown> {
  const record = (result ?? {}) as Record<string, unknown>;
  const status = record.status;
  if (status === 'not_configured') {
    return fail('browser driver not configured (no puppeteer / BROWSER_USE_URL)', 'unavailable');
  }
  if (status === 'error') {
    const reason = typeof record.error === 'string' ? record.error : 'browser operation failed';
    return fail(reason, 'browser_error');
  }
  return ok(result);
}

let puppeteerCache: boolean | null = null;
// Native dynamic import that survives CJS transpilation (keeps the real import()).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;

/** Truthful, cached check of whether the puppeteer driver can resolve. */
async function puppeteerAvailable(): Promise<boolean> {
  if (puppeteerCache !== null) return puppeteerCache;
  try {
    await dynamicImport('puppeteer');
    puppeteerCache = true;
  } catch {
    puppeteerCache = false;
  }
  return puppeteerCache;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
