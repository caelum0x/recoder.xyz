# Slack for Agents Issues: apps-desktop

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-020
Title: `[SFA-020] apps/desktop: add delegated-task trigger and status polling`
Labels: `area/desktop`, `repo/apps-desktop`, `priority/p1`, `type/feature`
Repo: `apps/desktop`
Body:
- Objective: Enable desktop-triggered delegation and state monitoring.
- Scope:
  - trigger action
  - status polling/subscription
- Dependencies: `SFA-012`
- Definition of Done:
  - desktop can create delegated task and track status lifecycle
- Test checklist:
  - [ ] trigger action test
  - [ ] status update handling test
