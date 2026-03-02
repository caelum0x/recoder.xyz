# RFC: Tier-2 Connector - VSCode Copilot

## Connector Identity
- Connector ID: `vscode-copilot`
- Vendor / Product: GitHub Copilot (VSCode)
- Proposed tier: Tier-2
- Owner: Interop Platform
- Status: draft

## Scope and Goals
- Problem statement: map delegated tasks into VSCode Copilot-compatible execution and status telemetry.
- In-scope workflows: delegation from control plane, status updates, result summaries.
- Out-of-scope workflows: local extension marketplace management.

## Protocol and Contract Mapping
- A2A envelope intents used: `execute`, `status`, `sync`, `error`.
- Task envelope states used: `submitted`, `working`, `succeeded`, `failed`.
- Error taxonomy mapping notes: auth scope failures map to `AUTH_INVALID_SCOPE`.

## Policy Mapping
- Required approval policy for privileged actions: explicit approval for destructive edits and command execution.
- Scope boundaries / tenant isolation: token scope enforcement by workspace + connector session.
- Audit events emitted: `task.delegated`, `policy.decision`, `task.state_changed`.
- Default rate limits: 25 delegated jobs/min per workspace.

## Security and Compliance
- Auth model: bridge session token + admin route token on orchestration edge.
- Secret storage model: vault-backed references only.
- Data residency/compliance considerations: ensure logs contain IDs, not raw secrets.

## Reliability and SLO Expectations
- Success-rate target: >= 97%.
- Median latency target: <= 3000ms first task status.
- Failure classes and fallback behavior: retry on transient transport failures, fail-fast on policy/auth failures.

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

