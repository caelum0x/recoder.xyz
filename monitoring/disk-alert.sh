#!/bin/bash
# Disk Space Alert Script for Recoder Platform
# Install as cron: */15 * * * * /root/recoder.xyz/monitoring/disk-alert.sh
#
# Also run weekly Docker cleanup:
# 0 3 * * 0 docker system prune -f --volumes 2>&1 | logger -t docker-prune

set -euo pipefail

THRESHOLD=80
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
HOSTNAME=$(hostname)
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ "$DISK_USAGE" -ge "$THRESHOLD" ]; then
    echo "[$DATE] WARNING: Disk usage at ${DISK_USAGE}% on ${HOSTNAME} (threshold: ${THRESHOLD}%)"

    # Log to syslog
    logger -t disk-alert "Disk usage at ${DISK_USAGE}% on ${HOSTNAME} — threshold ${THRESHOLD}% exceeded"

    # Show top disk consumers
    echo "Top disk consumers:"
    du -sh /root/recoder.xyz/logs/* 2>/dev/null | sort -rh | head -5
    echo ""
    du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -5

    # Auto-cleanup if above 90%
    if [ "$DISK_USAGE" -ge 90 ]; then
        echo "[$DATE] CRITICAL: Auto-cleanup triggered at ${DISK_USAGE}%"
        logger -t disk-alert "CRITICAL: Auto-cleanup triggered at ${DISK_USAGE}%"

        # Prune Docker
        docker system prune -f 2>&1 | logger -t docker-prune

        # Rotate PM2 logs
        pm2 flush 2>/dev/null || true

        # Truncate large log files (keep last 10MB)
        for logfile in /root/recoder.xyz/logs/*/*.log; do
            if [ -f "$logfile" ] && [ "$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile" 2>/dev/null)" -gt 10485760 ]; then
                tail -c 10485760 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
                echo "  Truncated: $logfile"
            fi
        done
    fi
fi
