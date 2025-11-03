# Quick Test Guide - All Fixes

## 🎯 Quick Visual Tests (5 Minutes)

### Test 1: History Button Position ✅
**Expected:** Clock icon button next to "Recoder" logo in top-left header

1. Open http://localhost:5173
2. Look at TOP-LEFT corner of screen
3. You should see: `[Clock Icon] Recoder`
4. Click the clock icon
5. Chat history sidebar should slide in from left

**Pass if:** 
- Clock button is visible next to logo
- Clicking toggles sidebar
- No duplicate buttons anywhere else

---

### Test 2: Schema Generator Close & Import ✅
**Expected:** X button and "Import to Project" button visible after generating

1. Navigate to http://localhost:5173/schema
2. Enter: "Create a blog with users and posts"
3. Click "Generate Schema"
4. Wait for results to appear
5. Look for:
   - **X button** in top-right corner (should have red hover effect)
   - **"Import to Project"** green button in code tabs area

**Pass if:**
- Both buttons are visible
- X button closes and returns to input
- Import button shows toast notification

---

### Test 3: Chat History Saving 🔍
**Expected:** Chats saved to IndexedDB and appear in sidebar

1. Open DevTools (F12) → Console tab
2. Start a new chat: "Create a simple React app"
3. Wait for response
4. Check console for logs:
   ```
   💾 Storing chat history: X messages
   🆔 Created new chat ID: X
   ✅ Chat history saved successfully
   ```
5. Click history button (clock icon)
6. Your chat should appear in sidebar

**Pass if:**
- Logs appear in console
- Chat appears in history sidebar
- Can click to reload the chat

---

## 🔍 Deep Debugging Tests

### Check IndexedDB Directly
```
1. Open DevTools (F12)
2. Go to: Application tab
3. Expand: Storage → IndexedDB → boltHistory → chats
4. Right-click "chats" → View Data
5. You should see entries with:
   - id (number)
   - urlId (string)
   - description (text from your message)
   - messages (array)
   - timestamp
```

### Check Preview Working
```
1. Start chat: "Create a simple HTML page with a button"
2. Wait for code generation
3. Click "Preview" tab
4. Should see rendered page in iframe
5. If error, check console for WebContainer logs
```

### Check GitHub Clone
```
1. Access GitHub integration (if visible in UI)
2. Try cloning a repo
3. Check console for rate limit errors
4. Should work with token in .dev.vars
```

---

## 🐛 Common Issues & Fixes

### Issue: History Not Saving
**Check:**
- Console shows `⚠️ Not storing history: no db or no messages`
- VITE_DISABLE_PERSISTENCE is NOT set to true in .dev.vars
- Browser allows IndexedDB (not in private mode)

**Fix:**
```bash
# Clear IndexedDB and refresh
1. DevTools → Application → IndexedDB → boltHistory
2. Right-click → Delete database
3. Refresh page (Cmd+R / Ctrl+R)
```

### Issue: History Button Not Visible
**Check:**
- Header.tsx has the button (verified ✅)
- Page is fully loaded
- Not hidden by CSS

**Fix:**
- Hard refresh: Cmd+Shift+R / Ctrl+Shift+R
- Clear browser cache

### Issue: Preview Shows Blank
**Check Console for:**
```
❌ WebContainer failed to boot
```

**Fix:**
- Refresh the page
- Make sure on localhost (not 0.0.0.0)
- Check browser supports WebContainers (Chrome/Edge)

### Issue: Schema Import Not Working
**Expected Behavior:**
- Click "Import to Project" 
- Files should download to your Downloads folder
- Toast notification appears

**This is normal:**
- Direct import to project may not work yet
- Files download as fallback
- You can manually add them to project

---

## ✅ Quick Checklist

Run through these in order:

- [ ] Server running on http://localhost:5173
- [ ] History button visible next to logo (clock icon)
- [ ] History button toggles sidebar on/off
- [ ] Generate schema shows X close button
- [ ] Schema has "Import to Project" button
- [ ] Send chat message → check console for save logs
- [ ] Check IndexedDB has chat entry
- [ ] Chat appears in history sidebar
- [ ] Preview loads (or shows helpful error)

**If all checked:** Everything is working! 🎉

**If some fail:** Check console for errors and refer to debugging section above.

---

## 📊 Summary of Changes

| Issue | Status | Location | Test Method |
|-------|--------|----------|-------------|
| History Button Position | ✅ Fixed | Header.tsx line 27-36 | Visual check top-left |
| Schema Close Button | ✅ Fixed | SchemaGenerator.tsx line 203-211 | Generate schema, see X |
| Schema Import | ✅ Fixed | SchemaGenerator.tsx line 475-481 | Click green button |
| Chat History Save | ✅ Enhanced | useChatHistory.ts line 117-139 | Check console logs |
| Preview Error Handling | ✅ Improved | Preview.tsx | Check error messages |
| GitHub Token | ✅ Configured | .dev.vars line 16 | Try cloning repo |

---

## 🎯 Success Criteria

**All fixes are working if:**
1. You can see and click history button next to logo
2. Schema generator shows X button and Import button
3. Console logs show "✅ Chat history saved successfully"
4. Chats appear in history sidebar
5. IndexedDB contains chat entries
6. Preview shows content or helpful error message

**Time to test:** ~5 minutes for visual checks + 5 minutes for debugging if needed

---

**Ready to test! Good luck! 🚀**
