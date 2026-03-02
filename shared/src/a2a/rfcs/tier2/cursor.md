# RFC: Tier-2 Connector - Cursor

## Connector Identity
- Connector ID: `cursor`
- Vendor / Product: Anysphere Cursor
- Proposed tier: Tier-2
- Owner: Interop Platform
- Status: draft

## Scope and Goals
- Problem statement: enable delegated-task handoff from Recoder control plane into Cursor-driven flows.
- In-scope workflows: code edit delegation, diagnostics ingestion, status sync.
- Out-of-scope workflows: direct billing sync, unmanaged plugin execution.

## Protocol and Contract Mapping
- A2A envelope intents used: `execute`, `status`, `sync`, `error`.
- Task envelope states used: `submitted`, `working`, `succeeded`, `failed`, `blocked`.
- Error taxonomy mapping notes: transport/auth errors map to `CONNECTOR_UNREACHABLE`, policy denials to `POLICY_DENIED`.

## Policy Mapping
- Required approval policy for privileged actions: `policy_required=true` for deploy, secret, and destructive FS operations.
- Scope boundaries / tenant isolation: task scoped by `workspace_id` + `thread_id` + token scope claim.
- Audit events emitted: `task.delegated`, `policy.decision`, `task.state_changed`, `connector.result_received`.
- Default rate limits: 30 delegated jobs/min per workspace, burst 10.

## Security and Compliance
- Auth model: signed bridge token + optional HMAC envelope signature.
- Secret storage model: Recoder-managed secret vault; no secrets in connector payload body.
- Data residency/compliance considerations: restrict connector metadata to non-PII IDs.

## Reliability and SLO Expectations
- Success-rate target: >= 97%.
- Median latency target: <= 3500ms for first status ack.
- Failure classes and fallback behavior: timeout -> retry with backoff, hard failure -> terminal `failed`.

## Engineering Estimate
- Discovery: 2d.
- Adapter implementation: 4d.
- Contract tests: 2d.
- UI/analytics integration: 2d.
- Total estimate: 10d.

## Promotion Checklist
- [ ] Contract tests pass in CI (`connector-contract-tests`)
- [ ] Weekly evidence pack contains connector metrics
- [ ] No open P0 auth/policy/audit defects
- [ ] Runbook + rollback notes completed
- [ ] Product analytics events are emitted with `connector_id`

## Evidence Links
- Latest phase3 gates artifact: `logs/phase3-gates/*-connectors-support.json`
- Latest release evidence artifact: `logs/release-evidence/*-connectors-support.json`
- Related PRs/issues: SFA-021 / SFA-022

