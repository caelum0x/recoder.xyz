/**
 * MCP binder for `recoder.browser`'s ADVERTISED-but-unbound tools — the fix for
 * the "browser.open/snapshot/verify are catalog-advertised, the external bridge
 * calls them, they 404" gap (mirror of `github/github-mcp.binder.ts`):
 *
 *  - `browser.open`     → navigate to a URL over the browser-use sidecar seam.
 *  - `browser.snapshot` → evidence screenshot (base64 PNG) of a URL / the page.
 *  - `browser.verify`   → the verification executor: navigate + assert expected
 *    text + evidence screenshot artifact + summary artifact (see
 *    `browser-verification.executor.ts`).
 *
 * All three drive the page through the injected `EngineClientPort` — the
 * `BrowserUseAdapter`, which re-resolves the SUPERVISED sidecar's live HTTP
 * base on every invoke, so calls reach the real Python engine once it is up.
 *
 * Truthful degrade: sidecar down ⇒ `browser.open` / `browser.snapshot` throw
 * the engine's real reason (the interop host records the error — never a
 * fabricated page), and `browser.verify` resolves to a `skipped` result with
 * `degraded: true` (a run that proved nothing never claims a verdict). The
 * composer passes this binder into `InteropHostBundle({ engineBinders })` so
 * every call still traverses the `authorize → risk → execute → audit` gate.
 */
import { browserMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { EngineClientPort } from '../../ports/engine-client.port.js';
import {
  executeBrowserVerification,
  type BrowserVerifyAssertion,
} from './browser-verification.executor.js';

/** Register the `recoder.browser` tool handlers over the browser-use client. */
export function browserSessionEngineBinder(
  client: EngineClientPort | null,
): (router: McpToolRouter) => void {
  return (router) => {
    router.register(browserMcpServer, 'browser.open', async (input) => {
      const engine = requireClient(client);
      const url = requireString(input.args.url, 'browser.open requires args.url');
      const result = await engine.invoke({ op: 'navigate', input: { url } });
      if (!result.ok) throw new Error(`browser.open failed: ${result.reason}`);
      return { content: result.value, metadata: { engine: 'browser-use', tool: 'browser.open' } };
    });

    router.register(browserMcpServer, 'browser.snapshot', async (input) => {
      const engine = requireClient(client);
      const url = optionalString(input.args.url);
      const result = await engine.invoke({ op: 'screenshot', input: url ? { url } : {} });
      if (!result.ok) throw new Error(`browser.snapshot failed: ${result.reason}`);
      return { content: result.value, metadata: { engine: 'browser-use', tool: 'browser.snapshot' } };
    });

    router.register(browserMcpServer, 'browser.verify', async (input) => {
      const engine = requireClient(client);
      const url = requireString(input.args.url, 'browser.verify requires args.url');
      const taskId = optionalString(input.args.taskId);
      const assertions = parseAssertions(input.args);
      const run = await executeBrowserVerification(engine, {
        url,
        ...(taskId ? { taskId } : {}),
        ...(assertions.length > 0 ? { assertions } : {}),
        ...(typeof input.args.screenshot === 'boolean' ? { screenshot: input.args.screenshot } : {}),
      });
      return {
        content: run.result,
        metadata: {
          engine: 'browser-use',
          tool: 'browser.verify',
          status: run.result.status,
          degraded: run.degraded,
          ...(run.reason ? { reason: run.reason } : {}),
        },
      };
    });
  };
}

/**
 * Boundary-validate the verify assertions: `args.expectText` (shorthand for one
 * assertion) and/or `args.assertions` (`[{ expected, target? }]`). A malformed
 * entry throws with the exact problem — never silently dropped.
 */
function parseAssertions(args: Record<string, unknown>): BrowserVerifyAssertion[] {
  const assertions: BrowserVerifyAssertion[] = [];
  const shorthand = optionalString(args.expectText);
  if (shorthand) assertions.push({ expected: shorthand });
  if (args.assertions === undefined) return assertions;
  if (!Array.isArray(args.assertions)) {
    throw new Error('browser.verify args.assertions must be an array of { expected, target? }');
  }
  for (const entry of args.assertions as unknown[]) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const expected = optionalString(record.expected);
    if (!expected) {
      throw new Error('browser.verify assertion requires a non-empty string `expected`');
    }
    const target = optionalString(record.target);
    assertions.push({ expected, ...(target ? { target } : {}) });
  }
  return assertions;
}

function requireClient(client: EngineClientPort | null): EngineClientPort {
  if (!client) {
    throw new Error('browser-use engine not bound in the engines composer — browser tools unavailable');
  }
  return client;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(errorMessage);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
