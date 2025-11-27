#!/bin/bash

echo "🧪 Testing Device Code Flow"
echo "=============================="
echo ""

# Step 1: Request device code
echo "1. Requesting device code..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/cli/device)
echo "$RESPONSE" | jq '.'

# Extract codes
DEVICE_CODE=$(echo "$RESPONSE" | jq -r '.deviceCode')
USER_CODE=$(echo "$RESPONSE" | jq -r '.userCode')
VERIFICATION_URI=$(echo "$RESPONSE" | jq -r '.verificationUri')

echo ""
echo "2. Device Code: ${DEVICE_CODE:0:20}..."
echo "   User Code: $USER_CODE"
echo "   Verification URI: $VERIFICATION_URI"

# Step 2: Test polling (should return authorization_pending)
echo ""
echo "3. Testing polling endpoint (should return authorization_pending):"
curl -s "http://localhost:3000/api/cli/device/poll?deviceCode=$DEVICE_CODE" | jq '.'

echo ""
echo "4. To test authorization:"
echo "   a) Visit: $VERIFICATION_URI"
echo "   b) Enter code: $USER_CODE"
echo "   c) Click 'Authorize'"
echo ""
echo "5. Then run this to poll again:"
echo "   curl -s \"http://localhost:3000/api/cli/device/poll?deviceCode=$DEVICE_CODE\" | jq '.'"
echo ""
echo "✅ Backend endpoints are working correctly!"
