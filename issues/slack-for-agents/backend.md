# Slack for Agents Issues: backend

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-011
Title: `[SFA-011] backend: persist interop trace fields in logs and response metadata`
Labels: `area/backend`, `repo/backend`, `priority/p1`, `type/feature`
Repo: `backend`
Body:
- Objective: Add interop trace observability in backend responses/logs.
- Scope:
  - include `trace_id`, `connector_id` metadata in relevant responses
  - structured logging for interop requests
- Dependencies: `SFA-010`
- Definition of Done:
  - trace fields visible in logs and response metadata
- Test checklist:
  - [ ] structured log assertions
  - [ ] response metadata contract test
