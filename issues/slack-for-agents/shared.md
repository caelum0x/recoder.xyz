# Slack for Agents Issues: shared

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-001
Title: `[SFA-001] shared: publish canonical TaskEnvelope and AuditEvent schemas`
Labels: `area/interop`, `repo/shared`, `priority/p0`, `type/feature`
Repo: `shared`
Body:
- Objective: Publish versioned canonical schemas for `TaskEnvelope` and `AuditEvent`.
- Scope:
  - include required fields: `workspace_id`, `thread_id`, `trace_id`
  - document lifecycle state fields and validation constraints
  - export schema package for downstream adapters
- Dependencies: none
- Definition of Done:
  - schema package version tagged
  - validation tests pass
  - downstream repos can import without local forks
- Test checklist:
  - [ ] required fields enforced
  - [ ] invalid payloads rejected
  - [ ] package import smoke test in consumer repo

## SFA-021
Title: `[SFA-021] shared: create Tier-2 connector RFC templates and initial drafts`
Labels: `area/interop`, `repo/shared`, `priority/p2`, `type/design`
Repo: `shared`
Body:
- Objective: Prepare Tier-2 RFC pack for `cursor`, `windsurf`, `replit`, `vscode-copilot`, `jetbrains`.
- Scope:
  - common RFC template
  - one initial draft per connector
  - policy mapping matrix section
- Dependencies: `SFA-017`
- Definition of Done:
  - RFC drafts exist for all Tier-2 connectors
- Test checklist:
  - [ ] required sections present in each RFC
