# Slack for Agents Issues: recoder-studio

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

## SFA-005
Title: `[SFA-005] recoder-studio: remove production build bypasses and restore strict gates`
Labels: `area/reliability`, `repo/recoder-studio`, `priority/p0`, `type/chore`
Repo: `recoder-studio`
Body:
- Objective: Remove `ignoreBuildErrors`/`ignoreDuringBuilds` and keep strict quality gates.
- Scope:
  - update Next config
  - fix blocking lint/type errors
- Dependencies: none
- Definition of Done:
  - production build passes without bypass flags
- Test checklist:
  - [ ] `pnpm lint` passes
  - [ ] `pnpm typecheck` passes
  - [ ] `pnpm build` passes

## SFA-012
Title: `[SFA-012] recoder-studio: ship MVP interop UI (delegate/status/approval timeline) behind feature flag`
Labels: `area/product`, `repo/recoder-studio`, `priority/p1`, `type/feature`
Repo: `recoder-studio`
Body:
- Objective: Provide first user-facing Slack-for-Agents workflow in Studio.
- Scope:
  - delegate action UI
  - connector status indicator
  - approval timeline panel
  - feature flag guard
- Dependencies: `SFA-003`, `SFA-004`
- Definition of Done:
  - user can delegate task and view timeline states
- Test checklist:
  - [ ] UI flow E2E test
  - [ ] feature flag on/off behavior
  - [ ] error-state rendering tests
