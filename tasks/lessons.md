# Lessons

## 2026-03-05
- Do not remove large sections from `plan.md` during cleanup. Preserve historical/architectural context and only update checkboxes/status lines explicitly requested.
- Before replacing legacy paths, verify whether they are active runtime contracts. `apps/ui.giselles.ai` exists and must remain as a valid default unless fully migrated.

## 2026-03-06
- When the user says "continue on this", default to implementation work from `plan.md` rather than discussion-only updates.
- Before committing in a large dirty worktree, check staged files for secrets/artifacts (`.env`, `__pycache__`, `*.pyc`) and unstage them first.
