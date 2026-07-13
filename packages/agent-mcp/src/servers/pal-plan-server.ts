import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.pal-plan` — the MCP skin over the in-proc PAL planning engine
 * (RECODER-ENGINES E11). One tool: `pal.plan` — given a task spec it returns a
 * governance decision `{ runtimeId, substrate, toolGrants[], risk, approvalRequired }`.
 *
 * This is a FAST, dependency-free complement to the external Python PAL MCP
 * server (`modules/communication/pal-mcp-server`); it does not replace or disturb it.
 *
 * The package stays runtime-agnostic: it owns NO planning logic and assumes no
 * config. The host (docker-backend) injects a concrete `PalPlanPort` backed by
 * `@recoder/pal`'s pure decision functions. The handler is DENY-BIASED and
 * degrade-safe — it never throws on missing/invalid input; the engine returns a
 * conservative default decision (`approvalRequired: true`, no grants) instead.
 */
export const palPlanMcpServer: McpServerRegistration = {
  serverId: 'recoder.pal-plan',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder PAL Planner',
  transport: 'http',
  enabled: true,
  toolNames: ['pal.plan'],
  metadata: { engine: 'pal-plan' },
};

/**
 * The host-injected PAL planning engine. Structurally satisfied by
 * `@recoder/pal`'s `computePalPlanDecision`; typed loosely (`unknown` result) so
 * this package needs no dependency on the engine implementation.
 */
export type PalPlanPort = {
  plan(taskSpec: unknown): Promise<unknown> | unknown;
};

export function registerPalPlanMcpTools(router: McpToolRouter, port: PalPlanPort): void {
  router.register(palPlanMcpServer, 'pal.plan', async (input) => {
    // DEGRADE-SAFE: never throw on a missing/invalid task spec. Accept the spec
    // under `taskSpec`/`task`, or fall back to the raw args object; the engine
    // returns a conservative deny-biased default when it cannot form a plan.
    const taskSpec = pickTaskSpec(input.args);
    const result = await port.plan(taskSpec);
    return { content: result, metadata: { engine: 'pal-plan' } };
  });
}

function pickTaskSpec(args: Record<string, unknown>): unknown {
  if (isRecord(args.taskSpec)) {
    return args.taskSpec;
  }
  if (isRecord(args.task)) {
    return args.task;
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
