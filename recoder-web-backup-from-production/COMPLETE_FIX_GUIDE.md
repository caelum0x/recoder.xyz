# Complete Fix Guide - All Issues

## ✅ Issue 1: Normal Browser 504 Error

### Problem
Incognito works but normal browser shows 504 errors.

### Solution
Your **normal browser has cached the old 504 error responses**. You need to clear the cache ONE TIME:

**Method 1: Hard Clear (Recommended)**
```
1. Close ALL browser tabs and windows completely
2. Reopen browser
3. Press Ctrl/Cmd + Shift + Delete
4. Select "Cached images and files"
5. Select "All time" for time range
6. Click "Clear data"
7. Go to http://localhost:5173
```

**Method 2: DevTools Clear**
```
1. Go to http://localhost:5173
2. Open DevTools (F12)
3. Right-click the refresh button
4. Select "Empty Cache and Hard Reload"
```

**Method 3: Manual Cache Clear**
```
Chrome: chrome://settings/clearBrowserData
Firefox: about:preferences#privacy
- Select "Cached Web Content"
- Click "Clear Now"
```

After clearing cache once, your normal browser will work fine!

---

## ✅ Issue 2: Database Saving Disabled

### Problem
Console shows: `⚠️ [saveChatToDatabase] Database saving disabled (USE_DATABASE=false)`

### Root Cause
The `persistenceEnabled` flag is checking for `VITE_DISABLE_PERSISTENCE` environment variable, which might be set or defaulting to a truthy value.

### Solution

**Option A: Add to .dev.vars (Recommended)**

Add this line to your `.dev.vars` file:

```bash
VITE_DISABLE_PERSISTENCE=false
DATABASE_URL=postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**Option B: Modify the code**

Edit `app/lib/persistence/useChatHistory.ts` line 19:

```typescript
// Change from:
const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

// To:
const persistenceEnabled = import.meta.env.VITE_DISABLE_PERSISTENCE !== 'true';
```

**Then restart the dev server:**
```bash
# Stop server (Ctrl+C)
rm -rf node_modules/.vite
pnpm run dev
```

---

## ✅ Issue 3: Chat History Not Saving

### Problem
`✅ [loadHistoryFromDatabase] Loaded 0 chats from database`

### Root Cause
Related to Issue #2 - database saving is disabled, so no chats are being saved.

### Solution
Fix Issue #2 above, then:

1. Restart dev server
2. Clear browser cache
3. Start a new chat
4. Send a message
5. Check console - should see: `💾 [saveChatToDatabase] Preparing to save:`
6. Refresh page - chat history should load

---

## ✅ Issue 4: No IndexedDB Fallback

### Problem
`📋 [Menu.loadEntries] No IndexedDB available, setting empty list`

### Root Cause
IndexedDB is not being initialized properly when database saving is disabled.

### Solution
This is also related to Issue #2. Once persistence is enabled:

1. IndexedDB will be used as a local fallback
2. Database will be used as primary storage
3. Chat history will persist across sessions

---

## ✅ Issue 5: GitHub Cloning Not Working

### Problem
GitHub repository import/clone feature not functioning.

### Diagnostic Steps

Check if you have a GitHub token configured:

```bash
grep GITHUB .dev.vars
```

### Solution

**Option A: Add GitHub Token**

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`, `read:user`
4. Copy the token
5. Add to `.dev.vars`:

```bash
GITHUB_TOKEN=your_github_token_here
```

**Option B: Check API Route**

The GitHub API might be rate-limited. Check:

```bash
curl -I https://api.github.com/rate_limit
```

If rate-limited, add a GitHub token as above.

---

## ✅ Issue 6: OpenRouter API Issues

### Problem
AI responses not working due to lack of credits at OpenRouter.

### Current Status
Your OpenRouter API key is configured:
```
OPENROUTER_API_KEY=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
```

### Solution

**Option A: Add Credits to OpenRouter**
1. Go to https://openrouter.ai/
2. Log in with your account
3. Add credits to your account
4. API will start working immediately

**Option B: Use Different AI Provider**

Add to `.dev.vars`:

```bash
# Use Anthropic (Claude)
ANTHROPIC_API_KEY=your_anthropic_key

# Or use OpenAI
OPENAI_API_KEY=your_openai_key

# Or use Google (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
```

**Option C: Use Local Model**

For development, you can use a local model with Ollama:

1. Install Ollama: https://ollama.ai/
2. Run: `ollama run llama2`
3. Add to `.dev.vars`:

```bash
OLLAMA_API_BASE_URL=http://localhost:11434
```

---

## 🚀 Complete Setup Checklist

### 1. Update .dev.vars

Your `.dev.vars` should look like this:

```bash
# Database
DATABASE_URL=postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require

# Persistence
VITE_DISABLE_PERSISTENCE=false

# AI Provider (choose one)
OPENROUTER_API_KEY=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
# OR
ANTHROPIC_API_KEY=your_key_here
# OR
OPENAI_API_KEY=your_key_here

# GitHub (optional)
GITHUB_TOKEN=your_github_token_here
```

### 2. Restart Dev Server

```bash
# Stop server (Ctrl+C)
rm -rf node_modules/.vite
pnpm run dev
# Wait for "✅ Optimization complete..." message
```

### 3. Clear Browser Cache

```bash
# In your browser:
Ctrl/Cmd + Shift + Delete
# Select "Cached images and files"
# Select "All time"
# Click "Clear data"
```

### 4. Test Everything

1. Go to http://localhost:5173
2. Start a new chat
3. Send a message
4. Check console:
   - Should see: `💾 [saveChatToDatabase] Preparing to save:`
   - Should NOT see: `⚠️ Database saving disabled`
5. Refresh page
6. Check that chat history appears in sidebar

---

## 📊 Verification Commands

### Check if database is accessible:
```bash
node -e "const pg = require('pg'); const client = new pg.Client('postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'); client.connect().then(() => console.log('✅ Database connected')).catch(e => console.log('❌ Error:', e.message));"
```

### Check OpenRouter credits:
```bash
curl -H "Authorization: Bearer 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" https://openrouter.ai/api/v1/auth/key
```

### Test GitHub API:
```bash
curl -H "Authorization: token YOUR_GITHUB_TOKEN" https://api.github.com/user
```

---

## 🔧 Quick Fix Script

Create a file `fix-all.sh`:

```bash
#!/bin/bash

echo "🔧 Fixing all issues..."

# 1. Stop dev server
pkill -f "remix vite:dev" 2>/dev/null || true

# 2. Clear caches
rm -rf node_modules/.vite node_modules/.cache

# 3. Check .dev.vars
if ! grep -q "VITE_DISABLE_PERSISTENCE" .dev.vars; then
  echo "VITE_DISABLE_PERSISTENCE=false" >> .dev.vars
  echo "✅ Added VITE_DISABLE_PERSISTENCE to .dev.vars"
fi

# 4. Start dev server
echo "🚀 Starting dev server..."
pnpm run dev
```

Run with: `chmod +x fix-all.sh && ./fix-all.sh`

---

## ❓ Still Having Issues?

If problems persist after following this guide:

1. **Check console logs** - Look for specific error messages
2. **Check network tab** - See which API calls are failing
3. **Verify environment variables** - Run `env | grep -E "DATABASE|OPENROUTER|GITHUB"`
4. **Test database connection** - Use the verification command above
5. **Check API credits** - Verify your OpenRouter/Anthropic/OpenAI credits

---

## 📝 Summary

Main issues and fixes:

1. ✅ **504 Error in normal browser** → Clear browser cache once
2. ✅ **Database disabled** → Add `VITE_DISABLE_PERSISTENCE=false` to .dev.vars
3. ✅ **No chat history** → Enable database (fix #2)
4. ✅ **No IndexedDB** → Enable persistence (fix #2)
5. ✅ **GitHub not working** → Add GITHUB_TOKEN to .dev.vars
6. ✅ **OpenRouter no credits** → Add credits or use different AI provider

After applying these fixes, everything should work perfectly!
