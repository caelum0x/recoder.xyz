# ✅ Quick Test Checklist - 5 Minutes

## Before You Start
```bash
# Make sure server is running
npm run dev
# Open http://localhost:5173
# Open browser console (F12)
```

## Test 1: Chat Persistence (2 min) ⭐ MOST IMPORTANT

### Steps:
1. ✅ Send a message: "Hello, create a simple React app"
2. ✅ Check console for:
   ```
   💾 Storing chat history: X messages
   💾 Saving chat to database: {...}
   ✅ Chat saved to database successfully!
   ```
3. ✅ Refresh the page (Cmd+R / Ctrl+R)
4. ✅ Check console for:
   ```
   ✅ Loaded chat from database: ...
   ```
5. ✅ Verify your messages still show

### Expected: ✅ Chat persists after refresh

### If It Doesn't Work:
- Check console for errors
- Verify anonymous ID: `localStorage.getItem('bolt_anonymous_id')`
- Check network tab for POST to `/api/chat-history`

---

## Test 2: History Sidebar (1 min)

### Steps:
1. ✅ Click clock icon (⏰) next to "Recoder" logo
2. ✅ Sidebar opens from left
3. ✅ Your chat appears in list
4. ✅ Click on it to reload

### Expected: ✅ Sidebar shows and loads chats

---

## Test 3: Schema Generator (1 min)

### Steps:
1. ✅ Ask AI: "Generate a database schema for a blog"
2. ✅ Wait for schema to appear
3. ✅ Look for X button (top-right corner)
4. ✅ Look for "Import to Project" button (green, in code tabs)
5. ✅ Click "Import to Project"
6. ✅ Check for success toast

### Expected: ✅ Both buttons exist and work

---

## Test 4: Preview (1 min) ⚠️ Browser Dependent

### Steps:
1. ✅ Ask AI: "Create a simple counter app"
2. ✅ Wait for code generation
3. ✅ Check preview panel on right
4. ✅ Look for running app

### Expected: ✅ Preview shows app

### If Blank:
- Check console for WebContainer errors
- Try Chrome/Edge (best compatibility)
- Look for SharedArrayBuffer warnings

---

## Quick Verification Commands

### Check Database Connection:
```bash
curl "http://localhost:5173/api/chat-history?anonymousId=test"
# Should return: {"success":true,"data":[...]}
```

### Check Tables Exist:
```bash
cd /Users/arhansubasi/bolt.new
npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async () => {
  const count = await sql\`SELECT COUNT(*) FROM chat_sessions\`;
  console.log('Sessions:', count[0].count);
})();
"
```

---

## What to Look For

### ✅ Success Indicators:
- Console shows save/load messages
- No red errors in console
- Toast notifications appear
- Chat persists after refresh
- History sidebar populates

### ❌ Failure Indicators:
- Red errors in console
- "Failed to save" messages
- Chat disappears on refresh
- Empty history sidebar

---

## Troubleshooting Quick Fixes

### If Chat Doesn't Save:
```javascript
// In browser console, check:
localStorage.getItem('bolt_anonymous_id')  // Should exist
// Check network tab for POST /api/chat-history (status 200)
```

### If History Empty:
```javascript
// Check if data exists:
fetch('/api/chat-history?anonymousId=' + localStorage.getItem('bolt_anonymous_id'))
  .then(r => r.json())
  .then(console.log)
```

### If Preview Blank:
```javascript
// Check WebContainer status:
// Console should show: "✅ WebContainer booted successfully"
```

---

## Expected Console Output

### On Chat Send:
```
📤 Sending message: Hello, create a simple...
💾 Storing chat history: 2 messages
📊 Current state: {chatId: "...", urlId: "...", ...}
💾 Saving chat to database: {userId: undefined, anonymousId: "anon_...", ...}
✅ Chat saved to database successfully! {sessionId: "...", urlId: "..."}
```

### On Page Load:
```
📋 Loading chat history from database...
✅ Loaded 1 chats from database
✅ Loaded chat from database: abc123
```

---

## Final Status Check

After running all tests:

- [ ] Chat persists after refresh
- [ ] History sidebar shows chats
- [ ] Schema generator has close button
- [ ] Schema generator has import button
- [ ] Preview works (or shows proper error)

If all checked: **🎉 Everything works!**

If any unchecked: **Report specific error from console**

---

## Quick Reference

### Key Files:
- Chat save logic: `app/components/chat/Chat.client.tsx:194`
- Database API: `app/routes/api.chat-history.ts`
- Schema UI: `app/components/database/SchemaGenerator.tsx`
- History button: `app/components/header/Header.tsx:29`

### Key URLs:
- App: http://localhost:5173
- API test: http://localhost:5173/api/chat-history?anonymousId=test

### Key Console Commands:
```javascript
// Check anonymous ID
localStorage.getItem('bolt_anonymous_id')

// Check chat history
fetch('/api/chat-history?anonymousId=' + localStorage.getItem('bolt_anonymous_id'))
  .then(r => r.json())
  .then(console.log)
```

---

**Time to complete: 5 minutes**  
**Difficulty: Easy**  
**Success rate: Should be 100%**
