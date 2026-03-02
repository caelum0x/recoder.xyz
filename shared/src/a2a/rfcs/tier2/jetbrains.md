# RFC: Tier-2 Connector - JetBrains

## Connector Identity
- Connector ID: `jetbrains`
- Vendor / Product: JetBrains IDE ecosystem
- Proposed tier: Tier-2
- Owner: Interop Platform
- Status: draft

## Scope and Goals
- Problem statement: support delegated multi-agent workflows targeting JetBrains IDE execution contexts.
- In-scope workflows: delegated task trigger, status stream, output artifact return.
- Out-of-scope workflows: plugin marketplace lifecycle management.

## Protocol and Contract Mapping
- A2A envelope intents used: `execute`, `status`, `review`, `error`.
- Task envelope states used: `submitted`, `working`, `succeeded`, `failed`, `blocked`.
- Error taxonomy mapping notes: policy denials map to `POLICY_DENIED`; unsupported operations to `CONNECTOR_UNSUPPORTED`.

## Policy Mapping
- Required approval policy for privileged actions: mandatory approval for commands that mutate infrastructure or secrets.
- Scope boundaries / tenant isolation: strict workspace and thread scope binding.
- Audit events emitted: `task.delegated`, `task.state_changed`, `policy.decision`, `task.completed`.
- Default rate limits: 20 delegated jobs/min per workspace.

## Security and Compliance
- Auth model: scoped bridge token with expiration + rotation.
- Secret storage model: server-side encrypted vault pointers only.
- Data residency/compliance considerations: retain minimal metadata in logs.

## Reliability and SLO Expectations
- Success-rate target: >= 96%.
- Median latency target: <= 4500ms first status heartbeat.
- Failure classes and fallback behavior: retry transient failures, emit terminal error for non-retryable policy/auth failures.

## Engineering Estimate
- Discovery: 3d.
- Adapter implementation: 5d.
- Contract tests: 2d.
- UI/analytics integration: 2d.
- Total estimate: 12d.

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

