/**
 * `WorkflowService` — workflow-definition CRUD + run dispatch for the control
 * plane. It COMPOSES the frozen `@recoder/agent-workflows` contracts and never
 * re-implements them:
 *   - definitions are validated by the package's `validateWorkflowDefinition`
 *     (legality is never re-derived here);
 *   - dispatch runs a stored definition through the injected `WorkflowDriver`
 *     (`start(definition) -> WorkflowRun`) — the SAME driver contract the
 *     package publishes.
 *
 * Degrade-safe by construction: CRUD works over an in-memory {@link
 * WorkflowDefinitionStore} (a postgres store over the persistence executor is
 * the integration follow-up behind the same seam); dispatch with NO driver wired
 * returns a truthful `not_configured` outcome rather than faking a launch.
 */
import {
  validateWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowDriver,
  type WorkflowRun,
} from '@recoder/agent-workflows';

/** Raised when a definition fails the package's structural validation. */
export class WorkflowValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`invalid workflow definition: ${errors.join('; ')}`);
    this.name = 'WorkflowValidationError';
  }
}

/** The outcome of a dispatch request — truthful whether or not a driver is wired. */
export interface WorkflowDispatchResult {
  readonly dispatched: boolean;
  /** `dispatched` ⇒ the driver's run; `not_configured` ⇒ no driver wired. */
  readonly status: 'dispatched' | 'not_configured';
  readonly workflowId: string;
  readonly run?: WorkflowRun;
  readonly reason?: string;
}

/** Storage seam for workflow definitions. In-memory now; postgres at integration. */
export interface WorkflowDefinitionStore {
  upsert(definition: WorkflowDefinition): WorkflowDefinition | Promise<WorkflowDefinition>;
  get(workflowId: string): (WorkflowDefinition | null) | Promise<WorkflowDefinition | null>;
  list(): WorkflowDefinition[] | Promise<WorkflowDefinition[]>;
  delete(workflowId: string): boolean | Promise<boolean>;
}

/** The zero-dependency store (tests + no-DB degrade). */
export class InMemoryWorkflowDefinitionStore implements WorkflowDefinitionStore {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  upsert(definition: WorkflowDefinition): WorkflowDefinition {
    this.definitions.set(definition.workflowId, definition);
    return definition;
  }
  get(workflowId: string): WorkflowDefinition | null {
    return this.definitions.get(workflowId) ?? null;
  }
  list(): WorkflowDefinition[] {
    return [...this.definitions.values()];
  }
  delete(workflowId: string): boolean {
    return this.definitions.delete(workflowId);
  }
}

export interface WorkflowServiceDeps {
  readonly store: WorkflowDefinitionStore;
  /**
   * The dispatch seam — the package's `WorkflowDriver`. Absent (or `null`) ⇒
   * `dispatch` degrades truthfully to `not_configured` (never a faked run).
   * Bootstrap injects a concrete driver (e.g. one skinning
   * `AgentOsWorkflowRunner`) after the runtime seams are built.
   */
  readonly driver?: WorkflowDriver | null;
}

export class WorkflowService {
  private readonly store: WorkflowDefinitionStore;
  private readonly driver: WorkflowDriver | null;

  constructor(deps: WorkflowServiceDeps) {
    this.store = deps.store;
    this.driver = deps.driver ?? null;
  }

  /** True when a dispatch driver is wired (surfaced in health / dispatch reasons). */
  get dispatchConfigured(): boolean {
    return this.driver !== null;
  }

  async list(): Promise<WorkflowDefinition[]> {
    return this.store.list();
  }

  async get(workflowId: string): Promise<WorkflowDefinition | null> {
    return this.store.get(workflowId);
  }

  /**
   * Create or replace a definition. Validates via the package contract FIRST and
   * throws {@link WorkflowValidationError} (the route maps it to a 400) — an
   * invalid definition is never persisted.
   */
  async save(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    const errors = validateWorkflowDefinition(definition);
    if (errors.length > 0) throw new WorkflowValidationError(errors);
    return this.store.upsert(definition);
  }

  /** Delete a definition. Returns false when the id was unknown (never throws). */
  async delete(workflowId: string): Promise<boolean> {
    return this.store.delete(workflowId);
  }

  /**
   * Dispatch a stored definition through the injected `WorkflowDriver`. Returns a
   * truthful outcome:
   *   - unknown id           ⇒ throws nothing; caller checks `get` first (route 404s);
   *   - no driver wired      ⇒ `{ dispatched:false, status:'not_configured' }`;
   *   - driver wired         ⇒ `{ dispatched:true, status:'dispatched', run }`.
   */
  async dispatch(definition: WorkflowDefinition): Promise<WorkflowDispatchResult> {
    if (!this.driver) {
      return {
        dispatched: false,
        status: 'not_configured',
        workflowId: definition.workflowId,
        reason: 'no workflow driver is wired — dispatch unavailable',
      };
    }
    const run = await this.driver.start(definition);
    return { dispatched: true, status: 'dispatched', workflowId: definition.workflowId, run };
  }
}
