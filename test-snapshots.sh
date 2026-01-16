#!/bin/bash
# Test Git-based Snapshot System

DOCKER_URL="http://localhost:3100"
PROJECT_ID="test-snapshot-$(date +%s)"

echo "=== Testing Snapshot System ==="
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
  echo "Response: $CONTAINER_RESPONSE"
  exit 1
fi

echo "✅ Container created: $CONTAINER_ID"
sleep 2

# 2. Write initial file
echo ""
echo "2. Writing initial file..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"/workspace/test.txt","content":"Initial content"}' > /dev/null

echo "✅ File written"
sleep 1

# 3. Create first snapshot
echo ""
echo "3. Creating first snapshot..."
SNAPSHOT1=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"First snapshot","author":"user"}')

SNAPSHOT1_ID=$(echo $SNAPSHOT1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SNAPSHOT1_ID" ]; then
  echo "❌ Failed to create snapshot"
  echo "Response: $SNAPSHOT1"
  exit 1
fi

echo "✅ Snapshot created: $SNAPSHOT1_ID"
echo "Full response: $SNAPSHOT1"

# 4. Modify file
echo ""
echo "4. Modifying file..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"/workspace/test.txt","content":"Modified content"}' > /dev/null

echo "✅ File modified"
sleep 1

# 5. Create second snapshot
echo ""
echo "5. Creating second snapshot..."
SNAPSHOT2=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"Second snapshot","author":"ai"}')

SNAPSHOT2_ID=$(echo $SNAPSHOT2 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "✅ Snapshot created: $SNAPSHOT2_ID"

# 6. List snapshots
echo ""
echo "6. Listing all snapshots..."
SNAPSHOTS=$(curl -s "$DOCKER_URL/api/snapshots/$PROJECT_ID?limit=10")
echo "$SNAPSHOTS" | jq '.' 2>/dev/null || echo "$SNAPSHOTS"

# 7. Test auto-save enable
echo ""
echo "7. Enabling auto-save (5 min intervals)..."
curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID/auto-save" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"intervalMs":300000}' > /dev/null

echo "✅ Auto-save enabled"

# 8. Restore to first snapshot
echo ""
echo "8. Restoring to first snapshot ($SNAPSHOT1_ID)..."
RESTORE_RESPONSE=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID/restore" \
  -H "Content-Type: application/json" \
  -d "{\"snapshotId\":\"$SNAPSHOT1_ID\"}")

echo "Response: $RESTORE_RESPONSE"

if echo "$RESTORE_RESPONSE" | grep -q "success\|true"; then
  echo "✅ Restore successful"
else
  echo "⚠️  Restore may have failed, check logs"
fi

# 9. Verify file content after restore
echo ""
echo "9. Verifying file content after restore..."
sleep 3
FILE_CONTENT=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"cat /workspace/test.txt","cwd":"/workspace"}')

echo "File content: $FILE_CONTENT"

if echo "$FILE_CONTENT" | grep -q "Initial content"; then
  echo "✅ File restored correctly!"
else
  echo "⚠️  File content doesn't match expected"
fi

# 10. Check if Git is initialized
echo ""
echo "10. Checking Git status..."
GIT_STATUS=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command":"git log --oneline -5","cwd":"/workspace"}')

echo "Git log:"
echo "$GIT_STATUS" | jq -r '.output' 2>/dev/null || echo "$GIT_STATUS"

echo ""
echo "=== Test Complete ==="
echo "Container ID: $CONTAINER_ID"
echo "Project ID: $PROJECT_ID"
echo ""
echo "To cleanup: curl -X DELETE $DOCKER_URL/api/container/$PROJECT_ID"
