# 🔧 Quick Fix Guide - Vite 504 Error

## ⚡ Fastest Solution

**Stop the dev server (Ctrl+C) then run:**

```bash
pnpm run dev:clean
```

**Then in your browser:**
1. Close ALL browser windows
2. Open in **INCOGNITO/PRIVATE mode**
3. Go to `http://localhost:5173`

## 🎯 Why This Works

The issue happens because:
1. Vite optimizes dependencies in the background
2. Your browser requests files before optimization finishes → 504 error
3. Browser caches the broken state

The fix ensures Vite completes ALL optimization before serving any files.

## 📋 Available Commands

| Command | When to Use |
|---------|-------------|
| `pnpm run dev:clean` | When you see 504 errors (clears cache + starts server) |
| `pnpm run dev:force` | Quick one-liner to clear cache and start |
| `pnpm run dev` | Normal development after initial clean start |

## 🔄 Workflow

### Initial Start / After 504 Error:
```bash
pnpm run dev:clean
# Wait for "Local: http://localhost:5173/"
# Open browser in INCOGNITO mode
```

### Regular Development:
```bash
pnpm run dev
# Use your normal browser
```

## ⚠️ Browser Cache is Critical!

If you still see errors after fixing:

### Option 1: Use Incognito (Easiest)
- Chrome/Edge: `Ctrl+Shift+N` / `Cmd+Shift+N`
- Firefox: `Ctrl+Shift+P` / `Cmd+Shift+P`

### Option 2: Hard Refresh
- Chrome/Firefox: `Ctrl+Shift+R` / `Cmd+Shift+R`
- Or: DevTools → Right-click refresh → "Empty Cache and Hard Reload"

## 🛠️ Technical Changes Made

1. **vite.config.ts**:
   - Added `holdUntilCrawlEnd: true` - waits for all deps before serving
   - Added custom `fix504ErrorsPlugin` - handles errors automatically
   - Added cache-control headers - prevents browser caching
   - Optimized dependency list

2. **New Scripts**:
   - `dev-safe.sh` - Clean start helper
   - `fix-vite-504.sh` - Manual cache clear

3. **package.json**:
   - `dev:clean` - Recommended for starting
   - `dev:force` - Quick clear and start

## 🚨 Still Having Issues?

### Nuclear Option:
```bash
# Stop everything
pkill -f "remix vite:dev"
pkill -f "vite"

# Clear ALL caches
rm -rf node_modules/.vite
rm -rf node_modules/.cache
rm -rf build
rm -rf .wrangler/state
rm -rf .cache

# Start fresh
pnpm run dev:clean
```

Then open browser in **INCOGNITO MODE**.

## ✅ Success Indicators

You'll know it works when:
- No 504 errors in browser console
- No "Failed to fetch dynamically imported module" errors
- App loads and displays correctly
- HMR (hot reload) works when you edit files

## 📚 More Details

See `FIX_504_PERMANENT.md` for comprehensive technical documentation.

## 💡 Pro Tips

1. **Always use `dev:clean` after**:
   - `git pull`
   - `pnpm install`
   - Changing `vite.config.ts`

2. **During active development**:
   - Use regular `pnpm run dev`
   - Only run `dev:clean` if errors appear

3. **Testing new features**:
   - Use incognito mode to avoid cache issues
   - Keeps your testing environment clean
