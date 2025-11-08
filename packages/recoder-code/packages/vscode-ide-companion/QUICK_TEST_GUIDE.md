# Quick Testing Guide for Recoder Code VSCode Extension

## 🚀 Quick Install & Test (5 minutes)

### Step 1: Install the Extension

```bash
# Option 1: Using VS Code CLI
code --install-extension recoder-code-vscode-companion-1.0.0.vsix

# Option 2: Manual installation in VS Code
# 1. Open VS Code
# 2. Press Cmd+Shift+P
# 3. Type "Extensions: Install from VSIX"
# 4. Select the recoder-code-vscode-companion-1.0.0.vsix file
```

### Step 2: Quick Smoke Test (Essential Features)

#### 1. Check Extension Loaded ✅
- Look for **Recoder Code icon** in the Activity Bar (left sidebar)
- Click it to open the Recoder Code panel

#### 2. Test Authentication (Pick One) ✅

**Option A: Web OAuth (Fastest)**
```
1. Cmd+Shift+P → "Recoder Code: Login"
2. Select "Web OAuth"
3. Browser opens → Login
4. Return to VSCode → Should see success message
```

**Option B: API Key (If you have one)**
```
1. Cmd+Shift+P → "Recoder Code: Login"
2. Select "API Key (BYOK)"
3. Paste your OpenRouter API key (sk-or-...)
4. Should see success message
```

#### 3. Verify Sidebar Views ✅
Check all 3 sidebar sections show real data:
- **Authentication:** Your name, email, plan
- **Models:** Categories with models
- **Usage & Credits:** Your usage stats

#### 4. Test Model Selection ✅
```
1. In "Models" sidebar, expand "Featured"
2. Click on "Claude 3.5 Sonnet"
3. Status bar (bottom right) should update
4. Should see checkmark next to selected model
```

#### 5. Test Chat ✅
```
1. Cmd+Shift+P → "Recoder Code: Open Chat"
2. Type: "Write a hello world in Python"
3. Press Enter or click Send
4. Should see response within 5-10 seconds
5. Token usage should display below response
```

#### 6. Test OpenRouter Command ✅
```
1. Cmd+Shift+P → "Recoder Code: Show OpenRouter Credits"
2. Modal should show your credits and usage
```

### Step 3: Test Results

✅ **PASS** - All 6 tests passed → Extension is working!
❌ **FAIL** - Any test failed → Check console for errors

---

## 🐛 If Something Doesn't Work

### Check Logs
```
1. Cmd+Shift+P → "Developer: Show Logs"
2. Select "Extension Host"
3. Look for errors from Recoder Code
```

### Check Network
```
1. Verify internet connection
2. Check if api.recoder.xyz is accessible
3. Try: curl https://api.recoder.xyz/health
```

### Common Issues

**"Not Authenticated" after login:**
- Check browser completed auth
- Verify callback URL worked
- Try logging in again

**"No models loading":**
- Verify API key is set correctly
- Check OpenRouter API key is valid
- Run "Recoder Code: Show Auth Status"

**"Chat not responding":**
- Verify model is selected
- Check API key has credits
- Look for error message in chat

**Status bar not updating:**
- Reload window: Cmd+Shift+P → "Developer: Reload Window"

---

## 📊 Full Testing

For comprehensive testing, see: [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)

---

## ✨ What to Test Next (Optional)

1. **Compare Models**
   - Run: "Recoder Code: Compare Models"
   - Webview shows model comparison table

2. **Estimate Cost**
   - Run: "Recoder Code: Estimate Cost"
   - Enter token counts
   - See estimated cost

3. **View Activity**
   - After making chat requests
   - Run: "Recoder Code: Show Activity"
   - See history of requests

4. **All 3 Auth Methods**
   - Test Web OAuth
   - Test Device Flow
   - Test API Key

---

## 📝 Report Issues

If you find bugs, note:
- What you were doing
- What happened
- What you expected
- Error messages (if any)
- Screenshots (if relevant)

---

**Ready to test?** Start with Step 1! 🚀
