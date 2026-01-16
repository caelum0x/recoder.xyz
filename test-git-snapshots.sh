#!/bin/bash
# Test Git Snapshots System
# Run: chmod +x test-git-snapshots.sh && ./test-git-snapshots.sh

set -e
API="${API:-http://localhost:3100}"
PROJECT_ID="test-snapshot-$$"

echo "🧪 Testing Git Snapshots System"
echo "================================"
echo "API: $API"

# 1. Create container
echo -e "\n1️⃣ Creating container..."
CONTAINER=$(curl -s -X POST "$API/api/container" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\"}" | jq -r '.containerId')
echo "Container: ${CONTAINER:0:12}..."

# 2. Create test file
echo -e "\n2️⃣ Creating test file..."
curl -s -X POST "$API/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"index.js","content":"console.log(\"v1\");"}' | jq -r '.success'

# 3. Create first snapshot
echo -e "\n3️⃣ Creating snapshot 1..."
SNAP1=$(curl -s -X POST "$API/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"Initial version","author":"user"}' | jq -r '.id')
echo "Snapshot 1: $SNAP1"

# 4. Modify file
echo -e "\n4️⃣ Modifying file..."
curl -s -X POST "$API/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path":"index.js","content":"console.log(\"v2 - modified\");"}' | jq -r '.success'

# 5. Create second snapshot
echo -e "\n5️⃣ Creating snapshot 2..."
SNAP2=$(curl -s -X POST "$API/api/snapshot/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"Modified version","author":"ai"}' | jq -r '.id')
echo "Snapshot 2: $SNAP2"

# 6. List snapshots
echo -e "\n6️⃣ Listing snapshots..."
curl -s "$API/api/snapshots/$PROJECT_ID?limit=10" | jq '.snapshots | .[] | "\(.id) - \(.message) [\(.author)]"'

# 7. Get stats
echo -e "\n7️⃣ Getting stats..."
curl -s "$API/api/snapshot/$PROJECT_ID/stats" | jq '.'

# 8. Current content
echo -e "\n8️⃣ Current content:"
curl -s "$API/api/file/$PROJECT_ID?path=index.js" | jq -r '.content'

# 9. Restore to snapshot 1
echo -e "\n9️⃣ Restoring to snapshot 1..."
curl -s -X POST "$API/api/snapshot/$PROJECT_ID/restore" \
  -H "Content-Type: application/json" \
  -d "{\"snapshotId\":\"$SNAP1\"}" | jq '.'

# 10. Verify restore
echo -e "\n🔟 Content after restore:"
curl -s "$API/api/file/$PROJECT_ID?path=index.js" | jq -r '.content'

# 11. Compress
echo -e "\n1️⃣1️⃣ Compressing..."
curl -s -X POST "$API/api/snapshot/$PROJECT_ID/compress" | jq '.'

# Cleanup
echo -e "\n🧹 Cleaning up..."
curl -s -X DELETE "$API/api/container/$PROJECT_ID" | jq -r '.success'

echo -e "\n✅ All snapshot tests completed!"
