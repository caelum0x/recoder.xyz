#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
echo "=== Memory ==="
free -h

echo ""
echo "=== OOM Killer logs ==="
dmesg | tail -50 | grep -iE 'kill|oom|memory' || echo "No OOM events"

echo ""
echo "=== Check for miner ==="
ps aux | grep -E 'xmrig|monero|miner' | grep -v grep || echo "No miner"

echo ""
echo "=== Check cron for miner restart ==="
crontab -l 2>/dev/null || echo "No root crontab"
crontab -u recoder -l 2>/dev/null || echo "No recoder crontab"

echo ""
echo "=== Check systemd for miner ==="
systemctl list-units --type=service | grep -iE 'xmrig|monero|miner' || echo "No miner service"

echo ""
echo "=== Check moneroocean folder ==="
ls -la /home/recoder/moneroocean/ 2>/dev/null || echo "No moneroocean folder"
EOF
