#!/bin/bash

echo "🧪 Testing Docker Backend API..."

BASE_URL="http://localhost:3100"

# Test health
echo "1. Health check:"
curl -s "$BASE_URL/health" | jq .

# Test container creation
echo -e "\n2. Creating container:"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/container" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-'$(date +%s)'"}')
echo $RESPONSE | jq .

# Extract container ID
CONTAINER_ID=$(echo $RESPONSE | jq -r .containerId)
PROJECT_ID=$(echo $RESPONSE | jq -r .projectId // "test-'$(date +%s)'")

if [ "$CONTAINER_ID" != "null" ]; then
  echo -e "\n3. Testing file operations:"
  
  # Write file
  curl -s -X POST "$BASE_URL/api/file/$PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"path":"/workspace/test.txt","content":"Hello Docker Backend!"}' | jq .
  
  # Read file
  echo -e "\n4. Reading file:"
  curl -s "$BASE_URL/api/file/$PROJECT_ID?path=/workspace/test.txt" | jq .
  
  # Execute command
  echo -e "\n5. Executing command:"
  curl -s -X POST "$BASE_URL/api/exec/$PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"command":"ls -la /workspace"}' | jq .
  
  echo -e "\n✅ All tests completed!"
else
  echo "❌ Container creation failed"
fi
