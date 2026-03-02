# Slack for Agents Issues: recoder-skill

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-018
Title: `[SFA-018] recoder-skill: add CI branding drift scan for legacy names`
Labels: `area/brand`, `repo/recoder-skill`, `priority/p1`, `type/chore`
Repo: `recoder-skill`
Body:
- Objective: Fail CI when public UI still contains legacy branding strings.
- Scope:
  - scanner for `kortix`, `suna`, `bolt.new`
  - CI integration
- Dependencies: none
- Definition of Done:
  - CI fails on legacy string match in scoped paths
- Test checklist:
  - [ ] positive detection test
  - [ ] false-positive exclusion test
