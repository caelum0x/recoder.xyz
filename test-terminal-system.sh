#!/bin/bash
# Test Terminal System Features

DOCKER_URL="http://localhost:3100"
PROJECT_ID="test-terminal-$(date +%s)"

echo "=== Testing Terminal System ==="
echo "Project ID: $PROJECT_ID"
echo ""

# 1. Create container
echo "1. Creating Docker container..."
CONTAINER_RESPONSE=$(curl -s -X POST "$DOCKER_URL/api/container" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\"}")

CONTAINER_ID=$(echo $CONTAINER_RESPONSE | grep -o '"containerId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CONTAINER_ID" ]; then
  echo "❌ Failed to create container"
  exit 1
fi

echo "✅ Container created: ${CONTAINER_ID:0:12}"
sleep 2

# 2. Test keep-alive endpoint
echo ""
echo "2. Testing keep-alive endpoint..."
KEEPALIVE=$(curl -s -X POST "$DOCKER_URL/api/keep-alive/$PROJECT_ID")
echo "Response: $KEEPALIVE"

if echo "$KEEPALIVE" | grep -q "success\|ok"; then
  echo "✅ Keep-alive endpoint working"
else
  echo "❌ Keep-alive endpoint failed"
fi

# 3. Test dev server start
echo ""
echo "3. Testing dev server start..."
# First create a package.json
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace/package.json",
    "content": "{\"name\":\"test\",\"version\":\"1.0.0\",\"scripts\":{\"dev\":\"echo Dev server running && sleep 1000\"}}"
  }' > /dev/null

sleep 1

DEV_START=$(curl -s -X POST "$DOCKER_URL/api/dev-server/start" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\"}")

echo "Response: $DEV_START"

if echo "$DEV_START" | grep -q "success\|started"; then
  echo "✅ Dev server start endpoint working"
else
  echo "⚠️  Dev server start response: $DEV_START"
fi

sleep 2

# 4. Test dev server status
echo ""
echo "4. Testing dev server status..."
DEV_STATUS=$(curl -s "$DOCKER_URL/api/dev-server/status/$PROJECT_ID")
echo "Status: $DEV_STATUS"

if echo "$DEV_STATUS" | grep -q "running\|active"; then
  echo "✅ Dev server status endpoint working"
else
  echo "⚠️  Dev server status: $DEV_STATUS"
fi

# 5. Test dev server stop
echo ""
echo "5. Testing dev server stop..."
DEV_STOP=$(curl -s -X POST "$DOCKER_URL/api/dev-server/stop" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\"}")

echo "Response: $DEV_STOP"

if echo "$DEV_STOP" | grep -q "success\|stopped"; then
  echo "✅ Dev server stop endpoint working"
else
  echo "⚠️  Dev server stop response: $DEV_STOP"
fi

# 6. Test dev server restart
echo ""
echo "6. Testing dev server restart..."
DEV_RESTART=$(curl -s -X POST "$DOCKER_URL/api/dev-server/restart" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\"}")

echo "Response: $DEV_RESTART"

if echo "$DEV_RESTART" | grep -q "success\|restarted"; then
  echo "✅ Dev server restart endpoint working"
else
  echo "⚠️  Dev server restart response: $DEV_RESTART"
fi

# 7. Test terminal exec (fresh shell)
echo ""
echo "7. Testing terminal exec (fresh shell)..."
TERMINAL_EXEC=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"echo \"Terminal test\" && pwd","cwd":"/workspace"}')

TERMINAL_OUTPUT=$(echo $TERMINAL_EXEC | jq -r '.output' 2>/dev/null)
echo "Terminal output: $TERMINAL_OUTPUT"

if echo "$TERMINAL_OUTPUT" | grep -q "Terminal test"; then
  echo "✅ Terminal exec working"
else
  echo "❌ Terminal exec failed"
fi

# 8. Test command completion marker
echo ""
echo "8. Testing command completion marker..."
COMMAND_TEST=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"ls -la && echo \"###COMMAND_DONE###\"","cwd":"/workspace"}')

if echo "$COMMAND_TEST" | grep -q "COMMAND_DONE"; then
  echo "✅ Command completion marker working"
else
  echo "⚠️  Command completion marker not found"
fi

# 9. Check for WebSocket RPC files
echo ""
echo "9. Checking for WebSocket RPC implementation..."
if [ -f "/Users/arhansubasi/recoder.xyz/docker-backend/src/websocket-rpc.ts" ]; then
  echo "✅ websocket-rpc.ts exists"
else
  echo "❌ websocket-rpc.ts not found"
fi

# 10. Check for DevServerManager
echo ""
echo "10. Checking for DevServerManager..."
if [ -f "/Users/arhansubasi/recoder.xyz/docker-backend/src/dev-server.ts" ]; then
  echo "✅ dev-server.ts exists"
else
  echo "❌ dev-server.ts not found"
fi

# 11. Check for container lifecycle
echo ""
echo "11. Checking for container lifecycle..."
if [ -f "/Users/arhansubasi/recoder.xyz/docker-backend/src/container-lifecycle.ts" ]; then
  echo "✅ container-lifecycle.ts exists"
else
  echo "❌ container-lifecycle.ts not found"
fi

# 12. Check for LogsPanel component
echo ""
echo "12. Checking for LogsPanel component..."
if [ -f "/Users/arhansubasi/recoder.xyz/recoder-web/app/components/workbench/LogsPanel.tsx" ]; then
  echo "✅ LogsPanel.tsx exists"
else
  echo "❌ LogsPanel.tsx not found"
fi

# 13. Check for TerminalControls component
echo ""
echo "13. Checking for TerminalControls component..."
if [ -f "/Users/arhansubasi/recoder.xyz/recoder-web/app/components/workbench/terminal/TerminalControls.tsx" ]; then
  echo "✅ TerminalControls.tsx exists"
else
  echo "❌ TerminalControls.tsx not found"
fi

# 14. Check for terminal-sync
echo ""
echo "14. Checking for terminal-sync..."
if [ -f "/Users/arhansubasi/recoder.xyz/recoder-web/app/lib/terminal-sync.ts" ]; then
  echo "✅ terminal-sync.ts exists"
else
  echo "❌ terminal-sync.ts not found"
fi

echo ""
echo "=== Terminal System Test Complete ==="
echo ""
echo "To cleanup: curl -X DELETE $DOCKER_URL/api/container/$PROJECT_ID"
