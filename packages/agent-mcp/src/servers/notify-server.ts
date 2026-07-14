import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.notify` — the MCP skin over the NOTIFY engine. One tool: `notify.send`
 * (post a human-facing notification, e.g. "delivery ready for review", to a
 * configured webhook).
 *
 * The package stays runtime-agnostic: it owns NO engine logic and assumes no
 * backing service. The host (backend) injects a concrete `NotifyPort` built
 * over the owned `@recoder/agent-notify` engine. Every handler degrades truthfully
 * — the engine returns a `not_configured` status (never throws, never fabricates a
 * send) when no webhook url is resolvable.
 */
export const notifyMcpServer: McpServerRegistration = {
  serverId: 'recoder.notify',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder Notify',
  transport: 'http',
  enabled: true,
  toolNames: ['notify.send'],
  metadata: { engine: 'notify' },
};

/**
 * The host-injected notify engine. Structurally satisfied by
 * `@recoder/agent-notify`'s `NotifyEngine`; typed loosely (`unknown` result) so
 * this package needs no dependency on the engine implementation.
 */
export type NotifyPort = {
  notify(input: {
    message: string;
    title?: string;
    level?: 'info' | 'warn' | 'error';
    url?: string;
  }): Promise<unknown>;
};

export function registerNotifyMcpTools(router: McpToolRouter, port: NotifyPort): void {
  router.register(notifyMcpServer, 'notify.send', async (input) => {
    const message = readRequiredString(input.args.message, 'message');
    const result = await port.notify({
      message,
      title: readString(input.args.title),
      level: readLevel(input.args.level),
      url: readString(input.args.url),
    });
    return { content: result, metadata: { engine: 'notify' } };
  });
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readLevel(value: unknown): 'info' | 'warn' | 'error' | undefined {
  return value === 'info' || value === 'warn' || value === 'error' ? value : undefined;
}
