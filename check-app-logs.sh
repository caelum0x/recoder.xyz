#!/bin/bash

echo "Checking PM2 logs for recoder-app..."
ssh root@77.42.23.19 "pm2 logs recoder-app --err --lines 50 --nostream"

echo ""
echo "---"
echo "Checking PM2 status..."
ssh root@77.42.23.19 "pm2 status"
