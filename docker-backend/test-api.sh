#!/bin/bash
# Test Docker Backend API

BASE_URL="http://localhost:3100"
PROJECT_ID="test-project-$(date +%s)"

echo "🧪 Testing Docker Backend API"
echo "================================"
echo ""

# Health check
echo "1. Health Check..."
curl -s "$BASE_URL/health" | jq .
echo ""

# Create container
echo "2. Creating container for project: $PROJECT_ID"
RESULT=$(curl -s -X POST "$BASE_URL/api/container" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\"}")
echo "$RESULT" | jq .
echo ""

# Write file
echo "3. Writing test file..."
curl -s -X POST "$BASE_URL/api/file/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"path": "/workspace/test.js", "content": "console.log(\"Hello from Docker!\");"}' | jq .
echo ""

# Read file
echo "4. Reading test file..."
curl -s "$BASE_URL/api/file/$PROJECT_ID?path=/workspace/test.js" | jq .
echo ""

# Execute command
echo "5. Executing command (node --version)..."
curl -s -X POST "$BASE_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command": "node --version"}' | jq .
echo ""

# Execute recoder-code
echo "6. Checking recoder-code is installed..."
curl -s -X POST "$BASE_URL/api/exec/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"command": "recoder-code --version || echo \"not installed\""}' | jq .
echo ""

# List files
echo "7. Listing files..."
curl -s "$BASE_URL/api/files/$PROJECT_ID?path=/workspace" | jq .
echo ""

# Cleanup
echo "8. Cleaning up container..."
curl -s -X DELETE "$BASE_URL/api/container/$PROJECT_ID" | jq .
echo ""

echo "✅ All tests complete!"
