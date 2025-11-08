# App.tsx Integration Steps for Recoder Authentication
 
## Step 1: Add Import Statements

Add these imports near the top of `packages/cli/src/ui/App.tsx` (around line 48):

```typescript
import { RecoderLoginDialog } from './components/RecoderLoginDialog.js';
import { useRecoderAuth } from './hooks/useRecoderAuth.js';
```

## Step 2: Initialize Recoder Auth Hook

Add this hook after the other hook initializations (around line 350):

```typescript
// Recoder.xyz authentication
const {
  authState,
  isChecking: isCheckingRecoderAuth,
  isLoginDialogOpen: isRecoderLoginDialogOpen,
  openLoginDialog: openRecoderLoginDialog,
  closeLoginDialog: closeRecoderLoginDialog,
  handleLoginSuccess: handleRecoderLoginSuccess,
  handleLogout: handleRecoderLogout,
  setApiKey: setRecoderApiKey,
  checkQuota: checkRecoderQuota,
  refreshAuthState: refreshRecoderAuthState,
} = useRecoderAuth();
```

## Step 3: Add Dialog State Handler

Find where other dialogs are handled (search for `closeAnyOpenDialog`) and add this check:

```typescript
const { closeAnyOpenDialog } = useDialogClose({
  // ... existing dialog closes
  isRecoderLoginDialogOpen,
  closeRecoderLoginDialog: closeRecoderLoginDialog,
  // ... rest of dialog closes
});
```

## Step 4: Handle /login Command

Find where slash commands are processed (search for `processCommand` or command handling), and add:

```typescript
// Handle /login command
if (result.type === 'dialog' && result.dialog === 'recoder-login') {
  openRecoderLoginDialog();
  return;
}

// Handle /logout command
if (result.type === 'message' && command === '/logout') {
  await handleRecoderLogout();
  addHistoryItem({
    type: MessageType.ERROR, // Or MessageType.SYSTEM
    message: '✅ Logged out from recoder.xyz',
    streaming: StreamingState.COMPLETE,
    toolCalls: [],
  });
  return;
}

// Handle /status command
if (result.type === 'message' && command === '/status') {
  if (authState.isAuthenticated) {
    const quotaInfo = authState.quota
      ? `${authState.quota.remaining}/${authState.quota.limit} requests`
      : 'Unknown';
    
    const statusMessage = 
      `✅ Authenticated as ${authState.userEmail}\n` +
      `📋 Plan: ${authState.userPlan?.toUpperCase()}\n` +
      `📊 Quota: ${quotaInfo}`;
    
    addHistoryItem({
      type: MessageType.ERROR, // Or MessageType.SYSTEM
      message: statusMessage,
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
  } else {
    addHistoryItem({
      type: MessageType.ERROR,
      message: '❌ Not authenticated. Run /login to authenticate.',
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
  }
  return;
}

// Handle /set-api-key command
if (result.type === 'message' && command.startsWith('/set-api-key')) {
  const apiKey = command.replace('/set-api-key', '').trim();
  if (!apiKey) {
    addHistoryItem({
      type: MessageType.ERROR,
      message: '❌ Please provide your OpenRouter API key\nUsage: /set-api-key sk-or-v1-...',
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
    return;
  }
  
  const result = await setRecoderApiKey(apiKey);
  if (result.success) {
    addHistoryItem({
      type: MessageType.ERROR, // Or MessageType.SYSTEM
      message: '✅ API key saved successfully!',
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
  } else {
    addHistoryItem({
      type: MessageType.ERROR,
      message: `❌ ${result.error}`,
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
  }
  return;
}
```

## Step 5: Add Dialog Rendering

Find where dialogs are rendered in the JSX (search for `{isAuthDialogOpen && ...}`), and add:

```typescript
{/* Recoder Login Dialog */}
{isRecoderLoginDialogOpen && (
  <RecoderLoginDialog
    onClose={closeRecoderLoginDialog}
    onSuccess={handleRecoderLoginSuccess}
  />
)}
```

## Step 6: Display Auth Status in Header (Optional)

If you want to show authentication status in the header, find the Header component and pass auth state:

```typescript
<Header
  // ... existing props
  recoderAuth={authState.isAuthenticated ? {
    email: authState.userEmail,
    plan: authState.userPlan,
    quota: authState.quota,
  } : null}
/>
```

Then update the Header component to display this info.

## Step 7: Check Authentication Before AI Requests

Before making AI requests, add quota checking:

```typescript
// Before generating AI response
if (authState.isAuthenticated) {
  const quotaCheck = await checkRecoderQuota();
  if (!quotaCheck.allowed) {
    addHistoryItem({
      type: MessageType.ERROR,
      message: `❌ ${quotaCheck.reason}\n💡 Upgrade at: https://recoder.xyz/pricing`,
      streaming: StreamingState.COMPLETE,
      toolCalls: [],
    });
    return;
  }
}

// If free user without API key
if (authState.isAuthenticated && 
    authState.userPlan === 'free' && 
    !authState.hasOwnApiKey) {
  addHistoryItem({
    type: MessageType.ERROR,
    message: 
      '⚠️  Free tier requires your own OpenRouter API key\n' +
      '💡 Get one at: https://openrouter.ai\n' +
      '💡 Then run: /set-api-key sk-or-v1-...',
    streaming: StreamingState.COMPLETE,
    toolCalls: [],
  });
  return;
}
```

## Step 8: Show Authentication Prompt on First Run (Optional)

Add this near the start of App component:

```typescript
useEffect(() => {
  // Show login prompt if not authenticated
  if (!isCheckingRecoderAuth && !authState.isAuthenticated) {
    const timer = setTimeout(() => {
      addHistoryItem({
        type: MessageType.ERROR, // Or MessageType.SYSTEM
        message: 
          '👋 Welcome to Recoder Code!\n\n' +
          'To use AI features, please authenticate:\n' +
          '  Type: /login\n\n' +
          'Or continue without authentication (limited features)',
        streaming: StreamingState.COMPLETE,
        toolCalls: [],
      });
    }, 2000); // Show after 2 seconds

    return () => clearTimeout(timer);
  }
}, [isCheckingRecoderAuth, authState.isAuthenticated]);
```

## Complete Example: Command Handler Integration

Here's a complete example of how to handle all Recoder commands:

```typescript
// Inside your command processing function
const handleRecoderCommands = async (command: string) => {
  // /login
  if (command === '/login') {
    openRecoderLoginDialog();
    return true;
  }

  // /logout
  if (command === '/logout') {
    await handleRecoderLogout();
    addSystemMessage('✅ Logged out from recoder.xyz');
    return true;
  }

  // /status
  if (command === '/status') {
    if (authState.isAuthenticated) {
      const quota = authState.quota
        ? `${authState.quota.remaining}/${authState.quota.limit}`
        : 'Unknown';
      
      let statusMsg = `✅ Authenticated as ${authState.userEmail}\n`;
      statusMsg += `📋 Plan: ${authState.userPlan?.toUpperCase()}\n`;
      statusMsg += `📊 Quota: ${quota} requests`;
      
      if (authState.userPlan === 'free' && !authState.hasOwnApiKey) {
        statusMsg += '\n\n⚠️  API key not configured';
        statusMsg += '\n💡 Run: /set-api-key sk-or-v1-...';
      }
      
      addSystemMessage(statusMsg);
    } else {
      addSystemMessage('❌ Not authenticated. Run /login');
    }
    return true;
  }

  // /set-api-key
  if (command.startsWith('/set-api-key')) {
    const apiKey = command.replace('/set-api-key', '').trim();
    
    if (!authState.isAuthenticated) {
      addSystemMessage('❌ Not authenticated. Run /login first');
      return true;
    }

    if (!apiKey) {
      addSystemMessage(
        '❌ Please provide your API key\n' +
        'Usage: /set-api-key sk-or-v1-...'
      );
      return true;
    }

    const result = await setRecoderApiKey(apiKey);
    if (result.success) {
      addSystemMessage('✅ API key saved successfully!');
    } else {
      addSystemMessage(`❌ ${result.error}`);
    }
    return true;
  }

  return false; // Not a Recoder command
};

// In your main command processing:
if (await handleRecoderCommands(command)) {
  return; // Command was handled
}

// Continue with other command processing...
```

## Helper Function for System Messages

Add this helper to make it easier to add system messages:

```typescript
const addSystemMessage = (message: string) => {
  addHistoryItem({
    type: MessageType.ERROR, // Or create MessageType.SYSTEM if it doesn't exist
    message,
    streaming: StreamingState.COMPLETE,
    toolCalls: [],
  });
};
```

## Testing Checklist

After integration:

- [ ] `/login` opens the Recoder login dialog
- [ ] Web OAuth flow works in browser
- [ ] Device flow shows instructions correctly
- [ ] `/logout` clears authentication
- [ ] `/status` shows correct authentication state
- [ ] `/set-api-key` saves API key for free users
- [ ] Authentication persists across CLI restarts
- [ ] Quota checking works before AI requests
- [ ] Free users are prompted for API key
- [ ] Premium users can use immediately

## Quick Test Commands

```
/login                              # Should open login dialog
/status                             # Should show not authenticated
# Complete login in dialog
/status                             # Should show authenticated + quota
/set-api-key sk-or-v1-xxx           # If free tier
/logout                             # Should logout
/status                             # Should show not authenticated again
```

## Troubleshooting

### Dialog doesn't open
- Check that `RecoderLoginDialog` is imported
- Verify `isRecoderLoginDialogOpen` state is being set
- Check dialog is rendered in JSX

### Authentication not persisting
- Check `~/.recoder/auth.json` exists
- Verify file has correct permissions (0600)
- Check `RecoderAuthService` is reading file correctly

### Commands not recognized
- Verify commands are registered in `BuiltinCommandLoader`
- Check command names match exactly
- Ensure command processor handles the dialog type

---

**After completing these steps**, run:

```bash
cd packages/cli
npm run build
npm link
recoder
# Type: /login
```

The authentication system should now be fully integrated! 🎉
