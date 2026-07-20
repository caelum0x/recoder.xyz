-- Recoder Agent OS durable workflow definitions (Wave 4 P2: definitions survive restart).
--
-- A LOSSLESS jsonb document store the `PostgresWorkflowDefinitionStore` binds to,
-- shaped 1:1 on the `WorkflowDefinitionStore` seam consumed by `WorkflowService`:
--  - `agentos_workflow_definitions` one row per workflow definition, keyed by
--    `workflow_id`; `seq` preserves insertion order for list parity with the
--    in-memory store. The full `@recoder/agent-workflows` WorkflowDefinition is
--    round-tripped in `payload` (no lossy column mapping).
--
-- splitStatements-safe: plain DDL only, full-line comments only, no dollar-quoted
-- bodies, no semicolons inside statements.

create table if not exists agentos_workflow_definitions (
  workflow_id text primary key,
  payload jsonb not null,
  seq bigserial not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agentos_workflow_definitions_seq_idx
  on agentos_workflow_definitions (seq);
