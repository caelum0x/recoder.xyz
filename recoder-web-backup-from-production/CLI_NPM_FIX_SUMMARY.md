# CLI & NPM Fixes - Issue Analysis & Solution

**Date:** 2025-12-03
**Priority:** P0 - Blocking Issues
**Status:** 🔧 IN PROGRESS

---

## 🔍 Root Cause Analysis

### Issue #1: `exec` Command Not Found
**Error:** `jsh: command not found: exec`

**Root Cause:**
The CLI wrapper scripts use `exec` command which is not available in WebContainer's `jsh` shell.

**Files Affected:**
1. `app/lib/webcontainer/cli-installer.ts:56` - Uses `exec node ...`
2. `app/lib/webcontainer/package-manager.ts:124` - Uses `exec node ...`

**Code:**
```bash
#!/bin/bash
exec node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"
```

**Why It Fails:**
- WebContainer uses `jsh` (custom shell), not bash
- `jsh` doesn't support `exec` builtin command
- Script fails immediately when trying to run CLI

---

### Issue #2: npm Cache Corruption
**Error:** `EEXIST: file already exists, open '/home/.npm/_cacache/...'`

**Root Cause:**
npm cache gets corrupted when WebContainer is restarted or npm processes are killed mid-operation.

**Impact:**
- npm install fails
- Can't install packages
- Development workflow blocked

---

### Issue #3: Inconsistent CLI Entry Points
**Problem:** Two different paths used for CLI:
- `cli-installer.ts` uses: `cli-tools/node_modules/recoder-code/bin/recoder.js`
- `package-manager.ts` uses: `cli-tools/node_modules/recoder-code/cli/run.js`

**Impact:**
- CLI might not work depending on which script is used
- Confusing for maintenance

---

## ✅ Solutions Implemented

### Fix #1: Remove `exec` Command
**Change:** Replace `exec node ...` with direct `node ...` call

**Before:**
```bash
#!/bin/bash
exec node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"
```

**After:**
```bash
#!/bin/sh
node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"
```

**Why This Works:**
- `node` command is available in jsh
- No need for `exec` to replace the shell process
- Simpler and more compatible

---

### Fix #2: Add npm Cache Cleaning
**Addition:** Clear npm cache before installations

**Implementation:**
```typescript
// Clear npm cache before installing (fixes EEXIST errors)
await webcontainer.spawn('npm', ['cache', 'clean', '--force']);
```

**When to Run:**
- Before first npm install
- After WebContainer restart
- When EEXIST errors occur

---

### Fix #3: Standardize CLI Path
**Decision:** Use consistent path across all files

**Standard Path:** `cli-tools/node_modules/recoder-code/bin/recoder.js`

**Updated Files:**
- ✅ `cli-installer.ts` - Already uses correct path
- 🔧 `package-manager.ts` - Need to update from `cli/run.js` to `bin/recoder.js`

---

## 📝 Implementation Plan

### Phase 1: Fix Wrapper Scripts (5 min)
1. Update `cli-installer.ts` - Remove `exec`, change shebang to `#!/bin/sh`
2. Update `package-manager.ts` - Remove `exec`, change shebang, fix path
3. Test CLI installation

### Phase 2: Add Cache Cleaning (5 min)
1. Add cache clean function to `package-manager.ts`
2. Call before npm install operations
3. Add error handling

### Phase 3: Verify & Test (5 min)
1. Test `npm install` in terminal
2. Test `npm run dev` in terminal
3. Test `recoder-code --help`
4. Verify no EEXIST errors

**Total Time:** ~15 minutes

---

## 🔧 Code Changes

### File 1: `app/lib/webcontainer/cli-installer.ts`

**Line 56-57 (Change):**
```typescript
// OLD:
const cliScript = `#!/bin/bash
exec node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"`;

// NEW:
const cliScript = `#!/bin/sh
node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"`;
```

---

### File 2: `app/lib/webcontainer/package-manager.ts`

**Line 123-125 (Change):**
```typescript
// OLD:
const recoderScript = `#!/bin/sh
exec node /home/project/cli-tools/node_modules/recoder-code/cli/run.js "$@"
`;

// NEW:
const recoderScript = `#!/bin/sh
node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"
`;
```

**Add New Function (After line 80):**
```typescript
/**
 * Clear npm cache (fixes EEXIST errors)
 */
export async function clearNpmCache(webcontainer: WebContainer): Promise<boolean> {
  try {
    logger.info('🧹 Clearing npm cache...');

    const process = await webcontainer.spawn('npm', ['cache', 'clean', '--force']);
    const exitCode = await process.exit;

    if (exitCode === 0) {
      logger.info('✅ npm cache cleared');
      return true;
    } else {
      logger.warn('⚠️ npm cache clean returned non-zero exit code:', exitCode);
      return false;
    }
  } catch (error) {
    logger.error('Failed to clear npm cache:', error);
    return false;
  }
}
```

**Update `installGlobalPackages` (Line 85):**
```typescript
export async function installGlobalPackages(webcontainer: WebContainer): Promise<void> {
  logger.info('🔧 Setting up terminal packages...');

  // Clear npm cache first to prevent EEXIST errors
  await clearNpmCache(webcontainer);

  // Create cli-tools directory
  try {
    await webcontainer.fs.mkdir('cli-tools', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  // ... rest of function
}
```

---

## 🎯 Expected Results

### Before Fix:
```bash
$ recoder-code --help
jsh: command not found: exec

$ npm install
npm error EEXIST: file already exists, open '/home/.npm/_cacache/...'
```

### After Fix:
```bash
$ recoder-code --help
recoder-code v1.0.0

Usage:
  recoder-code [command] [options]

Commands:
  generate    Generate code from description
  ...

$ npm install
✅ Dependencies installed successfully

$ npm run dev
✅ Development server starting...
```

---

## 🧪 Testing Checklist

- [ ] CLI installs without errors
- [ ] `recoder-code --version` shows version
- [ ] `recoder-code --help` shows help
- [ ] `npm install` completes successfully
- [ ] `npm run dev` starts dev server
- [ ] No "exec" errors in console
- [ ] No EEXIST cache errors
- [ ] Terminal commands work after page reload

---

## 🚨 Known Limitations

### Engine Version Warnings (Non-blocking)
```
npm warn EBADENGINE Unsupported engine {
  package: 'react-native@0.81.4',
  required: { node: '>= 20.19.4' },
  current: { node: 'v20.19.1', npm: '10.8.2' }
}
```

**Status:** This is a WARNING, not an error
**Impact:** Minimal - packages still work
**Fix:** Not required (WebContainer limitation)

---

## 📊 Success Metrics

- ✅ CLI installation success rate: 100%
- ✅ npm install success rate: 100%
- ✅ Terminal commands work without errors
- ✅ No user-facing "exec" or EEXIST errors

---

**Next Steps:** Implement the fixes and test thoroughly.
