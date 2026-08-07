-- governance_0002_approval_target.sql
-- recoder-adsk: approval clearance must bind to the action's concrete target.
--
-- Before this, a `governance_approvals` row carried no target, so an approval
-- for one path/command cleared the SAME action on ANY target in the task. Add a
-- nullable `target` column (the concrete path/command, derived like the audit
-- row's `resource`). A stored target clears the action ONLY on that exact
-- target; a NULL target keeps the pre-existing task-wide behavior, so approvals
-- minted before this column are not broken.
--
-- Additive + idempotent (the runner sorts *.sql lexically, so this applies after
-- governance_0001.sql). Nullable, no default, no backfill — cheap on a live table.

alter table governance_approvals
  add column if not exists target text;
