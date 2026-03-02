# Slack for Agents Issues: recoder-frontend

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-007
Title: `[SFA-007] recoder-frontend: fix sign-in/sign-up integration and remove placeholder Supabase paths`
Labels: `area/auth`, `repo/recoder-frontend`, `priority/p0`, `type/bug`
Repo: `recoder-frontend`
Body:
- Objective: Ensure production auth routes use Better Auth and remove placeholder Supabase endpoints.
- Scope:
  - route mapping for sign-in/sign-up/social auth
  - env and callback URL cleanup
- Dependencies: none
- Definition of Done:
  - signup/signin successful in production
  - zero `placeholder.supabase` requests
- Test checklist:
  - [ ] email sign-in
  - [ ] social sign-in
  - [ ] network trace validation
