# Tier-2 Connector RFC Template

## Connector Identity
- Connector ID:
- Vendor / Product:
- Proposed tier: Tier-2
- Owner:
- Status: draft

## Scope and Goals
- Problem statement:
- In-scope workflows:
- Out-of-scope workflows:

## Protocol and Contract Mapping
- A2A envelope intents used:
- Task envelope states used:
- Error taxonomy mapping notes:

## Policy Mapping
- Required approval policy for privileged actions:
- Scope boundaries / tenant isolation:
- Audit events emitted:
- Default rate limits:

## Security and Compliance
- Auth model:
- Secret storage model:
- Data residency/compliance considerations:

## Reliability and SLO Expectations
- Success-rate target:
- Median latency target:
- Failure classes and fallback behavior:

## Engineering Estimate
- Discovery:
- Adapter implementation:
- Contract tests:
- UI/analytics integration:
- Total estimate:

## Promotion Checklist
- [ ] Contract tests pass in CI (`connector-contract-tests`)
- [ ] Weekly evidence pack contains connector metrics
- [ ] No open P0 auth/policy/audit defects
- [ ] Runbook + rollback notes completed
- [ ] Product analytics events are emitted with `connector_id`

## Evidence Links
- Latest phase3 gates artifact:
- Latest release evidence artifact:
- Related PRs/issues:

