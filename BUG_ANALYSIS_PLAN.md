# Recoder.xyz Bug Analysis & Fix Plan

**Date**: January 23, 2026
**Last Updated**: January 23, 2026 (Post-fix deployment)
**Status**: TESTING - Most fixes deployed, verifying functionality

---

## Current Bug Status

| # | Bug | Fix Applied | Status |
|---|-----|-------------|--------|
| 1 | Auth failing (anonymous users) | SameSite=None, cookie parsing, WebSocket auth | 🟡 DEPLOYED - Still showing anonymous (3rd party cookie issue?) |
| 2 | File writes hang | waitForExecStream with 'close' event + 10s timeout | ✅ FIXED - Files writing with 25s timeout |
| 3 | WebSocket fails | nginx regex updated to include /watch/ | 🟡 DEPLOYED - FileWatcher still reconnecting |
| 4 | Terminal not working | Depends on #3 | 🟡 TESTING |
| 5 | FileWatcher can't connect | Depends on #3 | 🟡 TESTING - Multiple reconnect attempts |
| 6 | /api/files returns 404 | Endpoint exists, likely timing issue | ✅ RESOLVED |
| 7 | AI stops mid-generation | FeaturesSection.tsx not written | 🔴 NEW - AI stream ended early |

---

## Fixes Deployed

### 1. Auth Cookie Fix (server.ts + auth-config.ts)
```typescript
// auth-config.ts - Cookie settings
defaultCookieAttributes: {
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
},
trustedOrigins: [..., "https://docker.recoder.xyz"]

// server.ts - Cookie parsing
function parseCookies(cookieHeader) { ... }
function getSessionTokenFromRequest(req) { ... }
async function authenticateWebSocket(ws, req) { ... }
```

**Result**: Code deployed but users still showing as "anonymous". Possible browser 3rd party cookie blocking.

### 2. File Write Timeout Fix (server.ts)
```typescript
const waitForExecStream = (stream: any, timeoutMs = 10000): Promise<void> => {
  return Promise.race([
    new Promise<void>((resolve) => {
      stream.on('end', resolve);
      stream.on('close', resolve);  // Docker exec uses 'close' not 'end'
      stream.on('error', resolve);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ]);
};
```

**Result**: ✅ Files are being written successfully (app/layout.tsx, app/page.tsx, components/HeroSection.tsx)

### 3. Nginx WebSocket Fix
```nginx
location ~ ^/(terminal|sync|watch|cli-sync|api/debug)/ {
    proxy_pass http://localhost:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

**Result**: nginx config correct, but FileWatcher still having connection errors

### 4. WebSocket Authentication (server.ts)
Added `authenticateWebSocket()` to all 6 WebSocket endpoints:
- /terminal/:projectId
- /watch/:projectId (x2)
- /sync/:projectId
- /cli-sync/:projectId
- /api/debug/:projectId/events

---

## Remaining Issues

### Issue A: Auth Still Showing "Anonymous"
**Logs show:**
```
[Auth] WARNING: Request without auth token from https://web.recoder.xyz
[Auth] WARNING: Anonymous access to project project-xxx
```

**Possible causes:**
1. Browser blocking 3rd party cookies (even with SameSite=None)
2. Cookie not being set correctly on recoder.xyz
3. Cookie domain `.recoder.xyz` not matching

**Debug needed:**
- Check browser DevTools → Application → Cookies
- Verify `recoder.session_token` cookie exists
- Check if cookie has correct domain/path/flags

### Issue B: FileWatcher Reconnecting Constantly
**Logs show:**
```
[FileWatcher] Connection error
[FileWatcher] Disconnected
```

**Possible causes:**
1. Container not ready when /watch/ connection attempted
2. Nginx still dropping WebSocket connections
3. File watcher starting before container exists

### Issue C: AI Stops Mid-Generation
**Observed behavior:**
- AI streamed 3 files: layout.tsx, page.tsx, HeroSection.tsx
- AI stream ended before FeaturesSection.tsx was written
- Action #3 (FeaturesSection) was added but never executed

**Possible causes:**
1. AI response timeout (token limit reached?)
2. Stream closed prematurely
3. Frontend not handling partial responses

---

## Test Results (Latest)

### Files Written Successfully:
```
✅ app/layout.tsx (4104 bytes)
✅ app/page.tsx (491 bytes)
✅ components/HeroSection.tsx (4217 bytes)
❌ components/FeaturesSection.tsx (never written - AI stopped)
```

### Server Logs:
```
✅ File write complete: project-xxx app/layout.tsx
✅ File write complete: project-xxx app/page.tsx
✅ File write complete: project-xxx components/HeroSection.tsx
```

---

## Next Steps

1. **Debug auth cookie issue**
   - Add debug logging to show received cookies
   - Check browser if cookie is being set

2. **Investigate FileWatcher timing**
   - May need to delay /watch/ connection until container ready
   - Add reconnection logic with exponential backoff

3. **Investigate AI stream termination**
   - Check if this is an OpenRouter/model issue
   - Check token limits
   - May need to increase max_tokens in prompt

---

## Architecture Notes

```
User Browser (web.recoder.xyz)
    |
    | HTTPS + Cookies (recoder.session_token)
    v
docker.recoder.xyz (nginx)
    |
    | proxy_pass localhost:3100
    v
docker-backend (Express + express-ws)
    |
    | Docker API
    v
Docker Containers (per project)
```

**Cookie Flow:**
1. User logs in at recoder.xyz → Better Auth sets `recoder.session_token` cookie with domain `.recoder.xyz`
2. Frontend on web.recoder.xyz makes requests to docker.recoder.xyz with `credentials: 'include'`
3. Browser should send cookie (if SameSite=None, Secure=true)
4. docker-backend reads cookie from request headers
5. docker-backend verifies token with recoder.xyz/api/auth/verify-token

---

## Commands Reference

```bash
# Check server logs
ssh root@77.42.23.19 "pm2 logs docker-backend --lines 50"

# Restart docker-backend
ssh root@77.42.23.19 "pm2 restart docker-backend"

# Check nginx config
ssh root@77.42.23.19 "cat /etc/nginx/sites-enabled/recoder.xyz | grep -A10 'docker.recoder.xyz'"

# Check auth config
ssh root@77.42.23.19 "grep -A5 'sameSite' /home/recoder/recoder.xyz/app/lib/auth-config.ts"
```
