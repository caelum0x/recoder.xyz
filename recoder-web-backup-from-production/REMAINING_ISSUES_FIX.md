# Fix Remaining Issues

## Issue 1: Database Saving Disabled

### Problem
Console shows: `⚠️ [saveChatToDatabase] Database saving disabled (USE_DATABASE=false)`
And: `✅ [loadHistoryFromDatabase] Loaded 0 chats from database`

### Root Cause
Even though `VITE_DISABLE_PERSISTENCE=false` is set, Vite environment variables need the `VITE_` prefix to be accessible in the browser, but the check is happening incorrectly.

### Fix

1. **Initialize the database first:**
```bash
pnpm run db:init
```

This will create the necessary tables in your Neon database.

2. **Restart dev server:**
```bash
# Stop server (Ctrl+C)
rm -rf node_modules/.vite
pnpm run dev
```

3. **Test in browser:**
- Go to http://localhost:5173 (incognito)
- Send a message
- Check console - should see database saves

---

## Issue 2: No Chat History

### Problem
No chats being saved or loaded from database.

### Fix Steps

1. **Verify database connection:**
```bash
node -e "const pg = require('pg'); const client = new pg.Client('$(grep DATABASE_URL .dev.vars | cut -d= -f2-)'); client.connect().then(() => { console.log('✅ Database connected'); client.end(); }).catch(e => console.log('❌ Error:', e.message));"
```

2. **Initialize database schema:**
```bash
pnpm run db:init
```

3. **Verify tables were created:**
```bash
pnpm run db:verify
```

4. **Clear browser storage and test:**
- Open DevTools (F12)
- Go to Application tab
- Clear all storage
- Refresh page
- Send a test message
- Check if it saves

---

## Issue 3: GitHub Cloning Not Working

### Problem
Can't import/clone GitHub repositories.

### Fix

1. **Get a GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `read:user`
   - Generate and copy the token

2. **Add to .dev.vars:**
```bash
GITHUB_TOKEN=ghp_your_token_here
```

3. **Add to .env.local as well:**
```bash
GITHUB_TOKEN=ghp_your_token_here
```

4. **Restart server:**
```bash
pnpm run dev
```

5. **Test:**
- Try importing a GitHub repo
- Should work now

---

## Issue 4: OpenRouter Out of Credits

### Problem
OpenRouter API has no credits, so AI responses don't work.

### Current API Key
```
OPENROUTER_API_KEY=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
```

### Solutions (Choose One)

**Option A: Add Credits to OpenRouter (Easiest)**
1. Go to https://openrouter.ai/
2. Log in
3. Add credits to your account ($5-10 should last a while)
4. Done! Your current API key will work

**Option B: Use Anthropic (Claude) - Best Quality**
1. Get API key from: https://console.anthropic.com/
2. Add to .dev.vars:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your_key_here
```
3. Restart server

**Option C: Use OpenAI (ChatGPT) - Most Popular**
1. Get API key from: https://platform.openai.com/api-keys
2. Add to .dev.vars:
```bash
OPENAI_API_KEY=sk-your_key_here
```
3. Restart server

**Option D: Use Google Gemini (Free Tier Available)**
1. Get API key from: https://makersuite.google.com/app/apikey
2. Add to .dev.vars:
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```
3. Restart server

**Option E: Use Local Ollama (Completely Free)**
1. Install Ollama: https://ollama.ai/download
2. Run: `ollama run llama2` or `ollama run codellama`
3. Add to .dev.vars:
```bash
OLLAMA_API_BASE_URL=http://localhost:11434
```
4. Restart server

---

## Issue 5: IndexedDB Not Available

### Problem
`📋 [Menu.loadEntries] No IndexedDB available, setting empty list`

### Why This Happens
IndexedDB initialization is failing, probably because persistence is detected as disabled.

### Fix

This should be resolved once database persistence is working (Issue #1 fix).

However, if it persists:

1. **Check browser compatibility:**
   - IndexedDB is supported in all modern browsers
   - Make sure you're not in private/incognito mode (IndexedDB is limited there)

2. **Clear browser data:**
   - F12 → Application → Clear storage → Clear all

3. **Test in regular browser window** (not incognito)

---

## Complete Fix Script

Create `fix-database-and-ai.sh`:

```bash
#!/bin/bash

echo "🔧 Fixing Database and AI Issues"
echo "=================================="

# 1. Initialize database
echo "📊 Initializing database..."
pnpm run db:init

# 2. Verify database
echo "✅ Verifying database..."
pnpm run db:verify

# 3. Check .dev.vars
echo "📝 Checking configuration..."
if grep -q "DATABASE_URL" .dev.vars; then
  echo "✅ DATABASE_URL configured"
else
  echo "❌ DATABASE_URL missing!"
fi

if grep -q "OPENROUTER_API_KEY\|ANTHROPIC_API_KEY\|OPENAI_API_KEY" .dev.vars; then
  echo "✅ AI API key configured"
else
  echo "⚠️  No AI API key found!"
fi

if grep -q "GITHUB_TOKEN" .dev.vars; then
  echo "✅ GitHub token configured"
else
  echo "⚠️  GitHub token missing (optional)"
fi

# 4. Clear caches
echo "🧹 Clearing caches..."
rm -rf node_modules/.vite

echo ""
echo "=================================="
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add missing API keys to .dev.vars if needed"
echo "2. Run: pnpm run dev"
echo "3. Test chat functionality"
echo ""
```

---

## Testing Checklist

After applying fixes, test:

- [ ] Database Connection
  ```bash
  pnpm run db:verify
  ```

- [ ] Chat Saving
  - Send a message
  - Check console for: `💾 [saveChatToDatabase] Preparing to save:`
  - Should NOT see: `⚠️ Database saving disabled`

- [ ] Chat History
  - Refresh page
  - Sidebar should show previous chats

- [ ] AI Responses
  - Send a message
  - Should get AI response
  - If not, check API credits/keys

- [ ] GitHub Import (if token added)
  - Try importing a repo
  - Should work

---

## Quick Commands

```bash
# Initialize database
pnpm run db:init

# Verify database
pnpm run db:verify

# Check database tables
pnpm run db:seed  # Optional: add sample data

# Restart with clean cache
rm -rf node_modules/.vite && pnpm run dev

# Test API connection
curl -H "Authorization: Bearer $(grep OPENROUTER_API_KEY .dev.vars | cut -d= -f2-)" https://openrouter.ai/api/v1/auth/key
```

---

## Expected Console Output (When Working)

```
💾 [useChatHistory] Storing chat history: 2 messages
📊 [useChatHistory] Current state: {...}
💾 [useChatHistory] Saving to storage: {...}
💾 [saveChatToDatabase] Preparing to save: {...}
✅ [saveChatToDatabase] Successfully saved to database
📊 [useChatHistory] Save complete. Database: YES IndexedDB: YES
```

---

## Summary

1. **Database** → Run `pnpm run db:init` to create tables
2. **Chat History** → Will work once database is initialized
3. **GitHub** → Add GITHUB_TOKEN to .dev.vars
4. **AI** → Add credits to OpenRouter OR use different provider
5. **IndexedDB** → Will work once persistence is enabled

Apply these fixes in order, test each one, and you should be all set!
