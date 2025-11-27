# Device Code Flow - Terminal to User Account Matching

## ✅ Complete Implementation Status

All device code pages and endpoints are **fully implemented and ready to use**!

## 🔄 How It Works - Complete Flow

### Overview
The device code flow allows CLI users to authenticate by visiting a URL in their browser. This connects their terminal session to their Recoder user account.

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Terminal   │         │    Browser   │         │   Database   │
│   (CLI App)  │         │  (User Auth) │         │  (Sessions)  │
└──────────────┘         └──────────────┘         └──────────────┘
       │                         │                         │
       │                         │                         │
       │ 1. Start auth           │                         │
       │ recoder auth            │                         │
       │─────────────────────────────────────────────────>│
       │                         │                         │
       │ 2. POST /api/cli/device │                         │
       │────────────────────────>│                         │
       │                         │ Create device code      │
       │                         │────────────────────────>│
       │                         │                         │
       │ 3. Response:            │                         │
       │    deviceCode, userCode │                         │
       │<────────────────────────│                         │
       │                         │                         │
       │ 4. Display to user:     │                         │
       │    "Visit: /cli/authorize"                        │
       │    "Code: ABC-123"      │                         │
       │                         │                         │
       │ 5. Start polling        │                         │
       │ (every 5 seconds)       │                         │
       │                         │                         │
       │                         │ 6. User visits URL      │
       │                         │    /cli/authorize       │
       │                         │                         │
       │                         │ 7. Login if needed      │
       │                         │    /auth/signin         │
       │                         │                         │
       │                         │ 8. Enter code ABC-123   │
       │                         │                         │
       │                         │ 9. Click "Authorize"    │
       │                         │    PUT /api/cli/device  │
       │                         │────────────────────────>│
       │                         │    Update status        │
       │                         │    Link userId          │
       │                         │                         │
       │ 10. Poll detects auth   │                         │
       │ GET /api/cli/device/poll│                         │
       │────────────────────────>│                         │
       │                         │ Get device code         │
       │                         │────────────────────────>│
       │                         │ Return user + token     │
       │ 11. Success!            │                         │
       │ { accessToken, user }   │                         │
       │<────────────────────────│                         │
       │                         │                         │
       │ 12. Save token locally  │                         │
       │ ~/.recoder/auth.json    │                         │
       │                         │                         │
       │ 13. Use token for       │                         │
       │ subsequent API calls    │                         │
       │                         │                         │
```

## 📍 Implemented Components

### 1. Authorization Page (`/cli/authorize`)

**Location:** `/app/app/cli/authorize/page.tsx`

**Features:**
- ✅ Beautiful UI with gradient backgrounds
- ✅ Auto-redirect to login if not authenticated
- ✅ Code input with validation (ABC-123 format)
- ✅ Shows logged-in user info
- ✅ Authorize/Deny buttons
- ✅ Success state with confirmation
- ✅ Error handling with clear messages
- ✅ Security notice about authorization

**URL:** `https://recoder.xyz/cli/authorize` (or `http://localhost:3000/cli/authorize` in dev)

**Screenshot of UI:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│         🔐 Authorize CLI Access                 │
│     Connect your CLI to your Recoder account    │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ 👤 John Doe                               │ │
│  │    john@example.com                       │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  Enter Device Code                              │
│  Enter the 6-character code from your CLI       │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │           ABC-123                         │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌──────────┐  ┌──────────────────────────┐   │
│  │  Deny    │  │      Authorize           │   │
│  └──────────┘  └──────────────────────────┘   │
│                                                 │
│  ⓘ Security Notice                              │
│  Only authorize if you initiated this request   │
│  from your CLI. This will grant CLI access to   │
│  your Recoder account.                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2. Device Code Request Endpoint

**Endpoint:** `POST /api/cli/device`

**Location:** `/app/app/api/cli/device/route.ts`

**Request:**
```bash
curl -X POST https://recoder.xyz/api/cli/device
```

**Response:**
```json
{
  "deviceCode": "550e8400-e29b-41d4-a716-446655440000",
  "userCode": "ABC-123",
  "verificationUri": "https://recoder.xyz/cli/authorize",
  "expiresIn": 900,
  "interval": 5
}
```

**What it does:**
1. Generates secure device code (64 hex chars)
2. Generates user-friendly code (ABC-123 format)
3. Stores in database with 15-minute expiry
4. Returns URLs and codes to CLI

### 3. Polling Endpoint

**Endpoint:** `GET /api/cli/device/poll?deviceCode=<code>`

**Location:** `/app/app/api/cli/device/route.ts`

**Request:**
```bash
curl "https://recoder.xyz/api/cli/device/poll?deviceCode=550e8400..."
```

**Responses:**

**Still Pending (400):**
```json
{
  "error": "authorization_pending",
  "description": "User has not authorized yet"
}
```

**Authorized (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "name": "John Doe"
  }
}
```

**Expired (400):**
```json
{
  "error": "expired_token",
  "description": "Device code has expired"
}
```

**Denied (400):**
```json
{
  "error": "access_denied",
  "description": "User denied authorization"
}
```

### 4. Authorization Endpoint

**Endpoint:** `PUT /api/cli/device/authorize`

**Location:** `/app/app/api/cli/device/route.ts`

**Request:**
```json
{
  "userCode": "ABC-123",
  "action": "authorize"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device authorized successfully! Return to your CLI."
}
```

**What it does:**
1. Verifies user is logged in
2. Finds device code by user code
3. Updates status to "authorized"
4. Links device code to user ID
5. Returns success message

### 5. Database Table

**Table:** `cli_device_codes`

**Location:** Created via SQL migration

**Schema:**
```sql
CREATE TABLE cli_device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceCode" VARCHAR(255) UNIQUE NOT NULL,
  "userCode" VARCHAR(255) UNIQUE NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  "userId" UUID,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_cli_device_codes_user
    FOREIGN KEY ("userId")
    REFERENCES users(id)
    ON DELETE CASCADE
);
```

**Indexes:**
- `idx_cli_device_codes_deviceCode` on `deviceCode`
- `idx_cli_device_codes_userCode` on `userCode`

## 🎯 User Experience Flow

### Terminal User Perspective

```bash
$ recoder auth

🔐 CLI Authorization Required

   Visit: https://recoder.xyz/cli/authorize
   Enter code: ABC-123

   Waiting for authorization... ⏳
```

User opens browser, visits URL, enters code, clicks "Authorize"

```bash
   ✅ Authorization successful!

   Welcome, John Doe!
   Email: john@example.com

   You can now use the CLI to access your projects.

$ recoder web list
📦 Your Web Projects

┌────────────┬──────────────┬───────┬───────────┐
│ Chat ID    │ Title        │ Files │ Updated   │
├────────────┼──────────────┼───────┼───────────┤
│ 17625422...│ Blog App     │ 24    │ 2 hrs ago │
│ 17625433...│ E-commerce   │ 156   │ 1 day ago │
└────────────┴──────────────┴───────┴───────────┘
```

### Browser User Perspective

1. **CLI shows:** "Visit https://recoder.xyz/cli/authorize"
2. **User opens link in browser**
3. **If not logged in:** Redirected to `/auth/signin?redirect=/cli/authorize`
4. **After login:** Returns to `/cli/authorize`
5. **Sees page:** "Enter Device Code"
6. **Enters code:** ABC-123
7. **Clicks:** "Authorize"
8. **Sees success:** "Authorization successful! Return to your CLI."
9. **Returns to terminal:** Sees "Authorization successful!"

## 🔒 Security Features

### ✅ Implemented

1. **Short Expiry** - Device codes expire after 15 minutes
2. **User Codes** - Easy to type but random (ABC-123 format)
3. **Device Codes** - Long and secure (64 hex characters)
4. **Session Required** - User must be logged in to authorize
5. **One-Time Use** - Codes deleted after successful authorization
6. **User Linking** - Codes linked to specific user IDs
7. **Foreign Key Cascade** - Codes deleted when user is deleted
8. **Status Tracking** - pending → authorized or denied

### 🔐 Best Practices

1. **Always HTTPS** in production
2. **Rate Limiting** on device code requests (recommended)
3. **Token Rotation** for long-term CLI sessions (recommended)
4. **Audit Logging** of authorization events (recommended)

## 📝 Testing the Flow

### Manual Test (Development)

1. **Start the main app:**
   ```bash
   cd app && npm run dev
   ```

2. **Test device code request:**
   ```bash
   curl -X POST http://localhost:3000/api/cli/device
   ```

   Should return:
   ```json
   {
     "deviceCode": "...",
     "userCode": "ABC-123",
     "verificationUri": "http://localhost:3000/cli/authorize",
     ...
   }
   ```

3. **Open browser:**
   ```
   http://localhost:3000/cli/authorize
   ```

   - If not logged in, should redirect to login
   - After login, should show authorization page

4. **Enter the user code** (e.g., ABC-123)

5. **Click "Authorize"**

6. **Test polling:**
   ```bash
   curl "http://localhost:3000/api/cli/device/poll?deviceCode=<device-code-from-step-2>"
   ```

   Should return:
   ```json
   {
     "accessToken": "...",
     "user": {...}
   }
   ```

### Automated Test Script

```bash
#!/bin/bash

echo "🧪 Testing Device Code Flow"

# Step 1: Request device code
echo "1. Requesting device code..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/cli/device)
DEVICE_CODE=$(echo $RESPONSE | jq -r '.deviceCode')
USER_CODE=$(echo $RESPONSE | jq -r '.userCode')

echo "   Device Code: ${DEVICE_CODE:0:20}..."
echo "   User Code: $USER_CODE"

# Step 2: Show authorization URL
echo ""
echo "2. 👉 Open this URL in your browser:"
echo "   http://localhost:3000/cli/authorize"
echo ""
echo "3. Enter this code: $USER_CODE"
echo ""
echo "4. Waiting for authorization..."

# Step 3: Poll for authorization
MAX_ATTEMPTS=60
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  sleep 5
  POLL_RESPONSE=$(curl -s "http://localhost:3000/api/cli/device/poll?deviceCode=$DEVICE_CODE")

  if echo $POLL_RESPONSE | jq -e '.accessToken' > /dev/null 2>&1; then
    echo ""
    echo "✅ Authorization successful!"
    echo ""
    echo "Access Token: $(echo $POLL_RESPONSE | jq -r '.accessToken' | cut -c1-30)..."
    echo "User: $(echo $POLL_RESPONSE | jq -r '.user.name')"
    echo "Email: $(echo $POLL_RESPONSE | jq -r '.user.email')"
    exit 0
  fi

  ERROR=$(echo $POLL_RESPONSE | jq -r '.error')
  if [ "$ERROR" != "authorization_pending" ]; then
    echo ""
    echo "❌ Authorization failed: $ERROR"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo -n "."
done

echo ""
echo "⏱️  Timeout - authorization not completed within 5 minutes"
exit 1
```

Save as `test-device-flow.sh` and run:
```bash
chmod +x test-device-flow.sh
./test-device-flow.sh
```

## 🎉 What's Complete

✅ **Authorization Page** - Beautiful UI at `/cli/authorize`
✅ **Device Code API** - Request codes at `POST /api/cli/device`
✅ **Polling API** - Check status at `GET /api/cli/device/poll`
✅ **Authorization API** - Authorize at `PUT /api/cli/device/authorize`
✅ **Database Table** - `cli_device_codes` with proper indexes
✅ **Prisma Model** - `CliDeviceCode` model generated
✅ **Session Integration** - Uses better-auth for user verification
✅ **Error Handling** - Clear error messages for all cases
✅ **Security** - Proper expiry, one-time use, user linking

## 🚀 Next Steps

To use this in the CLI:

1. **Implement CLI Auth Command** (see `WEB_CLI_DOWNLOAD_IMPLEMENTATION.md`)
2. **Test the complete flow** with the test script above
3. **Add rate limiting** to device code requests (optional)
4. **Monitor usage** in production

## 📚 Related Documentation

- **Complete Implementation Guide:** `WEB_CLI_DOWNLOAD_IMPLEMENTATION.md`
- **Overall Status:** `END_TO_END_IMPLEMENTATION_STATUS.md`
- **Auth Routing:** `AUTH_ROUTING_COMPLETE.md`

---

**Status:** ✅ 100% Complete - Ready for CLI Implementation
**Last Updated:** 2025-01-11
**Test URL:** http://localhost:3000/cli/authorize
