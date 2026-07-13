/**
 * pal-plan-engine — docker-backend's concrete binding for the `recoder.pal-plan`
 * MCP server. It composes the OWNED `@recoder/pal` planning logic
 * (`computePalPlanDecision`, which reuses `planTask` and friends) into a
 * `PalPlanPort`, then registers the package's real `pal.plan` handler behind the
 * interop gate.
 *
 * This is the fast, in-proc PAL path (RECODER-ENGINES E11) — a dependency-free
 * complement to the external Python PAL MCP server (`modules/communication/pal-mcp-server`). It is
 * ADDITIVE and does not disturb that server.
 *
 * Nothing here fakes success. With a missing/malformed task spec the engine
 * returns a truthful `status: 'degraded_default'` carrying the most-restrictive,
 * deny-biased decision (`approvalRequired: true`, zero tool grants) — it never
 * throws and never fabricates a permissive grant. The only external dependency
 * (the clock) is injectable.
 */
import { registerPalPlanMcpTools as registerPalPlanToolHandlers } from '@recoder/agent-mcp';
import type { McpToolRouter, PalPlanPort } from '@recoder/agent-mcp';
import { computePalPlanDecision, type PalPlanOptions } from '@recoder/pal';

export type PalPlanEngineDeps = {
  /** Injectable clock used for approval timestamps. Defaults to wall clock. */
  now?: () => string;
};

/**
 * Register the REAL in-proc PAL planning handler on the router. The planning
 * decision comes entirely from `@recoder/pal`'s pure functions, so no service,
 * key, or binary is required — the desktop boots and `pal.plan` stays callable
 * with zero external dependencies present.
 */
export function registerPalPlanMcpTools(
  router: McpToolRouter,
  deps: PalPlanEngineDeps = {},
): void {
  const options: PalPlanOptions = { now: deps.now };
  const port: PalPlanPort = {
    plan: (taskSpec) => computePalPlanDecision(taskSpec, options),
  };

  registerPalPlanToolHandlers(router, port);
}

export { palPlanMcpServer } from '@recoder/agent-mcp';
