# Slack for Agents Issues: packages

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-002
Title: `[SFA-002] packages: add shared SDK helpers for state mapping and error taxonomy`
Labels: `area/interop`, `repo/packages`, `priority/p0`, `type/feature`
Repo: `packages`
Body:
- Objective: Provide shared helper APIs for canonical task-state mapping and error taxonomy.
- Scope:
  - state transition helper
  - standardized connector error classes/codes
  - adapter utility exports
- Dependencies: `SFA-001`
- Definition of Done:
  - codex/claude adapters compile against helpers
  - no duplicated local schema/error mapping remains
- Test checklist:
  - [ ] state helper unit tests
  - [ ] error taxonomy unit tests
  - [ ] consumer compile smoke test
