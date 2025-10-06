# 🧪 Testing Bolt.new Integration

## Quick Start Test

### 1. Access the Bolt Interface
```
URL: http://localhost:3001/bolt
```

### 2. Test Basic Chat
**Prompt**: "Create a simple counter app with React"

**Expected Result**:
- ✅ Chat input accepts the prompt
- ✅ Message appears in chat history
- ✅ AI starts streaming response
- ✅ Workbench panel appears
- ✅ Files extracted and shown in file tree

### 3. Test WebContainer
Once files are generated:
- ✅ Click on a file in the file tree
- ✅ Code appears in editor
- ✅ Click "Terminal" button
- ✅ Terminal appears at bottom

### 4. Test Preview
- ✅ Click "Start Preview" button
- ✅ Dev server boots in WebContainer
- ✅ Preview URL appears
- ✅ Live app loads in preview pane

## Component Tests

### Test 1: AI Provider Selection
```typescript
// In browser console on /bolt page
// Check which model is being used
fetch('/api/bolt-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'test' }],
    model: 'premium' // Try: premium, fast, free, coding
  })
})
```

### Test 2: File Tree Navigation
1. Generate a multi-file app
2. Click different files in tree
3. Verify editor updates with correct content

### Test 3: Code Editing
1. Select a file
2. Edit code in CodeMirror editor
3. Verify changes persist

### Test 4: Terminal Commands
1. Open terminal
2. Try: `ls`
3. Try: `pwd`
4. Try: `node --version`

## API Endpoint Tests

### Test Streaming Endpoint
```bash
# Test with curl
curl -X POST http://localhost:3001/api/bolt-stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Create a hello world React app"}
    ],
    "model": "premium"
  }'
```

**Expected**: Stream of `data:` events with AI response

## Environment Variables Check

Verify these are set in `.env.local`:

```bash
# At least ONE of these should be set:
✅ ANTHROPIC_API_KEY=sk-ant-api03-...
✅ OPENROUTER_API_KEY=sk-or-v1-...
✅ GROQ_API_KEY=gsk_...

# Optional:
- TOGETHER_API_KEY=...
```

## Known Issues & Solutions

### Issue 1: WebContainer Not Booting
**Symptom**: Stuck on "Booting WebContainer..."
**Solution**:
- Check browser console for errors
- Ensure you're using a modern browser (Chrome, Edge, Arc)
- WebContainer requires Chromium-based browser

### Issue 2: AI Streaming Not Working
**Symptom**: No response after sending message
**Solutions**:
1. Check API keys are set
2. Check browser console for API errors
3. Try different model: `model: 'free'` (DeepSeek R1 - unlimited)

### Issue 3: Terminal Not Working
**Symptom**: Terminal button does nothing
**Solution**:
- Ensure WebContainer has booted (green checkmark)
- Check browser console for xterm errors

### Issue 4: Preview Not Loading
**Symptom**: "Start Preview" clicked but nothing happens
**Solutions**:
1. Check terminal for error messages
2. Ensure package.json has dev script
3. Try manually in terminal: `npm install && npm run dev`

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 90+ | ✅ Full support | Recommended |
| Edge 90+ | ✅ Full support | Recommended |
| Arc | ✅ Full support | Chromium-based |
| Firefox | ⚠️ Limited | WebContainer may not work |
| Safari | ❌ Not supported | WebContainer incompatible |

## Performance Expectations

### WebContainer Boot Time
- First boot: ~2-3 seconds
- Subsequent: ~1 second (cached)

### AI Response Time
- **Premium** (Claude Sonnet 4.5): 2-5s first token
- **Fast** (Groq Llama 3.3): 0.5-1s first token
- **Free** (DeepSeek R1): 1-3s first token
- **Coding** (Qwen Coder): 1-2s first token

### File Operations
- Read/Write: <100ms
- Install packages: Varies (same as local npm)

## Debug Commands

### Check WebContainer Status
```javascript
// In browser console on /bolt page
const container = await import('@webcontainer/api').then(m => m.WebContainer.boot());
console.log('WebContainer ready:', !!container);
```

### Check AI Provider
```javascript
// See which provider is being used
// Look for console log: "🚀 Bolt AI: Using {model} (Anthropic|OpenRouter)"
```

### Check Files in WebContainer
```javascript
// After generating files
const { listFiles } = await import('@/lib/webcontainer');
const files = await listFiles();
console.log('Files:', files);
```

## Success Criteria

✅ **Integration is successful if**:
1. `/bolt` page loads without errors
2. Chat interface accepts and displays messages
3. AI responds with streaming text
4. Files are extracted and shown in workbench
5. WebContainer boots successfully
6. Terminal is accessible
7. Preview can be started

## Example Prompts to Try

1. **Simple App**:
   ```
   Create a todo list app with React
   ```

2. **With Styling**:
   ```
   Build a weather dashboard with Tailwind CSS
   ```

3. **With API**:
   ```
   Create a GitHub profile viewer using the GitHub API
   ```

4. **Game**:
   ```
   Build a tic-tac-toe game with React
   ```

5. **Calculator**:
   ```
   Create a scientific calculator with React
   ```

## Troubleshooting Checklist

- [ ] Server is running on port 3001
- [ ] At least one AI API key is configured
- [ ] Using Chromium-based browser
- [ ] No ad blockers interfering
- [ ] Browser console shows no critical errors
- [ ] Network tab shows successful API calls
- [ ] WebContainer logs show successful boot

## Next Steps After Testing

If all tests pass:
1. ✅ Integration is complete
2. Consider adding more templates
3. Consider adding deploy functionality
4. Consider adding file download/export

If tests fail:
1. Check error messages in console
2. Verify API keys
3. Check network connectivity
4. Review browser compatibility
5. Check this document's solutions section

---

**Questions or Issues?**
Check the main integration docs: `BOLT_INTEGRATION_COMPLETE.md`
