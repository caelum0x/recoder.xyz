# Slack for Agents Issues: app

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-008
Title: `[SFA-008] app: align Better Auth session handling across product surfaces`
Labels: `area/auth`, `repo/app`, `priority/p0`, `type/feature`
Repo: `app`
Body:
- Objective: Ensure consistent session lifecycle for web/frontend surfaces.
- Scope:
  - session cookie/token consistency
  - callback/session refresh correctness
- Dependencies: `SFA-007`
- Definition of Done:
  - cross-surface session persistence tests pass
- Test checklist:
  - [ ] login in one surface, continue in another
  - [ ] protected routes accessible with active session
  - [ ] logout invalidates everywhere
