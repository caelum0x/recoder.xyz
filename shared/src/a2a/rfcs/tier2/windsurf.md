# RFC: Tier-2 Connector - Windsurf

## Connector Identity
- Connector ID: `windsurf`
- Vendor / Product: Windsurf
- Proposed tier: Tier-2
- Owner: Interop Platform
- Status: draft

## Scope and Goals
- Problem statement: integrate Windsurf task execution with canonical A2A lifecycle and audit history.
- In-scope workflows: delegated coding tasks, state updates, result artifact handoff.
- Out-of-scope workflows: unmanaged external tool installation.

## Protocol and Contract Mapping
- A2A envelope intents used: `execute`, `status`, `tool_result`, `error`.
- Task envelope states used: `submitted`, `working`, `succeeded`, `failed`.
- Error taxonomy mapping notes: connector parse errors map to `INVALID_PAYLOAD`.

## Policy Mapping
- Required approval policy for privileged actions: mandatory for production deploy and secret mutation actions.
- Scope boundaries / tenant isolation: connector token scoped per workspace; no cross-workspace delegation.
- Audit events emitted: `task.delegated`, `task.state_changed`, `policy.decision`.
- Default rate limits: 20 delegated jobs/min per workspace.

## Security and Compliance
- Auth model: bridge token + service-side signature validation.
- Secret storage model: encrypted server-side environment references only.
- Data residency/compliance considerations: avoid storing raw prompt content in audit logs.

## Reliability and SLO Expectations
- Success-rate target: >= 97%.
- Median latency target: <= 4000ms for first status update.
- Failure classes and fallback behavior: transient failures retried up to 3 attempts.

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

