#!/bin/bash
# Test npm install + dev server restart after restore

DOCKER_URL="http://localhost:3100"
PROJECT_ID="test-restore-npm-$(date +%s)"

echo "=== Testing Restore with npm install + Dev Server ==="
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

# 2. Create initial package.json with lodash
echo ""
echo "2. Creating package.json with lodash..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace/package.json",
    "content": "{\"name\":\"test\",\"version\":\"1.0.0\",\"dependencies\":{\"lodash\":\"^4.17.21\"}}"
  }' > /dev/null

echo "✅ package.json created"

# 3. Install dependencies
echo ""
echo "3. Installing dependencies..."
INSTALL=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"npm install","cwd":"/workspace"}')

echo "✅ npm install completed"
sleep 2

# 4. Create snapshot
echo ""
echo "4. Creating snapshot with lodash..."
SNAPSHOT1=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"With lodash","author":"user"}')

SNAPSHOT1_ID=$(echo $SNAPSHOT1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "✅ Snapshot created: $SNAPSHOT1_ID"

# 5. Modify package.json (add axios, remove lodash)
echo ""
echo "5. Modifying package.json (adding axios, removing lodash)..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace/package.json",
    "content": "{\"name\":\"test\",\"version\":\"1.0.0\",\"dependencies\":{\"axios\":\"^1.6.0\"}}"
  }' > /dev/null

echo "✅ package.json modified"

# 6. Install new dependencies
echo ""
echo "6. Installing new dependencies..."
curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"npm install","cwd":"/workspace"}' > /dev/null

sleep 2

# 7. Create second snapshot
echo ""
echo "7. Creating snapshot with axios..."
SNAPSHOT2=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"With axios","author":"user"}')

SNAPSHOT2_ID=$(echo $SNAPSHOT2 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "✅ Snapshot created: $SNAPSHOT2_ID"

# 8. Check current dependencies
echo ""
echo "8. Current dependencies (should have axios)..."
DEPS_BEFORE=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"ls node_modules | grep -E \"(lodash|axios)\"","cwd":"/workspace"}')

echo "Dependencies: $(echo $DEPS_BEFORE | jq -r '.output' 2>/dev/null)"

# 9. Restore to first snapshot (should reinstall lodash)
echo ""
echo "9. Restoring to first snapshot (should reinstall lodash)..."
RESTORE=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID/restore" \
  -H "Content-Type: application/json" \
  -d "{\"snapshotId\":\"$SNAPSHOT1_ID\"}")

echo "Restore response: $RESTORE"

if echo "$RESTORE" | grep -q "success\|true"; then
  echo "✅ Restore initiated"
else
  echo "❌ Restore failed"
  exit 1
fi

# 10. Wait for npm install to complete
echo ""
echo "10. Waiting for npm install to complete (15 seconds)..."
sleep 15

# 11. Verify dependencies were restored
echo ""
echo "11. Verifying dependencies after restore..."
DEPS_AFTER=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"ls node_modules | grep -E \"(lodash|axios)\"","cwd":"/workspace"}')

DEPS_OUTPUT=$(echo $DEPS_AFTER | jq -r '.output' 2>/dev/null)
echo "Dependencies: $DEPS_OUTPUT"

if echo "$DEPS_OUTPUT" | grep -q "lodash"; then
  echo "✅ lodash restored correctly"
else
  echo "❌ lodash not found"
fi

if echo "$DEPS_OUTPUT" | grep -q "axios"; then
  echo "⚠️  axios still present (should be removed)"
else
  echo "✅ axios removed correctly"
fi

# 12. Check package.json content
echo ""
echo "12. Verifying package.json content..."
PKG_JSON=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"cat package.json","cwd":"/workspace"}')

echo "package.json: $(echo $PKG_JSON | jq -r '.output' 2>/dev/null)"

echo ""
echo "=== Restore + npm install Test Complete ==="
echo ""
echo "To cleanup: curl -X DELETE $DOCKER_URL/api/container/$PROJECT_ID"
