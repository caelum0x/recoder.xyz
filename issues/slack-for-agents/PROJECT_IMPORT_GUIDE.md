# Slack for Agents Project Import Guide

## Files
- `issues/slack-for-agents/ISSUE_TRACKER.csv`
- `issues/slack-for-agents/*.md` (per-repo issue bodies)
- `tools/a2a-interop/js/create-sfa-github-issues.mjs`
- `tools/a2a-interop/js/setup-sfa-project.mjs`

## Import to GitHub Project (table)
1. Open your GitHub Project.
2. Use `Add items` -> `Import from CSV`.
3. Select `issues/slack-for-agents/ISSUE_TRACKER.csv`.
4. Map fields:
- `id` -> custom text field `Ticket ID`
- `title` -> `Title`
- `repo` -> single select `Repo`
- `priority` -> single select `Priority`
- `sprint` -> single select `Sprint`
- `status` -> `Status`
- `dependencies` -> text field `Depends On`

## Issue creation flow
1. For each row in the project, open matching file under `issues/slack-for-agents/<repo>.md`.
2. Copy the corresponding `## SFA-XXX` block.
3. Create issue in that repository using the `Title`, `Labels`, and `Body` content.
4. Paste resulting issue URL back into project item notes.

## Automated CLI flow (recommended)
1. Ensure GitHub auth scopes include `repo` and `project`:
- `gh auth refresh -s project`
2. Dry-run issue creation:
- `pnpm run issues:sfa:dry`
3. Create all SFA issues:
- `pnpm run issues:sfa:create`
4. Dry-run project setup:
- `pnpm run project:sfa:dry`
5. Create/find project, add issues, set Sprint/Priority fields:
- `pnpm run project:sfa:apply`

## Recommended status flow
`Backlog` -> `Ready` -> `In Progress` -> `Review` -> `Done`

## Release gate checklist (Tier-1 support)
- All Sprint 1-3 P0/P1 tickets complete.
- Two consecutive weekly evidence packs stable.
- Zero open P0 auth/policy/audit bugs.
- Cross-domain smoke suite green.
