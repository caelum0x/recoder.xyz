# Testing Guide - Quick Verification

## 🚀 Quick Start

1. **Server is running at:** http://localhost:5173
2. **Open DevTools Console** (F12 or Cmd+Option+I)
3. **Clear console** before each test for clarity

---

## ✅ Test Checklist

### Test 1: Suggestion Clicks (CRITICAL)
- [ ] Click "Todo App with Backend" example
- [ ] Prompt appears in textarea
- [ ] Message sends automatically
- [ ] Console shows: `📤 Sending message:`
- [ ] Loading indicator appears on send button

**If it fails:**
- Check console for `⚠️ Message not sent`
- Verify textarea has content

---

### Test 2: Template Selection
- [ ] Scroll to "Quick Start Templates"
- [ ] Click any template card
- [ ] Prompt is generated and sent
- [ ] Console shows: `📤 Sending message:`

---

### Test 3: Workbench Appears
- [ ] Type: "Create index.html with hello world"
- [ ] Press Enter or click send
- [ ] Wait for response (may take 10-30 seconds)
- [ ] Look for console logs:
  - `📥 Response received: 200 OK`
  - `🎨 Artifact opened - showing workbench:`
  - `📂 File action:`
  - `🔧 Workbench render:` with `showWorkbench: true`
- [ ] Workbench panel appears on right side
- [ ] Can see file content

**If workbench doesn't appear:**
- Check if you see `🎨 Artifact opened` in console
- Check network tab for response
- Look for any error messages

---

### Test 4: History Loading
- [ ] Hover near left edge of screen OR click "History" button
- [ ] Sidebar slides open
- [ ] Your conversation appears in "Your Chats"
- [ ] Click on the conversation
- [ ] Messages reload correctly

**If history is empty:**
- Check console for database warnings
- Try: DevTools > Application > IndexedDB > boltHistory
- Delete and refresh if corrupted

---

### Test 5: Error Handling
- [ ] Send empty message (should not send)
- [ ] Console shows: `⚠️ Message not sent - empty input`
- [ ] Try with invalid API (to test error display)

---

## 🔍 Console Log Reference

### Normal Flow:
```
📤 Sending message: Create index.html...
📤 Sending without file modifications
📥 Response received: 200 OK
🎨 Artifact opened - showing workbench: {messageId: "...", title: "..."}
📂 File action: {type: "file", filePath: "index.html"}
✅ Action closed: file
✅ Streaming finished
🔧 Workbench render: {chatStarted: true, showWorkbench: true, filesCount: 1}
```

### Expected Warnings (OK):
```
⚠️ Route discovery/manifest behavior is changing... (Remix v7 warning - ignore)
⚠️ Data fetching is changing... (Remix v7 warning - ignore)
```

### Problems to Watch For:
```
❌ Chat API error: ...
❌ Failed to load chat history: ...
⚠️ Chat persistence is unavailable
⚠️ Message not sent - empty input or already loading
```

---

## 🐛 Common Issues & Solutions

### Issue: "Suggestions don't work"
**Solution:**
1. Check if console shows `📤 Sending message:`
2. If not, verify browser console for errors
3. Try clicking slower (wait for component to mount)
4. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

### Issue: "Workbench doesn't show"
**Solution:**
1. Verify console has `🎨 Artifact opened`
2. If not, the AI might not be sending proper format
3. Try a simpler prompt: "Create a hello.txt file with 'Hello World'"
4. Check `.env.local` has valid API keys

### Issue: "History is empty"
**Solution:**
1. F12 > Application > IndexedDB
2. Check if `boltHistory` exists
3. Check if it has data in `chats` store
4. If corrupted, delete database and refresh

### Issue: "Database errors"
**Solution:**
1. Clear IndexedDB: Application > IndexedDB > Right-click `boltHistory` > Delete
2. Refresh page
3. Try sending a message again

### Issue: "Page frozen/not responding"
**Solution:**
1. Check console for infinite loop errors
2. Check network tab - might be waiting for API
3. Hard refresh page
4. Check `.env.local` configuration

---

## 📊 Success Criteria

All tests should pass with:
- ✅ Suggestions clickable and working
- ✅ Messages send successfully
- ✅ Workbench appears when files are created
- ✅ History saves and loads
- ✅ No critical errors in console (ignore Remix warnings)

---

## 🎯 What to Report

If something doesn't work, report:
1. Which test failed
2. Exact console output (copy/paste)
3. Screenshot if UI issue
4. Steps to reproduce

Example:
```
Test 1 Failed: Suggestion Clicks
Console output:
  ⚠️ Message not sent - empty input or already loading
  
Steps:
1. Clicked "Todo App" example
2. Nothing happened
3. Textarea remained empty
```

---

## 🔧 Dev Tools Tips

**Clear console between tests:**
```javascript
console.clear()
```

**Check workbench state:**
```javascript
// Paste in console:
import('~/lib/stores/workbench').then(m => {
  console.log('Workbench visible:', m.workbenchStore.showWorkbench.get());
  console.log('Files count:', Object.keys(m.workbenchStore.files.get()).length);
});
```

**Check chat state:**
```javascript
// Paste in console:
import('~/lib/stores/chat').then(m => {
  console.log('Chat started:', m.chatStore.get().started);
});
```

---

Good luck testing! The fixes should resolve all 5 issues mentioned. If you still see problems, the console logs will help identify what's happening.
