#!/bin/bash

cd /Users/arhansubasi/recoder.xyz/backend

echo "Starting backend server..."
npm run dev > /tmp/backend-test.log 2>&1 &
BACKEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Waiting 15 seconds for server to start..."
sleep 15

if kill -0 $BACKEND_PID 2>/dev/null; then
  echo ""
  echo "✅ Server process is alive"
  echo ""
  echo "Testing /health endpoint..."
  curl -s http://localhost:3001/health
  echo ""
  echo ""
  echo "Testing /api/v1/status endpoint..."
  curl -s http://localhost:3001/api/v1/status
  echo ""
else
  echo ""
  echo "❌ Server process died"
fi

echo ""
echo "=== Server Log (last 30 lines) ==="
tail -30 /tmp/backend-test.log

echo ""
echo "Killing server..."
kill $BACKEND_PID 2>/dev/null
wait 2>/dev/null

exit 0
