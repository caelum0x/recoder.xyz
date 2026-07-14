/**
 * notify-engine — backend's concrete binding for the `recoder.notify` MCP
 * server. It composes the OWNED `@recoder/agent-notify` engine over the global
 * `fetch` + `process.env` (both injectable), then registers the package's real
 * `notify.send` handler behind the interop gate.
 *
 * Nothing here fakes success. With no webhook url resolvable (no `input.url`, no
 * `RECODER_NOTIFY_URL`, no `SLACK_WEBHOOK_URL`), the engine returns a truthful
 * `status: 'not_configured'` — the desktop boots and the tool stays callable with
 * zero external services present. A non-2xx / thrown request returns
 * `status: 'error'`; a 2xx returns `status: 'sent'`.
 */
import { registerNotifyMcpTools as registerNotifyToolHandlers } from '@recoder/agent-mcp';
import { createNotifyEngine } from '@recoder/agent-notify';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { NotifyEnv, NotifyFetch } from '@recoder/agent-notify';

export type NotifyEngineDeps = {
  /** Injectable fetch (defaults to the global `fetch`). */
  fetch?: NotifyFetch;
  /** Env subset read to resolve the webhook. Defaults to process.env. */
  env?: NotifyEnv;
};

/**
 * Register the REAL notify handler on the router. The webhook is resolved by the
 * engine from `input.url ?? RECODER_NOTIFY_URL ?? SLACK_WEBHOOK_URL`
 * (degrade-safe to `not_configured` when none is present).
 */
export function registerNotifyMcpTools(
  router: McpToolRouter,
  deps: NotifyEngineDeps = {},
): void {
  const doFetch: NotifyFetch =
    deps.fetch ?? (globalThis.fetch as unknown as NotifyFetch);
  const env = deps.env ?? (process.env as NotifyEnv);

  const engine = createNotifyEngine({ fetch: doFetch, env });

  registerNotifyToolHandlers(router, engine);
}

export { notifyMcpServer } from '@recoder/agent-mcp';
