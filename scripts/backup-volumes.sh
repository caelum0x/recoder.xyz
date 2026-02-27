#!/usr/bin/env bash
# ============================================================================
# Recoder Production Docker Volume Backup
# Server: Hetzner 77.42.23.19
#
# Install: crontab -e
# 0 3 * * * /root/recoder.xyz/scripts/backup-volumes.sh >> /var/log/recoder-backup.log 2>&1
# ============================================================================
set -euo pipefail

BACKUP_DIR="/root/backups"
LOG_FILE="/var/log/recoder-backup.log"
DATE="$(date +%Y-%m-%d)"
RETENTION_DAYS=7

VOLUMES=(
  "backend-data"
  "redis-data"
  "prometheus-data"
  "alertmanager-data"
)

# Track failures
FAILED=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "=== Recoder volume backup starting ==="

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Back up each volume
for volume in "${VOLUMES[@]}"; do
  ARCHIVE="${volume}-${DATE}.tar.gz"
  log "Backing up volume '${volume}' -> ${BACKUP_DIR}/${ARCHIVE}"

  if docker run --rm \
    -v "${volume}":/source:ro \
    -v "${BACKUP_DIR}":/backup \
    alpine \
    tar czf "/backup/${ARCHIVE}" -C /source .; then
    log "  OK: ${volume} backed up successfully"
  else
    log "  FAIL: ${volume} backup failed!"
    FAILED=$((FAILED + 1))
  fi
done

# Prune backups older than retention period
log "Pruning backups older than ${RETENTION_DAYS} days..."
for volume in "${VOLUMES[@]}"; do
  find "${BACKUP_DIR}" -name "${volume}-*.tar.gz" -type f -mtime +${RETENTION_DAYS} -print -delete | while read -r f; do
    log "  Deleted old backup: ${f}"
  done
done

# Print summary of current backup sizes
log "=== Backup summary ==="
TOTAL_SIZE=0
for volume in "${VOLUMES[@]}"; do
  ARCHIVE="${BACKUP_DIR}/${volume}-${DATE}.tar.gz"
  if [ -f "${ARCHIVE}" ]; then
    SIZE=$(stat -c '%s' "${ARCHIVE}" 2>/dev/null || stat -f '%z' "${ARCHIVE}" 2>/dev/null || echo 0)
    HUMAN=$(du -h "${ARCHIVE}" | cut -f1)
    log "  ${volume}-${DATE}.tar.gz  ${HUMAN}"
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
  else
    log "  ${volume}-${DATE}.tar.gz  MISSING"
  fi
done

# Total size in human-readable form
if command -v numfmt &>/dev/null; then
  TOTAL_HUMAN=$(numfmt --to=iec "${TOTAL_SIZE}")
else
  TOTAL_HUMAN="${TOTAL_SIZE} bytes"
fi
log "  Total: ${TOTAL_HUMAN}"
log "=== Backup complete ==="

# Exit with error if any backup failed
if [ "${FAILED}" -gt 0 ]; then
  log "ERROR: ${FAILED} volume backup(s) failed!"
  exit 1
fi

exit 0
