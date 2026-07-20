/**
 * `AgentEventPort` — the NARROW outbound event-bus slice the conductor run flow
 * consumes: publish ONE lifecycle event onto the native openfang kernel event bus
 * so kernel triggers can fire background Hands (the event-bus ↔ RunEvents bridge,
 * §4c of the openfang fusion design).
 *
 * This is a CONSUMER-owned port (declared here so the conductor never imports the
 * engines domain). The engines-domain `AgentEngineService.publishEvent`
 * (`engines.agentEngine()`) backs it — adapted to this thin `publish(event)` shape
 * at the composition root, exactly as the beads issue-graph facet backs
 * `IssueGraphWriter`.
 *
 * DEGRADE LAW: publishing is a fire-and-forget lifecycle SIGNAL, never a blocking
 * dependency. The implementation never throws across the seam; when the openfang
 * engine is absent/boot-failed it resolves an EMPTY fired list (no trigger fired,
 * no fabricated dispatch). Callers must treat a fault as a truthful "no trigger
 * fired" and MUST NOT let it stall or reject the terminal-event path.
 */

/**
 * A lifecycle event pushed onto the kernel bus. `type` is the routing key kernel
 * triggers match on (e.g. `workspace.completed`); the remaining fields are the
 * event payload the fired Hand's prompt template can interpolate. Kept open
 * (`[key: string]: unknown`) so the conductor can attach run context without this
 * port needing to know the kernel's trigger schema.
 */
export interface AgentBusEvent {
  /** The routing key kernel triggers match on (e.g. `workspace.completed`). */
  readonly type: string;
  /** The workspace whose run produced this event (when known). */
  readonly workspaceId?: string;
  /** The bd/task the workspace served (when known). */
  readonly taskId?: string;
  /** The terminal outcome (`completed` / `failed`) when this is a run-completion event. */
  readonly outcome?: string;
  readonly [key: string]: unknown;
}

/**
 * The narrow outbound event slice. `publish` returns the triggers the kernel fired
 * in response (each an `{ agentId, message }`) so a caller MAY observe the fan-out;
 * the conductor completion path ignores the return (fire-and-forget). Never throws;
 * an absent/boot-failed engine resolves `[]` (no trigger fired), never fabricated.
 */
export interface AgentEventPort {
  publish(event: AgentBusEvent): Promise<readonly { agentId: string; message: string }[]>;
}
