# Slack for Agents Issues: apps-mobile

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-019
Title: `[SFA-019] apps/mobile: add delegated-task visibility and activation events`
Labels: `area/mobile`, `repo/apps-mobile`, `priority/p1`, `type/feature`
Repo: `apps/mobile`
Body:
- Objective: Surface delegated task status on mobile and emit activation telemetry.
- Scope:
  - task list/status UI
  - event emission hooks
- Dependencies: `SFA-012`
- Definition of Done:
  - mobile can display delegated task states and emit required events
- Test checklist:
  - [ ] UI state rendering test
  - [ ] analytics payload test
