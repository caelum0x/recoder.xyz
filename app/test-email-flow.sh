#!/bin/bash

# Email Flow Test Script
# Tests the email verification and authentication flow
#
# Usage:
#   ./test-email-flow.sh <your-email> [admin-secret]
#
# Requirements:
#   - App running on localhost:3000
#   - SMTP configured (preferred) or Resend fallback
#   - SHOW_TEST_CREDENTIALS=true for dev mode response

EMAIL="${1:-test@example.com}"
ADMIN_SECRET="${2:-recoder-admin-2026}"
CRON_SECRET="${CRON_SECRET:-$ADMIN_SECRET}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "======================================"
echo "📧 Recoder Email Flow Test"
echo "======================================"
echo "Email: $EMAIL"
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Check email configuration
echo "📋 Step 1: Checking email configuration..."
CONFIG_RESPONSE=$(curl -s -X GET "$BASE_URL/api/admin/test-email" \
  -H "x-admin-secret: $ADMIN_SECRET")
echo "$CONFIG_RESPONSE" | jq '.' 2>/dev/null || echo "$CONFIG_RESPONSE"
echo ""

# Step 2: Check onboarding cron status
echo "⏱️ Step 2: Checking onboarding cron status..."
CRON_STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/cron/process-emails?mode=status" \
  -H "x-cron-secret: $CRON_SECRET")
echo "$CRON_STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$CRON_STATUS_RESPONSE"
echo ""

# Step 3: Send a test email
echo "📤 Step 3: Sending test verification email..."
TEST_EMAIL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/test-email" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d "{\"email\": \"$EMAIL\", \"type\": \"verification\"}")
echo "$TEST_EMAIL_RESPONSE" | jq '.' 2>/dev/null || echo "$TEST_EMAIL_RESPONSE"
echo ""

# Step 4: Send an onboarding template test
echo "🧭 Step 4: Sending onboarding template test..."
ONBOARDING_TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/test-email" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d "{\"email\": \"$EMAIL\", \"type\": \"getting-started\", \"name\": \"Test User\"}")
echo "$ONBOARDING_TEST_RESPONSE" | jq '.' 2>/dev/null || echo "$ONBOARDING_TEST_RESPONSE"
echo ""

# Step 5: Test user signup flow
echo "👤 Step 5: Testing user signup flow..."
NAME="Test User $(date +%s)"
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/signup-email" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"name\": \"$NAME\"}")
echo "$SIGNUP_RESPONSE" | jq '.' 2>/dev/null || echo "$SIGNUP_RESPONSE"
echo ""

# Extract temp password if in dev mode
TEMP_PASSWORD=$(echo "$SIGNUP_RESPONSE" | jq -r '._dev.tempPassword // empty' 2>/dev/null)
if [ -n "$TEMP_PASSWORD" ]; then
  echo "🔑 Dev Mode: Temp password extracted: $TEMP_PASSWORD"
  echo ""
fi

# Step 6: Check pending verifications
echo "🔍 Step 6: Checking pending verifications for $EMAIL..."
PENDING_RESPONSE=$(curl -s -X GET "$BASE_URL/api/admin/pending-verifications?email=$EMAIL" \
  -H "x-admin-secret: $ADMIN_SECRET")
echo "$PENDING_RESPONSE" | jq '.' 2>/dev/null || echo "$PENDING_RESPONSE"
echo ""

# Step 7: Request verification email resend
echo "📨 Step 7: Requesting verification email resend..."
RESEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/verify-email" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")
echo "$RESEND_RESPONSE" | jq '.' 2>/dev/null || echo "$RESEND_RESPONSE"
echo ""

# Extract verification URL if in dev mode
VERIFY_URL=$(echo "$RESEND_RESPONSE" | jq -r '._dev.verificationUrl // empty' 2>/dev/null)
if [ -n "$VERIFY_URL" ]; then
  echo "🔗 Dev Mode: Verification URL extracted: $VERIFY_URL"
  echo ""

  # Step 8: Complete verification (dev only)
  echo "✅ Step 8: Completing email verification..."
  curl -s -I "$VERIFY_URL" | head -5
  echo ""
fi

# Step 9: Test login (if signup succeeded)
if [ -n "$TEMP_PASSWORD" ]; then
  echo "🔐 Step 9: Testing login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"password\": \"$TEMP_PASSWORD\"}")
  echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
  echo ""
fi

echo "======================================"
echo "✨ Email Flow Test Complete"
echo "======================================"
echo ""
echo "Manual verification steps:"
echo "1. Check your inbox at $EMAIL"
echo "2. Look for emails from noreply@recoder.xyz"
echo "3. Click the verification link in the email"
echo "4. Try logging in at $BASE_URL/auth/signin"
echo ""
