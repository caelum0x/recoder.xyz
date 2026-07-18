/**
 * `PostgresWorkflowDefinitionStore` — the DURABLE driver behind
 * {@link WorkflowDefinitionStore} (Wave 4 P2: workflow definitions survive
 * restart). Binds to the persistence domain's `QueryExecutor` seam (never `pg`
 * directly) over the `agentos_0005_workflow_definitions` table:
 *  - `agentos_workflow_definitions` — one jsonb document per definition, keyed
 *    `workflow_id`; `seq` preserves insertion order so `list()` ordering matches
 *    the in-memory store (contract parity).
 *
 * Degrade posture: NEVER fakes success. When the pool is down a query rejects and
 * the caller (routes → 503) surfaces the truth; the composer only selects this
 * driver when an executor is injected. `upsert` is last-write-wins (parity with
 * the in-memory store's `Map.set`); `delete` returns whether a row was removed.
 */
import type { WorkflowDefinition } from '@recoder/agent-workflows';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { WorkflowDefinitionStore } from '../services/workflow.service.js';

const UPSERT_SQL = `insert into agentos_workflow_definitions (workflow_id, payload)
   values (:workflow_id, :payload::jsonb)
   on conflict (workflow_id)
   do update set payload = excluded.payload, updated_at = now()`;

const GET_SQL = `select payload from agentos_workflow_definitions
   where workflow_id = :workflow_id`;

const LIST_SQL = `select payload from agentos_workflow_definitions order by seq asc`;

const DELETE_SQL = `delete from agentos_workflow_definitions where workflow_id = :workflow_id`;

export class PostgresWorkflowDefinitionStore implements WorkflowDefinitionStore {
  constructor(private readonly executor: QueryExecutor) {}

  async upsert(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    await this.executor.mutate(UPSERT_SQL, {
      workflow_id: definition.workflowId,
      payload: JSON.stringify(definition),
    });
    return definition;
  }

  async get(workflowId: string): Promise<WorkflowDefinition | null> {
    const row = await this.executor.one<QueryRow>(GET_SQL, { workflow_id: workflowId });
    return (row?.payload as WorkflowDefinition | undefined) ?? null;
  }

  async list(): Promise<WorkflowDefinition[]> {
    const rows = await this.executor.read<QueryRow>(LIST_SQL);
    return rows.map((row) => row.payload as WorkflowDefinition);
  }

  async delete(workflowId: string): Promise<boolean> {
    const affected = await this.executor.mutate(DELETE_SQL, { workflow_id: workflowId });
    return affected > 0;
  }
}
