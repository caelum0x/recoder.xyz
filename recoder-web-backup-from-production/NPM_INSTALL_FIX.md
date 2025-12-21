# NPM Install Fix for WebContainer

## Issue
`npm install` not working in the web-based IDE (WebContainer environment)

## Root Cause
WebContainer requires specific headers and configuration to access npm registry over the network.

## ✅ Already Configured (Verified)

1. **COOP/COEP Headers** - Already set in `app/entry.server.tsx`:
   ```typescript
   responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
   responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
   ```

2. **Timeout Handling** - Already set to 5 minutes for npm install in `app/lib/runtime/action-runner.ts`:
   ```typescript
   const timeoutDuration = isInstallCommand ? 300000 : 90000; // 5 min for install
   ```

3. **WebContainer Boot** - Has retry logic with exponential backoff

## 🔍 Possible Issues

### 1. Network Access Blocked
**Symptom:** npm install hangs or times out
**Cause:** Browser blocking network requests to npm registry

**Fix:** Check browser console for CORS errors. If you see errors like:
```
Cross-Origin Request Blocked: The Same Origin Policy disallows...
```

Then the headers aren't being applied. This can happen if:
- Running in development mode without proper server configuration
- Cloudflare Workers not applying headers correctly
- Browser cache serving old headers

**Solution:**
```bash
# Clear browser cache and hard reload
# Chrome: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
# Firefox: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)
```

### 2. WebContainer Not Booting
**Symptom:** Commands don't execute at all
**Cause:** WebContainer failed to initialize

**Check:** Open browser console and look for:
```
✅ WebContainer booted successfully in XXXms
```

If you see:
```
❌ WebContainer failed to boot after all attempts
```

Then WebContainer itself isn't starting. This can be due to:
- Browser not supporting SharedArrayBuffer
- Browser not supporting WebAssembly
- Running in an iframe without proper headers

**Solution:** Use a modern browser (Chrome 92+, Firefox 95+, Safari 15.2+)

### 3. npm Registry Unreachable
**Symptom:** npm install starts but fails with network errors
**Cause:** npm registry (registry.npmjs.org) is blocked or slow

**Check:** In the terminal output, look for:
```
npm ERR! network request to https://registry.npmjs.org/...
npm ERR! network This is a problem related to network connectivity
```

**Solution:**
- Check your internet connection
- Try again (npm registry might be temporarily down)
- Use a VPN if npm registry is blocked in your region

### 4. Large Package Timeout
**Symptom:** npm install times out after 5 minutes
**Cause:** Installing very large packages (e.g., @tensorflow/tfjs, electron)

**Solution:** Increase timeout in `app/lib/runtime/action-runner.ts`:
```typescript
const timeoutDuration = isInstallCommand ? 600000 : 90000; // 10 min for install
```

## 🧪 Testing npm install

1. **Open recoder-web in browser**
2. **Open browser DevTools** (F12)
3. **Go to Console tab**
4. **Create a new project** with AI
5. **Watch for these logs:**
   ```
   🚀 Booting WebContainer...
   ✅ WebContainer booted successfully
   🔨 Executing shell command: npm install
   📦 Process spawned successfully
   ✅ Shell command completed successfully
   ```

6. **If it fails, check for:**
   - CORS errors in console
   - Network errors in Network tab
   - WebContainer boot failures

## 🔧 Manual Test

To test if WebContainer can access npm registry:

1. Open recoder-web
2. Open terminal in the IDE
3. Run manually:
   ```bash
   npm install express
   ```
4. Watch the output

**Expected:** Package installs successfully
**If fails:** Check browser console for specific error

## 📝 Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `CORS policy` | Headers not applied | Hard refresh browser |
| `network timeout` | Slow connection | Increase timeout or retry |
| `ENOTFOUND registry.npmjs.org` | DNS/network issue | Check internet connection |
| `Command timed out after 300 seconds` | Large packages | Increase timeout |
| `WebContainer failed to boot` | Browser incompatible | Use Chrome/Firefox/Safari latest |

## ✅ Verification Checklist

- [ ] Browser console shows "WebContainer booted successfully"
- [ ] No CORS errors in console
- [ ] Network tab shows requests to registry.npmjs.org
- [ ] npm install completes within 5 minutes
- [ ] Terminal shows package installation progress
- [ ] No "Command timed out" errors

## 🚀 If Still Not Working

1. **Check browser compatibility:**
   - Chrome 92+ ✅
   - Firefox 95+ ✅
   - Safari 15.2+ ✅
   - Edge 92+ ✅

2. **Check network:**
   - Can you access https://registry.npmjs.org in browser?
   - Is npm registry blocked by firewall/VPN?

3. **Check headers are applied:**
   - Open DevTools → Network tab
   - Reload page
   - Click on the main document request
   - Check Response Headers for:
     ```
     cross-origin-embedder-policy: require-corp
     cross-origin-opener-policy: same-origin
     ```

4. **Try a simple package first:**
   ```bash
   npm install lodash
   ```
   If this works, the issue is with specific large packages.

## 📞 Debug Mode

To enable verbose logging, add to browser console:
```javascript
localStorage.setItem('DEBUG', '*');
```

Then reload and check console for detailed WebContainer logs.
