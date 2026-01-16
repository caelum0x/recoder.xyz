#!/bin/bash
# Test AI Integration with Snapshots

DOCKER_URL="http://localhost:3100"
PROJECT_ID="test-ai-snapshot-$(date +%s)"

echo "=== Testing AI Integration with Snapshots ==="
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

echo "✅ Container created: $CONTAINER_ID"
sleep 2

# 2. Create package.json (simulating AI action)
echo ""
echo "2. Simulating AI creating package.json..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace/package.json",
    "content": "{\"name\":\"test-app\",\"version\":\"1.0.0\",\"dependencies\":{\"react\":\"^18.0.0\"}}"
  }' > /dev/null

echo "✅ package.json created"
sleep 1

# 3. Check if auto-snapshot was created
echo ""
echo "3. Checking for auto-snapshot (should be created before AI changes)..."
SNAPSHOTS=$(curl -s "$DOCKER_URL/api/snapshots/$PROJECT_ID?limit=5")
SNAPSHOT_COUNT=$(echo "$SNAPSHOTS" | grep -o '"id"' | wc -l)

echo "Snapshots found: $SNAPSHOT_COUNT"
echo "$SNAPSHOTS" | jq '.' 2>/dev/null || echo "$SNAPSHOTS"

if [ "$SNAPSHOT_COUNT" -gt 0 ]; then
  echo "✅ Auto-snapshot system working"
else
  echo "⚠️  No snapshots yet (expected if this is first action)"
fi

# 4. Create more files (more AI actions)
echo ""
echo "4. Simulating more AI file operations..."
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"/workspace/index.js","content":"console.log(\"Hello\");"}' > /dev/null

curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"/workspace/README.md","content":"# Test App"}' > /dev/null

echo "✅ Multiple files created"
sleep 1

# 5. Manually trigger snapshot (simulating AI completion)
echo ""
echo "5. Creating 'After AI changes' snapshot..."
SNAPSHOT_AFTER=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"After AI changes","author":"ai"}')

SNAPSHOT_ID=$(echo $SNAPSHOT_AFTER | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "✅ Snapshot created: $SNAPSHOT_ID"

# 6. Wait for auto-save (test if it's running)
echo ""
echo "6. Testing auto-save (waiting 10 seconds for changes)..."
sleep 2

# Make a change
curl -s -X POST "$DOCKER_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"/workspace/test-autosave.txt","content":"Testing auto-save"}' > /dev/null

echo "✅ File modified, auto-save should pick it up in next cycle"

# 7. Check unsaved changes
echo ""
echo "7. Checking for unsaved changes..."
STATUS=$(curl -s "$DOCKER_URL/api/snapshot/$PROJECT_ID/status")
echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"

# 8. List all snapshots
echo ""
echo "8. Final snapshot list..."
FINAL_SNAPSHOTS=$(curl -s "$DOCKER_URL/api/snapshots/$PROJECT_ID?limit=10")
echo "$FINAL_SNAPSHOTS" | jq '.' 2>/dev/null || echo "$FINAL_SNAPSHOTS"

# 9. Test diff between snapshots
echo ""
echo "9. Testing diff functionality..."
FIRST_SNAPSHOT=$(echo "$FINAL_SNAPSHOTS" | jq -r '.snapshots[-1].id' 2>/dev/null)
LAST_SNAPSHOT=$(echo "$FINAL_SNAPSHOTS" | jq -r '.snapshots[0].id' 2>/dev/null)

if [ "$FIRST_SNAPSHOT" != "null" ] && [ "$LAST_SNAPSHOT" != "null" ]; then
  echo "Getting diff from $FIRST_SNAPSHOT to $LAST_SNAPSHOT..."
  DIFF=$(curl -s "$DOCKER_URL/api/snapshot/$PROJECT_ID/diff?from=$FIRST_SNAPSHOT&to=$LAST_SNAPSHOT")
  echo "$DIFF" | jq '.' 2>/dev/null || echo "$DIFF"
else
  echo "⚠️  Not enough snapshots for diff"
fi

# 10. Test restore functionality
echo ""
echo "10. Testing restore to first snapshot..."
if [ "$FIRST_SNAPSHOT" != "null" ]; then
  RESTORE=$(curl -s -X POST "$DOCKER_URL/api/snapshot/$PROJECT_ID/restore" \
    -H "Content-Type: application/json" \
    -d "{\"snapshotId\":\"$FIRST_SNAPSHOT\"}")
  
  echo "Restore response: $RESTORE"
  
  if echo "$RESTORE" | grep -q "success\|true"; then
    echo "✅ Restore successful"
    
    # Verify files are gone
    sleep 3
    echo ""
    echo "Verifying files after restore..."
    FILES=$(curl -s -X POST "$DOCKER_URL/api/exec/$PROJECT_ID" \
      -H "Content-Type: application/json" \
      -d '{"command":"ls -la /workspace","cwd":"/workspace"}')
    
    echo "$FILES" | jq -r '.output' 2>/dev/null || echo "$FILES"
  else
    echo "⚠️  Restore may have failed"
  fi
else
  echo "⚠️  No snapshot to restore to"
fi

echo ""
echo "=== AI Integration Test Complete ==="
echo "Container ID: $CONTAINER_ID"
echo "Project ID: $PROJECT_ID"
echo ""
echo "To cleanup: curl -X DELETE $DOCKER_URL/api/container/$PROJECT_ID"
