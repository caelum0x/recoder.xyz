# Slack for Agents Issues: docker-backend

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-003
Title: `[SFA-003] docker-backend: enforce canonical task lifecycle transitions`
Labels: `area/a2a`, `repo/docker-backend`, `priority/p0`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Enforce canonical task lifecycle (`submitted -> working -> terminal`) in orchestrator.
- Scope:
  - reject illegal state jumps
  - emit deterministic transition errors
  - log transitions with `trace_id`
- Dependencies: `SFA-001`, `SFA-002`
- Definition of Done:
  - integration test covers valid/invalid transitions
  - runtime blocks invalid transitions
- Test checklist:
  - [ ] happy-path lifecycle test
  - [ ] invalid jump rejection test
  - [ ] trace logging assertion

## SFA-004
Title: `[SFA-004] docker-backend: add policy hook middleware for privileged actions`
Labels: `area/security`, `repo/docker-backend`, `priority/p0`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Route privileged connector actions through policy/approval middleware.
- Scope:
  - middleware entrypoint for privileged actions
  - policy decision payload + audit event
  - consistent policy-blocked error response
- Dependencies: `SFA-003`
- Definition of Done:
  - privileged action without approval returns policy-blocked error
  - audit event emitted for allow/deny decisions
- Test checklist:
  - [ ] deny-path test
  - [ ] allow-path test
  - [ ] audit event emission test

## SFA-010
Title: `[SFA-010] docker-backend: implement OpenClaw adapter endpoint with trace propagation`
Labels: `area/a2a`, `repo/docker-backend`, `priority/p1`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Add adapter endpoint that converts OpenClaw events into traceable A2A tasks.
- Scope:
  - ingest endpoint
  - trace propagation
  - task creation + lifecycle bootstrapping
- Dependencies: `SFA-009`, `SFA-003`
- Definition of Done:
  - OpenClaw event creates task with `trace_id`
- Test checklist:
  - [ ] endpoint contract test
  - [ ] task creation integration test
  - [ ] trace propagation assertion
