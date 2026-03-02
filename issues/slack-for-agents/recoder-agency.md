# Slack for Agents Issues: recoder-agency

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-006
Title: `[SFA-006] recoder-agency: fix static chunk/media serving and MIME failures`
Labels: `area/frontend`, `repo/recoder-agency`, `priority/p0`, `type/bug`
Repo: `recoder-agency`
Body:
- Objective: Eliminate `_next/static` 404 and MIME-type errors in production.
- Scope:
  - asset path/static hosting verification
  - reverse proxy/static routing fix
  - cache invalidation strategy
- Dependencies: none
- Definition of Done:
  - no static chunk 404/MIME errors in smoke run
- Test checklist:
  - [ ] browser console clean for static assets
  - [ ] CSS/JS served with correct content-type
  - [ ] login page renders fully styled
