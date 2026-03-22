#!/bin/bash
# Uptime Monitor — checks all endpoints and logs status
# Run via cron: */5 * * * * /root/recoder.xyz/scripts/uptime-monitor.sh

LOG="/root/recoder.xyz/logs/uptime.log"
ALERT_EMAIL="${ALERT_EMAIL:-}"
DOWN_SERVICES=""

check() {
  local name="$1" url="$2" expected="${3:-200}"
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null)
  if [ "$code" != "$expected" ]; then
    DOWN_SERVICES="$DOWN_SERVICES $name($code)"
    echo "$(date -Iseconds) DOWN $name $url $code" >> "$LOG"
  fi
}

check "recoder-app" "http://localhost:3000" "200"
check "recoder-agents" "http://localhost:3001" "200"
check "api-backend" "http://localhost:8000/v1/health" "200"
check "docker-backend" "http://localhost:3100/health" "200"
check "recoder-pm" "http://localhost:3004" "307"
check "recoder-agency" "http://localhost:3007" "307"

# Docker containers
for container in recoder-web recoder-docker-backend openclaw-gateway; do
  status=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
  if [ "$status" != "true" ]; then
    DOWN_SERVICES="$DOWN_SERVICES $container(stopped)"
    echo "$(date -Iseconds) DOWN $container docker-stopped" >> "$LOG"
  fi
done

# Daytona
daytona_healthy=$(docker ps --filter name=daytona-api --format '{{.Status}}' 2>/dev/null | grep -c healthy)
if [ "$daytona_healthy" != "1" ]; then
  DOWN_SERVICES="$DOWN_SERVICES daytona(unhealthy)"
  echo "$(date -Iseconds) DOWN daytona unhealthy" >> "$LOG"
fi

# Memory check
available=$(free -m | awk '/^Mem:/ {print $7}')
if [ "$available" -lt 1024 ]; then
  DOWN_SERVICES="$DOWN_SERVICES memory(${available}MB)"
  echo "$(date -Iseconds) WARN memory low ${available}MB" >> "$LOG"
fi

# Disk check
disk_pct=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$disk_pct" -gt 90 ]; then
  DOWN_SERVICES="$DOWN_SERVICES disk(${disk_pct}%)"
  echo "$(date -Iseconds) WARN disk ${disk_pct}%" >> "$LOG"
fi

if [ -n "$DOWN_SERVICES" ]; then
  echo "$(date -Iseconds) ALERT:$DOWN_SERVICES" >> "$LOG"
  # Auto-restart PM2 services that are down
  for svc in recoder-app recoder-agents recoder-backend recoder-pm recoder-agency; do
    status=$(pm2 show "$svc" 2>/dev/null | grep status | head -1)
    if echo "$status" | grep -qE "errored|stopped"; then
      pm2 restart "$svc" 2>/dev/null
      echo "$(date -Iseconds) RESTART $svc" >> "$LOG"
    fi
  done
else
  # Only log every hour when healthy (reduce log noise)
  minute=$(date +%M)
  if [ "$minute" = "00" ]; then
    echo "$(date -Iseconds) OK all-services-healthy mem=${available}MB disk=${disk_pct}%" >> "$LOG"
  fi
fi
