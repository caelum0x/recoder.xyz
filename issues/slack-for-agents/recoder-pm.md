# Slack for Agents Issues: recoder-pm

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-013
Title: `[SFA-013] recoder-pm: emit standardized interop and funnel analytics events`
Labels: `area/analytics`, `repo/recoder-pm`, `priority/p1`, `type/feature`
Repo: `recoder-pm`
Body:
- Objective: Emit consistent events for delegated task lifecycle and funnel stages.
- Scope:
  - event taxonomy implementation
  - include connector + trace fields
- Dependencies: `SFA-012`
- Definition of Done:
  - events visible in analytics with expected fields
- Test checklist:
  - [ ] event schema validation
  - [ ] analytics pipeline smoke test
