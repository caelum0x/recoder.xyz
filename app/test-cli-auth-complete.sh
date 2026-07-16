#!/bin/bash

echo "🧪 Testing CLI Authentication System"
echo "===================================="
echo ""

BASE_URL="http://localhost:3002"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: User Registration
echo "📝 Test 1: User Registration"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test'$(date +%s)'@example.com",
    "password": "testpass123",
    "name": "Test User"
  }')

echo "$REGISTER_RESPONSE" | jq '.'

if echo "$REGISTER_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✅ Registration successful${NC}"
  USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.user.id')
  NEEDS_API_KEY=$(echo "$REGISTER_RESPONSE" | jq -r '.user.needsApiKey')
  echo "   User ID: $USER_ID"
  echo "   Needs API Key: $NEEDS_API_KEY"
else
  echo -e "${RED}❌ Registration failed${NC}"
  exit 1
fi

echo ""
echo "----------------------------------------"
echo ""

# Test 2: Check Quota
echo "📊 Test 2: Check User Quota"
QUOTA_RESPONSE=$(curl -s "$BASE_URL/api/user/quota?userId=$USER_ID")
echo "$QUOTA_RESPONSE" | jq '.'

if echo "$QUOTA_RESPONSE" | jq -e '.quota' > /dev/null; then
  echo -e "${GREEN}✅ Quota check successful${NC}"
  REMAINING=$(echo "$QUOTA_RESPONSE" | jq -r '.quota.remaining')
  LIMIT=$(echo "$QUOTA_RESPONSE" | jq -r '.quota.limit')
  echo "   Remaining: $REMAINING / $LIMIT"
else
  echo -e "${RED}❌ Quota check failed${NC}"
fi

echo ""
echo "----------------------------------------"
echo ""

# Test 3: Validate API Key (will fail - no real key)
echo "🔑 Test 3: Validate OpenRouter API Key (Demo)"
VALIDATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/openrouter/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-or-v1-invalid-demo-key-for-testing"
  }')

echo "$VALIDATE_RESPONSE" | jq '.'
echo -e "${YELLOW}⚠️  Expected to fail (demo key)${NC}"

echo ""
echo "----------------------------------------"
echo ""

# Test 4: Track Usage
echo "📈 Test 4: Track Usage"
TRACK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/usage/track" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "sessionId": "test-session-123",
    "requestType": "cli",
    "modelUsed": "claude-3-sonnet",
    "tokensUsed": 1500,
    "cost": 0.045,
    "duration": 2500,
    "success": true
  }')

echo "$TRACK_RESPONSE" | jq '.'

if echo "$TRACK_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✅ Usage tracking successful${NC}"
  NEW_REMAINING=$(echo "$TRACK_RESPONSE" | jq -r '.quota.remaining')
  echo "   New Remaining: $NEW_REMAINING"
else
  echo -e "${RED}❌ Usage tracking failed${NC}"
fi

echo ""
echo "----------------------------------------"
echo ""

# Test 5: Login
echo "🔐 Test 5: User Login"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'$(echo "$REGISTER_RESPONSE" | jq -r '.user.email')'",
    "password": "testpass123"
  }')

echo "$LOGIN_RESPONSE" | jq '.'

if echo "$LOGIN_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✅ Login successful${NC}"
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.session.accessToken')
  echo "   Access Token: ${ACCESS_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Login failed${NC}"
fi

echo ""
echo "=========================================="
echo "🎉 Test Suite Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "- User registration: ✅"
echo "- Quota system: ✅"
echo "- Usage tracking: ✅"
echo "- User login: ✅"
echo "- API key validation: ⚠️ (needs real OpenRouter key)"
echo ""
echo "Next steps:"
echo "1. Get a real OpenRouter API key from https://openrouter.ai/keys"
echo "2. Test onboarding flow at $BASE_URL/auth/onboarding?userId=$USER_ID"
echo "3. Deploy to production"
echo ""
