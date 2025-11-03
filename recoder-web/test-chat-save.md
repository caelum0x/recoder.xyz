# Chat History Save Test Plan

## How to Test the Fix

### Test 1: Basic Chat Saving

1. **Start the dev server**
   ```bash
   npm run dev
   ```

2. **Open browser console** (F12 or Cmd+Option+I)

3. **Start a new chat**
   - Navigate to your app
   - Type: "Create a simple React counter component"
   - Click Send

4. **Watch for logs**
   You should see:
   ```
   📤 Sending message: Create a simple React counter...
   💾 Saving chat history: { messageCount: 1, isStreaming: false }
   💾 [useChatHistory] Saving to storage:
     chatId: "..."
     urlId: "..."
     messageCount: 1
     fileCount: 0
   📤 [saveChatToDatabase] Sending request to /api/chat-history
   ✅ [saveChatToDatabase] Chat saved to database successfully!
   ✅ Chat history saved successfully
   ```

5. **Watch for visual indicator**
   - Top-right corner should show "Saving chat..." (blue)
   - Then "Saved" (green) for 3 seconds

### Test 2: Streaming Save

1. **Send a message that requires long response**
   - Type: "Create a full-stack application with React, Node.js, and PostgreSQL"
   - Click Send

2. **Watch for periodic saves during streaming**
   You should see saves every ~2 seconds:
   ```
   💾 Saving chat history: { messageCount: 2, isStreaming: true }
   💾 Saving chat history: { messageCount: 2, isStreaming: true }
   💾 Saving chat history: { messageCount: 2, isStreaming: false, streamingJustFinished: true }
   ```

3. **Verify save indicator pulses**
   - Should show "Saving..." multiple times
   - Final "Saved" when streaming completes

### Test 3: File Content Saving

1. **Send a message to create files**
   - Type: "Create a TypeScript Express API with authentication"
   - Wait for files to be created in workbench

2. **Check console for file snapshot**
   ```
   💾 [useChatHistory] Saving to storage:
     fileCount: 8
     totalFileSize: "15.67 KB"
     files: "src/index.ts, src/routes/auth.ts, ..."
   
   💾 [saveChat] Syncing messages:
     fileCount: 8
     totalFileSize: "15.67 KB"
   ```

3. **Verify files are listed in logs**

### Test 4: Page Refresh Recovery

1. **After creating files, note the URL**
   - Example: `http://localhost:5173/chat/abc123`

2. **Refresh the page** (F5 or Cmd+R)

3. **Verify everything loads**
   - All messages should reappear
   - All files should be in workbench
   - Console should show:
     ```
     📂 [loadChatFromDatabase] Loading chat: abc123
     📂 [loadChatFromDatabase] Restoring file snapshot: 8 files
     ✅ Loaded chat from database: abc123
     ```

4. **Continue the conversation**
   - Send another message
   - Verify it saves and appears correctly

### Test 5: Database Verification

If you have access to the database:

```sql
-- Check recent chats
SELECT 
  cs.url_id,
  cs.title,
  cs.total_messages,
  cs.metadata->>'fileCount' as files,
  cs.metadata->>'totalFileSize' as size,
  cs.updated_at
FROM chat_sessions cs
ORDER BY cs.updated_at DESC
LIMIT 5;

-- Check messages for a specific chat
SELECT 
  cm.role,
  LENGTH(cm.content) as content_length,
  cm.created_at
FROM chat_messages cm
JOIN chat_sessions cs ON cs.id = cm.session_id
WHERE cs.url_id = 'YOUR_CHAT_ID'
ORDER BY cm.created_at ASC;

-- Check file snapshot
SELECT 
  cs.url_id,
  jsonb_object_keys(cs.metadata->'fileSnapshot') as file_path,
  LENGTH(cs.metadata->'fileSnapshot'->jsonb_object_keys(cs.metadata->'fileSnapshot')::text) as file_size
FROM chat_sessions cs
WHERE cs.url_id = 'YOUR_CHAT_ID';
```

## Expected Results

✅ **Messages**: All chat messages saved completely (not truncated)
✅ **Files**: All workbench files saved with full content
✅ **Streaming**: Messages update during streaming and save periodically
✅ **Visual Feedback**: Save indicator shows saving status
✅ **Persistence**: Page refresh loads everything back
✅ **Logging**: Detailed logs show what's being saved
✅ **Database**: All data stored correctly in PostgreSQL

## Troubleshooting

### Issue: No logs appearing
**Solution**: Check if persistence is enabled
```bash
# Check .env.local
grep VITE_DISABLE_PERSISTENCE .env.local
# Should NOT be set to 'true'
```

### Issue: Save indicator not showing
**Solution**: Check browser console for errors
```javascript
// In browser console
console.log('Save indicator:', document.querySelector('[class*="SaveIndicator"]'));
```

### Issue: Database errors
**Solution**: Verify DATABASE_URL is set
```bash
# Check .dev.vars
grep DATABASE_URL .dev.vars
```

### Issue: Files not saving
**Solution**: Check workbench store
```javascript
// In browser console
workbenchStore.files.get()
// Should show all files
```

## Success Criteria

Your chat history saving is fixed when:

1. ✅ Console shows "💾 Saving chat history" after each message
2. ✅ Console shows "✅ Chat history saved successfully"
3. ✅ Save indicator appears and shows "Saved"
4. ✅ File count and size are logged
5. ✅ Page refresh loads all messages and files
6. ✅ No errors in console
7. ✅ Database contains all data

## Common Scenarios

### Scenario: User creates a complex project
1. Sends multiple prompts
2. Many files created (20+)
3. Large code files (100+ KB total)
4. Result: Everything saved, no data loss

### Scenario: User closes browser mid-stream
1. AI is responding with long answer
2. User closes tab/browser
3. Result: Last saved state preserved (within 2 seconds)

### Scenario: User works on project for hours
1. Multiple chat sessions
2. Many file edits
3. Continuous back-and-forth
4. Result: Complete history maintained

## Performance Expectations

- **Save time**: < 500ms for typical chat
- **Save frequency**: Every 2s during streaming, immediate after
- **File limit**: Supports 100+ files without issues
- **Total size**: Supports 10+ MB of code without issues
- **Load time**: < 1s to restore full chat

## Notes

- Saves are debounced during streaming to avoid excessive writes
- File content is stored in JSONB in database (efficient)
- Messages update incrementally (only changed content)
- Anonymous users are fully supported
- No data is lost even during rapid interactions
