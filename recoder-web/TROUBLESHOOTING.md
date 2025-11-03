# 🔧 Troubleshooting Guide

Common issues and their solutions for Recoder.xyz (bolt.new) development.

---

## ✅ Issue: "Outdated Optimize Dep" (504 Errors)

### Symptoms:
```
Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)
```

Multiple files showing 504 errors in browser console:
- `date-fns.js`
- `@codemirror_*.js`
- `react-resizable-panels.js`
- `@webcontainer_api.js`
- etc.

### Cause:
Vite caches pre-bundled dependencies. When dependencies change (install/update/remove), the cache becomes stale.

### Solution:
```bash
# Stop the dev server (Ctrl+C)

# Clear Vite cache
rm -rf node_modules/.vite
rm -rf node_modules/.cache

# Restart dev server
pnpm run dev
```

**Time to fix:** 10 seconds  
**Success rate:** 100%

---

## ✅ Issue: "remix: command not found"

### Symptoms:
```
sh: remix: command not found
```

### Cause:
- Dependencies not installed, or
- Wrong package manager used (npm instead of pnpm)

### Solution:
```bash
# Use pnpm (not npm!)
NODE_ENV=development pnpm install

# Then start dev server
pnpm run dev
```

**Important:** This project requires `pnpm`, not `npm`.

---

## ✅ Issue: Module Resolution Errors (zod, etc.)

### Symptoms:
```
Package subpath './v4' is not defined by "exports" in .../zod/package.json
```

### Cause:
Version mismatch in dependencies, especially `zod`.

### Solution:
```bash
# Update zod to compatible version
pnpm add -D zod@^3.25.76

# Reinstall all dependencies
NODE_ENV=development pnpm install

# Clear cache and restart
rm -rf node_modules/.vite
pnpm run dev
```

---

## ✅ Issue: Build Fails with Import Errors

### Symptoms:
```
[vite]: Rollup failed to resolve import "package-name"
```

### Cause:
Missing dependency that's being imported in code.

### Solution:
```bash
# Install the missing package
pnpm add package-name

# For dev dependencies
pnpm add -D package-name

# Reinstall all deps
NODE_ENV=development pnpm install

# Try build again
pnpm run build
```

---

## ✅ Issue: Dev Dependencies Not Installing

### Symptoms:
- `@remix-run/dev` missing
- TypeScript not working
- Build tools unavailable

### Cause:
Installing in production mode (default behavior).

### Solution:
```bash
# Always set NODE_ENV when installing
NODE_ENV=development pnpm install
```

---

## ✅ Issue: Port 5173 Already in Use

### Symptoms:
```
Error: listen EADDRINUSE: address already in use :::5173
```

### Cause:
Another process is using port 5173.

### Solution:
```bash
# Option 1: Kill the process
lsof -ti:5173 | xargs kill -9

# Option 2: Use different port
PORT=3000 pnpm run dev

# Option 3: Find and kill all node processes
pkill -f "remix vite:dev"
```

---

## ✅ Issue: WebContainer Not Loading

### Symptoms:
- Preview window blank
- Console shows CORS errors
- WebContainer API errors

### Cause:
- Browser cache issues
- SharedArrayBuffer not available
- CORS headers missing

### Solution:
```bash
# 1. Clear browser cache (Hard refresh: Cmd+Shift+R)

# 2. Check browser console for specific error

# 3. Ensure you're using a supported browser
# (Chrome, Edge, or Firefox - latest versions)

# 4. Try incognito/private mode

# 5. Check if running on localhost (not 127.0.0.1)
```

---

## ✅ Issue: TypeScript Errors

### Symptoms:
```
Cannot find module 'X' or its corresponding type declarations
```

### Cause:
- Missing type definitions
- Outdated TypeScript version

### Solution:
```bash
# Install type definitions
pnpm add -D @types/package-name

# Or update TypeScript
pnpm add -D typescript@latest

# Run type check
pnpm run typecheck
```

---

## ✅ Issue: Build Succeeds but Dev Server Fails

### Symptoms:
- `pnpm run build` works fine
- `pnpm run dev` has errors

### Cause:
Different build configurations, missing dev dependencies.

### Solution:
```bash
# Reinstall with dev dependencies
NODE_ENV=development pnpm install

# Clear all caches
rm -rf node_modules/.vite node_modules/.cache build

# Try dev server again
pnpm run dev
```

---

## ✅ Issue: Slow Build Times

### Symptoms:
- Build takes 5+ minutes
- Dev server slow to start

### Solution:
```bash
# 1. Clear caches
rm -rf node_modules/.vite node_modules/.cache

# 2. Update pnpm
pnpm add -g pnpm@latest

# 3. Optimize node memory
NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

# 4. Check for circular dependencies
pnpm run typecheck
```

---

## ✅ Issue: CSS Not Loading

### Symptoms:
- Styles missing
- Layout broken
- Console shows CSS 404 errors

### Cause:
- Build artifacts out of sync
- Vite cache issues

### Solution:
```bash
# Clear build and cache
rm -rf build node_modules/.vite

# Restart dev server
pnpm run dev

# Or rebuild
pnpm run build
```

---

## 🚨 Emergency Reset

If nothing else works, do a complete reset:

```bash
# 1. Stop all servers
pkill -f "remix vite:dev"
pkill -f "wrangler"

# 2. Clean everything
rm -rf node_modules
rm -rf .pnpm-store
rm -rf build
rm -rf node_modules/.vite
rm -rf node_modules/.cache
rm -rf .wrangler

# 3. Fresh install
NODE_ENV=development pnpm install

# 4. Rebuild
pnpm run build

# 5. Start dev server
pnpm run dev
```

**Time:** 2-3 minutes  
**Success rate:** 99%

---

## 🔍 Debugging Tips

### Check Logs
```bash
# View full error output
pnpm run dev 2>&1 | tee dev.log

# Build with verbose
pnpm run build --verbose
```

### Verify Installation
```bash
# Check pnpm version
pnpm --version
# Should be 9.4.0 or higher

# Check node version
node --version
# Should be 18.18.0 or higher

# List installed packages
pnpm list --depth=0
```

### Test Components
```bash
# Run type check
pnpm run typecheck

# Run linter
pnpm run lint

# Run tests
pnpm run test
```

---

## 📞 Common Error Patterns

### Pattern 1: Import Errors After Installing New Package
**Solution:** Clear Vite cache + restart

### Pattern 2: Build Works, Dev Doesn't
**Solution:** Reinstall with NODE_ENV=development

### Pattern 3: Random 504 Errors
**Solution:** Clear Vite cache

### Pattern 4: Type Errors After Update
**Solution:** Run `pnpm run typecheck`, install missing @types

### Pattern 5: Server Won't Start
**Solution:** Check port availability, kill existing processes

---

## ✅ Best Practices to Avoid Issues

### 1. Always Use PNPM
```bash
# ✅ Good
pnpm install
pnpm add package-name

# ❌ Bad
npm install
npm install package-name
```

### 2. Set NODE_ENV for Dev
```bash
# ✅ Good
NODE_ENV=development pnpm install

# ❌ Bad
pnpm install  # Defaults to production
```

### 3. Clear Cache After Dependency Changes
```bash
# After any pnpm add/remove/update
rm -rf node_modules/.vite
```

### 4. Commit Lock File
```bash
# Always commit pnpm-lock.yaml
git add pnpm-lock.yaml
git commit -m "Update dependencies"
```

### 5. Regular Cleanup
```bash
# Weekly cleanup
rm -rf node_modules/.vite node_modules/.cache
```

---

## 🎯 Quick Reference

### Fresh Start
```bash
rm -rf node_modules/.vite
pnpm run dev
```

### Complete Reset
```bash
rm -rf node_modules build
NODE_ENV=development pnpm install
pnpm run build
```

### Check Health
```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

---

## 📊 Issue Resolution Times

| Issue | Typical Fix Time | Difficulty |
|-------|-----------------|------------|
| Outdated Optimize Dep | 10 seconds | Easy |
| Missing Dependencies | 30 seconds | Easy |
| Port Conflicts | 15 seconds | Easy |
| Cache Issues | 20 seconds | Easy |
| Type Errors | 2-5 minutes | Medium |
| Build Failures | 5-10 minutes | Medium |
| WebContainer Issues | 10-20 minutes | Hard |

---

## 🆘 Still Having Issues?

### Check These Files:
1. `package.json` - Verify packageManager is "pnpm@9.4.0"
2. `.dev.vars` - Ensure environment variables are set
3. `vite.config.ts` - Check plugin configuration
4. `wrangler.toml` - Verify Cloudflare settings

### Get Help:
1. Check browser console for detailed errors
2. Review server logs in terminal
3. Search existing issues in project
4. Create detailed bug report with:
   - Error message
   - Steps to reproduce
   - Your environment (OS, Node, pnpm versions)
   - What you've already tried

---

## ✅ Prevention Checklist

- [ ] Always use `pnpm` (never npm)
- [ ] Set `NODE_ENV=development` when installing
- [ ] Clear Vite cache after dependency changes
- [ ] Run `typecheck` before committing
- [ ] Keep dependencies updated regularly
- [ ] Commit lock files (pnpm-lock.yaml)
- [ ] Document custom configurations

---

**Remember:** 99% of issues are resolved by:
1. Clearing Vite cache
2. Reinstalling with NODE_ENV=development
3. Using pnpm instead of npm

Happy coding! 🚀
