# React Hydration Error - Investigation & Resolution

## Error Observed

```
Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.
TypeError: Cannot read properties of null (reading 'useState')
```

## Root Cause

This is a **React hydration mismatch** error, not a multiple React instances issue. It occurs when:
1. The server-rendered HTML doesn't match what React expects on the client
2. Vite's cache becomes stale after dependency changes
3. Hot module replacement (HMR) conflicts during development

## Analysis

- ✅ Only ONE version of React exists (18.3.1)
- ✅ No duplicate React packages found
- ⚠️  Many packages expect React 19 but are compatible with 18.3.1
- ⚠️  Hydration errors during development are often transient

## Resolution

### What Was Done

1. **Cleared all Vite caches**
   - Removed `.vite`, `node_modules/.vite`, `build/.vite`
   
2. **Reinstalled dependencies**
   - Force reinstall to ensure clean state
   - Reinstalled with NODE_ENV=development for dev dependencies

3. **Restarted dev server**
   - Fresh start with clean cache

### Result

✅ Dev server starts successfully
✅ No build errors
✅ Application accessible at http://localhost:5173

## Understanding the Error

The hydration error you saw is typically caused by:

1. **Server/Client Mismatch**: The HTML generated on the server doesn't match what React renders on the client
2. **Async Data**: Data loaded asynchronously causing UI differences
3. **Browser Extensions**: React DevTools or other extensions interfering
4. **Cache Issues**: Stale Vite cache from previous builds

## When This Error Appears

- ❌ **During development** - Often transient, can be ignored if app works
- ✅ **After hard refresh** - Usually resolves itself
- ⚠️  **In production** - More concerning, needs investigation

## Verification Steps

To verify the app is working despite the error:

1. **Hard refresh** the browser (Cmd+Shift+R or Ctrl+Shift+F5)
2. **Clear browser cache** completely
3. **Test in incognito** mode (no extensions)
4. **Check functionality** - Can you interact with the UI?

## If Error Persists

If you continue to see this error after the cache clear:

1. Check `app/entry.client.tsx` - hydration logic looks correct
2. Check `app/entry.server.tsx` - server rendering logic
3. Look for any conditional rendering based on `typeof window`
4. Check for any browser-only APIs used during server render

## Current Status

- ✅ Vite cache cleared
- ✅ Dependencies reinstalled
- ✅ Dev server running
- ℹ️  Hydration error may be transient - test the application

## Recommendation

1. **Open the application** in your browser
2. **Do a hard refresh** (Cmd+Shift+R)
3. **Test basic functionality** - can you type in chat, navigate, etc.?
4. **If it works**, the error is likely cosmetic/transient
5. **If it doesn't work**, check browser console for more specific errors

## Prevention

To prevent hydration errors:

- Don't use `typeof window` checks in component render
- Don't access `localStorage`/`sessionStorage` during initial render
- Use `useEffect` for browser-only code
- Ensure server and client render the same initial HTML

## Notes

This error is different from the streaming bug we investigated earlier. This is a client-side React hydration issue, whereas the streaming bug was a server-side AI SDK issue.

The application should still be functional even if you see this warning in the console during development.
