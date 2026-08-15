-- governance_0003_approval_target_required.sql
-- recoder-adsk: every NEW approval must bind to an exact target.
--
-- NOT VALID preserves historical rows written before target capture existed,
-- while PostgreSQL still enforces the constraint for every future insert/update.
-- Those historical rows remain readable audit evidence but the gate no longer
-- treats a null target as authorization.

alter table governance_approvals
  add constraint governance_approvals_target_required
  check (target is not null and btrim(target) <> '') not valid;
