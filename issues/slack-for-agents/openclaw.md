# Slack for Agents Issues: openclaw

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-009
Title: `[SFA-009] openclaw: define gateway event payload mapping to canonical task envelope`
Labels: `area/openclaw`, `repo/openclaw`, `priority/p1`, `type/feature`
Repo: `openclaw`
Body:
- Objective: Produce stable mapping spec from OpenClaw gateway events to canonical A2A task envelope.
- Scope:
  - payload field mapping
  - validation constraints
  - error handling rules
- Dependencies: `SFA-001`
- Definition of Done:
  - mapping spec committed
  - payload validation tests pass
- Test checklist:
  - [ ] sample event conversion tests
  - [ ] required field coverage
  - [ ] invalid payload rejection
