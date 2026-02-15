# Bug 5 Fix: Auto-fix Not Fixing Errors

## Root Cause

The auto-fix feature was failing silently due to a **missing prompt** in the event dispatch. When restoring a past chat with errors, the system would dispatch a `recoder:fix-errors` event **without a prompt**, causing the event handler in Chat.client.tsx to silently fail.

### The Problem

**In useChatHistory.ts (line 750):**
```typescript
// BUG: No prompt in event detail!
window.dispatchEvent(new CustomEvent('recoder:fix-errors'));
```

**In Chat.client.tsx (line 526):**
```typescript
const handleFixErrors = async (event: CustomEvent) => {
  const { prompt } = event.detail;  // ← prompt is undefined!
  if (prompt && !isLoading) {       // ← This check fails silently!
    sendMessage({} as React.UIEvent, prompt);
  }
};
```

### Additional Issues Found

1. **checkAndAutoFixErrors function was never called** - It was defined but the only call was inside npm install, which doesn't run when errors occur during dev server startup
2. **No error logging** - When the event was dispatched without a prompt, it failed silently with no console warning
3. **containerReady check was blocking error detection** - ProblemsPanel required container to be ready before fetching errors, but errors can exist before the dev server starts

## The Fix

### 1. Fixed useChatHistory.ts (line 748)
```typescript
// BEFORE:
window.dispatchEvent(new CustomEvent('recoder:fix-errors'));

// AFTER:
checkAndAutoFixErrors(projectId).catch(err => {
  console.warn('⚠️ [useChatHistory] Auto-fix failed:', err);
});
```

This change:
- Actually calls the `checkAndAutoFixErrors` function that fetches errors and formats them
- Properly dispatches the event **with a prompt** (checkAndAutoFixErrors handles this)
- Adds error logging for debugging

### 2. Fixed Chat.client.tsx (line 524-541)
```typescript
// BEFORE:
const handleFixErrors = async (event: CustomEvent) => {
  const { prompt } = event.detail;
  if (prompt && !isLoading) {
    sendMessage({} as React.UIEvent, prompt);
  }
};

// AFTER:
const handleFixErrors = async (event: CustomEvent) => {
  const { prompt } = event.detail || {};

  // Only proceed if we have a prompt and are not currently loading
  if (prompt && !isLoading) {
    sendMessage({} as React.UIEvent, prompt);
  } else if (!prompt) {
    console.warn('[Chat] recoder:fix-errors event received without prompt');
  }
};
```

This change:
- Adds defensive null checking for `event.detail`
- Logs a warning when the event is received without a prompt (for debugging)
- Makes the failure visible instead of silent

### 3. Fixed ProblemsPanel.tsx (line 58-59)
```typescript
// BEFORE:
if (!projectId || !containerReady) return;

// AFTER:
if (!projectId) return;
// Note: Removed containerReady check - errors can exist before dev server starts
```

This change:
- Allows error fetching even before the dev server is ready
- Catches build-time errors that prevent the server from starting

## How Auto-Fix Works Now

1. **Dev server crashes with errors** → Backend logs errors
2. **ProblemsPanel fetches errors** → No longer blocked by containerReady
3. **User clicks "Fix All"** or **auto-fix is triggered** after chat restoration
4. **checkAndAutoFixErrors is called** → Fetches errors from backend
5. **formatErrorsForAI formats the errors** → Creates a detailed prompt with file context
6. **Event is dispatched WITH the prompt** → `recoder:fix-errors` event with prompt in detail
7. **Chat.client.tsx receives the event** → Sends the prompt to the AI
8. **AI analyzes and fixes** → Uses the diagnostic workflow to fix errors

## Testing Checklist

- [ ] Manual "Fix All" button in ProblemsPanel
- [ ] Individual error "Fix" button in ProblemsPanel
- [ ] Auto-fix after loading a past chat with errors
- [ ] Auto-fix after npm install completes
- [ ] Error logging appears in console when event has no prompt
- [ ] ProblemsPanel shows errors even before dev server starts
- [ ] canAutoFix() properly limits fix attempts (max 3)

## Files Modified

1. `/recoder-web/app/lib/persistence/useChatHistory.ts` - Fixed event dispatch
2. `/recoder-web/app/components/chat/Chat.client.tsx` - Added defensive checks and logging
3. `/recoder-web/app/components/workbench/ProblemsPanel.tsx` - Removed containerReady blocker (already committed)

## Notes

- The `checkAndAutoFixErrors` function was already correctly implemented - it just wasn't being called!
- All other places that dispatch `recoder:fix-errors` already include the prompt correctly
- The fix is minimal and focuses on the root cause rather than adding complex workarounds
