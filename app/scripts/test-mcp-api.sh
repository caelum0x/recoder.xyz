#!/bin/bash

# MCP API Integration Tests
# Tests all MCP endpoints

echo "🧪 MCP API Integration Tests"
echo "=============================="

BASE_URL="http://localhost:3000"
TOKEN="your-auth-token-here"

echo ""
echo "1️⃣ Testing GET /api/mcp/servers"
curl -s "$BASE_URL/api/mcp/servers" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "2️⃣ Testing POST /api/mcp/servers (Add GitHub)"
curl -s "$BASE_URL/api/mcp/servers" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "github",
    "name": "GitHub",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {}
  }' | jq '.'

echo ""
echo "3️⃣ Testing GET /api/mcp/tools?serverId=github"
curl -s "$BASE_URL/api/mcp/tools?serverId=github" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "4️⃣ Testing DELETE /api/mcp/servers/github"
curl -s "$BASE_URL/api/mcp/servers/github" \
  -X DELETE \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "✅ Tests complete"
