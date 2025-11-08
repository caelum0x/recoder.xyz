# VSCode Extension Testing Checklist

## Installation

- [ ] Install VSIX: `code --install-extension recoder-code-vscode-companion-1.0.0.vsix`
- [ ] Verify extension appears in Extensions list
- [ ] Check extension is activated (look for Recoder Code icon in Activity Bar)

## Authentication Testing

### 1. Web OAuth Flow
- [ ] Open Command Palette (`Cmd+Shift+P`)
- [ ] Run: `Recoder Code: Login`
- [ ] Select "Web OAuth"
- [ ] Verify browser opens to api.recoder.xyz
- [ ] Complete login in browser
- [ ] Verify callback returns to VSCode
- [ ] Check success notification appears
- [ ] Verify user info shows in Authentication sidebar

### 2. Device Flow
- [ ] Logout first: `Recoder Code: Logout`
- [ ] Run: `Recoder Code: Login`
- [ ] Select "Device Flow"
- [ ] Verify device code modal appears
- [ ] Copy device code
- [ ] Open verification URL in browser
- [ ] Enter device code
- [ ] Verify authentication completes
- [ ] Check success notification

### 3. API Key (BYOK)
- [ ] Logout first
- [ ] Run: `Recoder Code: Login`
- [ ] Select "API Key (BYOK)"
- [ ] Enter valid OpenRouter API key (sk-or-...)
- [ ] Verify API key is validated against backend
- [ ] Check success notification

### 4. Set API Key Command
- [ ] Login as free user
- [ ] Run: `Recoder Code: Set OpenRouter API Key`
- [ ] Enter valid OpenRouter API key
- [ ] Verify key is saved
- [ ] Check sidebar updates

## Sidebar Views Testing

### Authentication View
- [ ] Verify shows "Not Authenticated" when logged out
- [ ] After login, verify shows:
  - ✅ Authenticated
  - User name
  - Plan (FREE/PRO/ENTERPRISE)
  - Quota info
  - OpenRouter credits (if available)

### Models View
- [ ] Verify shows "Not authenticated" when logged out
- [ ] After login, verify shows categories:
  - 🔥 Featured
  - 💰 Free Models
  - ⚡ Premium Models
  - 🔄 All Models
- [ ] Expand each category
- [ ] Verify models load (should show ~20 models per category)
- [ ] Click on a model
- [ ] Verify model is selected (checkmark appears)
- [ ] Verify status bar updates with selected model

### Usage & Credits View
- [ ] Verify shows "No API key" when not configured
- [ ] After authentication, verify shows:
  - 💳 Credits section with usage
  - ⚡ Rate Limit section
  - 📊 Recent Activity (if any)
  - 🔧 Actions (clickable buttons)

## Model Management Testing

### Browse Models
- [ ] Run: `Recoder Code: Browse Models`
- [ ] Verify models sidebar opens/focuses

### Select Model
- [ ] Click on different models in sidebar
- [ ] Verify status bar updates each time
- [ ] Verify checkmark moves to selected model

### Compare Models
- [ ] Run: `Recoder Code: Compare Models`
- [ ] Verify comparison webview opens
- [ ] Check table shows:
  - Model names
  - Context lengths
  - Max completion tokens
  - Pricing (prompt + completion)
  - Descriptions
- [ ] Verify all data is populated correctly

## Chat Testing

### Basic Chat
- [ ] Run: `Recoder Code: Open Chat`
- [ ] Verify chat webview opens
- [ ] Type a message: "Hello, tell me about TypeScript"
- [ ] Press Send (or Enter)
- [ ] Verify message appears in chat
- [ ] Wait for AI response
- [ ] Verify response appears
- [ ] Check token usage is displayed

### Chat Error Handling
- [ ] Logout
- [ ] Try to send a chat message
- [ ] Verify error message appears
- [ ] Login again
- [ ] Unset/clear API key
- [ ] Try to chat
- [ ] Verify appropriate error message

## OpenRouter Commands Testing

### Credits Command
- [ ] Run: `Recoder Code: Show OpenRouter Credits`
- [ ] Verify modal shows:
  - Free tier or paid badge
  - Plan name
  - Usage amount
  - Remaining credits (if applicable)
  - Usage percentage
  - Rate limits

### Estimate Cost Command
- [ ] Select a model first
- [ ] Run: `Recoder Code: Estimate Cost`
- [ ] Enter prompt tokens (e.g., 1000)
- [ ] Enter completion tokens (e.g., 500)
- [ ] Verify modal shows:
  - Model name and context
  - Token counts
  - Estimated cost
  - Pricing breakdown

### Activity Command
- [ ] Make at least one chat request first
- [ ] Run: `Recoder Code: Show Activity`
- [ ] Verify activity webview opens
- [ ] Check table shows:
  - Model used
  - Date/time
  - Duration
  - Prompt tokens
  - Completion tokens
  - Total tokens
- [ ] Verify data is accurate

## Status Bar Testing

- [ ] When not logged in, verify shows: "$(circle-slash) Recoder: Not Logged In"
- [ ] Click status bar item → should trigger login
- [ ] After login with no model, verify shows: "$(robot) Recoder: Select Model"
- [ ] Click → should open model browser
- [ ] After selecting model, verify shows: "$(robot) {model-name}"
- [ ] Click → should open model browser

## Edge Cases & Error Handling

### Network Errors
- [ ] Disconnect internet
- [ ] Try to login
- [ ] Verify appropriate error message
- [ ] Try to fetch models
- [ ] Verify error in sidebar
- [ ] Reconnect internet
- [ ] Verify everything works again

### Invalid API Key
- [ ] Try to set invalid API key (not starting with sk-or-)
- [ ] Verify validation error
- [ ] Try API key with wrong format
- [ ] Verify backend validation error

### Expired Session
- [ ] Wait for token to expire (or manually corrupt it in storage)
- [ ] Try to perform action
- [ ] Verify auto-refresh attempt
- [ ] If refresh fails, verify logout/re-login prompt

### No Model Selected
- [ ] Login but don't select a model
- [ ] Try to open chat
- [ ] Verify it works (uses default model)
- [ ] Check which model was used

## Performance Testing

- [ ] Time how long it takes to:
  - Login (should be < 5 seconds after browser auth)
  - Load models (should be < 3 seconds)
  - Send chat message (varies by model, but UI should be responsive)
  - Load credits (should be < 2 seconds)
- [ ] Check memory usage in VSCode
- [ ] Verify extension doesn't slow down VSCode

## UI/UX Testing

- [ ] Verify all icons display correctly
- [ ] Check dark mode compatibility
- [ ] Check light mode compatibility
- [ ] Verify all text is readable
- [ ] Check spacing and alignment
- [ ] Verify modals are properly sized
- [ ] Check webviews render correctly

## Cleanup

- [ ] Run: `Recoder Code: Logout`
- [ ] Verify all views update to "Not Authenticated"
- [ ] Verify stored credentials are cleared
- [ ] Uninstall extension
- [ ] Verify no leftover data

## Known Issues to Document

### Found Bugs:
1.
2.
3.

### UI Improvements Needed:
1.
2.
3.

### Feature Requests:
1.
2.
3.

## Test Results Summary

**Date Tested:** _____________

**Tester:** _____________

**Overall Status:** ☐ Pass ☐ Fail ☐ Pass with Issues

**Critical Issues:** _____________

**Minor Issues:** _____________

**Ready for Production:** ☐ Yes ☐ No

**Notes:**
