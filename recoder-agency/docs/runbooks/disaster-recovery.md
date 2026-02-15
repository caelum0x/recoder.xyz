# Recoder Agency Disaster Recovery Runbook

## Targets

- `RTO`: 4 hours (service restore target)
- `RPO`: 24 hours (acceptable data loss window)

## Preconditions

- Restore drill evidence logged at least every 14 days.
- Backup retention policy enforced:
  - daily: 14 days
  - weekly: 8 weeks
  - monthly: 12 months

## Recovery procedure

1. Declare incident and freeze writes where possible.
2. Select restore point (snapshot/backup id).
3. Restore staging first, then production.
4. Validate data integrity:
   - project count
   - deliverable count
   - transition count
5. Run release-readiness assertions:
   - `pnpm -C apps/agency ops:staging:assert-release-readiness`
6. Run seeded transition smoke.
7. Re-enable write traffic.

## Validation queries

```sql
SELECT COUNT(*) FROM public.projects;
SELECT COUNT(*) FROM public.deliverables;
SELECT COUNT(*) FROM public.project_status_transitions;
```

## Evidence logging

After each drill or real restore:

```bash
AGENCY_STAGING_DATABASE_URL="..." \
RESTORE_OPERATOR="oncall-user" \
RESTORE_BACKUP_REFERENCE="snapshot-YYYY-MM-DD" \
RESTORE_VALIDATION_SUMMARY="counts validated + smoke pass" \
pnpm -C apps/agency ops:staging:log-restore-drill
```
