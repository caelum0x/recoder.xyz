# Quick Test Guide - Database Integration

## ⚡ 5-Minute Test Script

Follow these steps to verify the database integration is working:

### Step 1: Run Migration (2 minutes)

```sql
-- Go to https://console.neon.tech/ → SQL Editor
-- Copy and paste this entire block:

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  anonymous_id VARCHAR(255),
  title VARCHAR(500),
  description TEXT,
  url_id VARCHAR(255) UNIQUE NOT NULL,
  total_messages INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  project_id UUID,
  artifact_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_used VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  stream_complete BOOLEAN DEFAULT TRUE,
  tool_calls JSONB,
  artifacts JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_url_id ON chat_sessions(url_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_anonymous_id ON chat_sessions(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);

-- Verify tables were created:
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('chat_sessions', 'chat_messages');
```

**Expected Result:** Should show 2 rows (chat_sessions, chat_messages)

---

### Step 2: Test Chat Saving (2 minutes)

1. **Open your app**: http://localhost:5173

2. **Open DevTools Console** (Press F12, go to Console tab)

3. **Send a test message**:
   - Type: "Create a simple HTML page"
   - Press Enter
   - Wait for response

4. **Watch console for these logs**:
   ```
   ✅ GOOD SIGNS:
   🆔 Created new anonymous ID: anon_XXXXX
   💾 Storing chat history: 2 messages
   💾 Saving chat to database: { anonymousId: "anon_...", urlId: "..." }
   ✅ Chat saved to database: { sessionId: "...", urlId: "..." }

   ❌ BAD SIGNS:
   ❌ Database save failed: ...
   ⚠️ Not storing history: no messages
   ```

5. **Check your database**:
   ```sql
   -- In Neon SQL Editor:
   SELECT * FROM chat_sessions ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 5;
   ```

   **Expected:** You should see your chat session and messages!

---

### Step 3: Test Chat History Loading (1 minute)

1. **Click the clock icon** (next to "Recoder" logo in top-left)

2. **Watch console for**:
   ```
   📋 Loading chat history from database...
   ✅ Loaded X chats from database
   ```

3. **Verify**:
   - Your chat appears in the sidebar
   - Description shows your first message
   - Click it → Should load the full chat

---

## 🎯 Quick Verification Checklist

Run through this checklist:

```
Database Setup:
□ Migration ran without errors
□ Tables exist (chat_sessions, chat_messages)
□ Indexes created successfully

Chat Saving:
□ Console shows "💾 Saving chat to database"
□ Console shows "✅ Chat saved to database"
□ No "❌ Database save failed" errors
□ Database has new records

Chat Loading:
□ History button opens sidebar
□ Console shows "📋 Loading chat history"
□ Chats appear in sidebar
□ Clicking chat loads messages

Anonymous ID:
□ Console shows "🆔 Created new anonymous ID"
□ localStorage has 'bolt_anonymous_id'
□ Same ID persists across refreshes
```

---

## 🔍 SQL Queries for Testing

### Check if data is being saved:
```sql
-- Count total sessions
SELECT COUNT(*) as total_sessions FROM chat_sessions;

-- View recent sessions
SELECT 
  id,
  anonymous_id,
  LEFT(description, 50) as description,
  total_messages,
  created_at
FROM chat_sessions 
ORDER BY created_at DESC 
LIMIT 5;

-- View recent messages
SELECT 
  session_id,
  role,
  LEFT(content, 100) as content_preview,
  created_at
FROM chat_messages 
ORDER BY created_at DESC 
LIMIT 10;

-- Check messages per session
SELECT 
  s.url_id,
  s.description,
  COUNT(m.id) as message_count
FROM chat_sessions s
LEFT JOIN chat_messages m ON m.session_id = s.id
GROUP BY s.id, s.url_id, s.description
ORDER BY s.created_at DESC;
```

### Debug queries:
```sql
-- Find sessions without messages
SELECT * FROM chat_sessions 
WHERE id NOT IN (SELECT DISTINCT session_id FROM chat_messages);

-- Find orphaned messages
SELECT * FROM chat_messages 
WHERE session_id NOT IN (SELECT id FROM chat_sessions);

-- Check anonymous IDs
SELECT anonymous_id, COUNT(*) as session_count
FROM chat_sessions
WHERE anonymous_id IS NOT NULL
GROUP BY anonymous_id;
```

---

## 🧪 Advanced Testing

### Test 1: Multiple Chats
```
1. Send message: "Create a React app"
2. Click "Start new chat"
3. Send message: "Build a Node.js API"
4. Click history button
5. Verify: Both chats appear in sidebar
```

### Test 2: Chat Persistence
```
1. Send a message
2. Copy the URL (e.g., /chat/abc123)
3. Close browser completely
4. Open browser again
5. Paste the URL
6. Verify: Chat loads with all messages
```

### Test 3: Cross-Tab
```
1. Open chat in Tab A, send message
2. Open new Tab B, go to app
3. Click history button
4. Verify: Chat from Tab A appears
```

### Test 4: Fallback to IndexedDB
```
1. Stop database (or disconnect internet)
2. Send a message
3. Check console: Should show fallback to IndexedDB
4. Restart database
5. Next message should save to database
```

---

## 🐛 Common Issues & Fixes

### Issue: "DATABASE_URL not configured"

**Fix:**
```bash
# Check .dev.vars has:
DATABASE_URL=postgresql://...

# Restart dev server:
# Ctrl+C, then:
npm run dev
```

### Issue: Tables don't exist

**Fix:**
```sql
-- Re-run migration
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
-- Then run CREATE TABLE statements again
```

### Issue: Anonymous ID keeps changing

**Fix:**
```javascript
// In browser console:
localStorage.getItem('bolt_anonymous_id')
// Should return same value each time

// If null or changing:
localStorage.clear();
location.reload();
```

### Issue: Chats not showing in sidebar

**Check:**
1. Console for loading errors
2. Database has records (SQL query)
3. Description is not null
4. urlId is not null

**Fix:**
```sql
-- Update null descriptions:
UPDATE chat_sessions 
SET description = 'Untitled Chat'
WHERE description IS NULL;
```

---

## ✅ Success Criteria

Your implementation is working if:

1. ✅ Migration runs without errors
2. ✅ Console shows database save success
3. ✅ Database contains your chat records
4. ✅ History sidebar shows your chats
5. ✅ Clicking chat loads messages
6. ✅ No errors in console
7. ✅ Chat persists after browser refresh

---

## 📊 Expected Results

### After sending 1 message:

**Console:**
```
🆔 Created new anonymous ID: anon_1234567890_abc123
💾 Storing chat history: 2 messages
💾 Saving chat to database: { anonymousId: "anon_...", ... }
✅ Chat saved to database: { sessionId: "uuid-here", urlId: "chat-id" }
```

**Database:**
```sql
-- chat_sessions should have 1 row:
id: "uuid"
anonymous_id: "anon_1234567890_abc123"
description: "Create a simple HTML page"
total_messages: 2
url_id: "chat-id"

-- chat_messages should have 2 rows:
Row 1: role='user', content='Create a simple HTML page'
Row 2: role='assistant', content='<response>'
```

**Sidebar:**
```
Your Chats
  Today
    Create a simple HTML page (just now)
```

---

## 🎉 You're Done!

If all tests pass, your database integration is working perfectly!

**What you can do now:**
- ✅ Chats are saved permanently
- ✅ History works across sessions
- ✅ No more lost data
- ⏳ Add authentication for cross-device sync

**Next:** Read `DATABASE_INTEGRATION_COMPLETE.md` for authentication setup.
