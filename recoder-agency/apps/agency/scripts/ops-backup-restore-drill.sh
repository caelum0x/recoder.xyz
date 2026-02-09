#!/usr/bin/env bash
set -euo pipefail

# ops-backup-restore-drill.sh
# Executable runbook: captures pre-counts, records a restore drill,
# runs release readiness, captures post-counts, and logs evidence.

DB_URL="${AGENCY_STAGING_DATABASE_URL:?Set AGENCY_STAGING_DATABASE_URL}"
OPERATOR="${RESTORE_OPERATOR:-$(whoami)}"
BACKUP_REF="${RESTORE_BACKUP_REFERENCE:-manual-drill-$(date +%Y%m%d-%H%M%S)}"
VALIDATION_SUMMARY="${RESTORE_VALIDATION_SUMMARY:-automated-drill}"

echo "=== Backup/Restore Drill — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Operator:  $OPERATOR"
echo "Backup ref: $BACKUP_REF"
echo ""

echo "--- Pre-counts ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 --no-align --tuples-only -c "
SELECT 'projects=' || count(*) FROM public.projects
UNION ALL
SELECT 'deliverables=' || count(*) FROM public.deliverables
UNION ALL
SELECT 'transitions=' || count(*) FROM public.project_status_transitions;
"

echo ""
echo "--- Logging restore drill evidence ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
	-v operator_name="$OPERATOR" \
	-v backup_reference="$BACKUP_REF" \
	-v validation_summary="$VALIDATION_SUMMARY" \
	-f ./db/scripts/log_restore_drill.sql

echo ""
echo "--- Release readiness check ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
	-v stale_days="${WEEKLY_METRICS_STALE_AFTER_DAYS:-10}" \
	-f ./db/scripts/assert_delivery_release_readiness.sql

echo ""
echo "--- Post-counts ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 --no-align --tuples-only -c "
SELECT 'projects=' || count(*) FROM public.projects
UNION ALL
SELECT 'deliverables=' || count(*) FROM public.deliverables
UNION ALL
SELECT 'transitions=' || count(*) FROM public.project_status_transitions;
"

echo ""
echo "=== Drill complete. Evidence logged for operator=$OPERATOR ref=$BACKUP_REF ==="
