# Action Status Bug Fix

**Date:** 2025-12-03
**Issue:** npm install spamming thousands of times
**Root Cause:** `action.status.set is not a function`

---

## 🔴 The Bug

**Error:**
```
TypeError: action.status.set is not a function
Action 9 (shell) failed: action.status.set is not a function
```

**Impact:**
- npm install fails immediately
- Action retry mechanism triggers repeatedly
- Console spammed with thousands of npm install attempts
- Application becomes unusable

---

## 🔍 Root Cause

In my earlier changes to add progress tracking for npm install, I added code that calls:

```typescript
action.status.set(`running:✅ Installed ${packageCount} packages`);
```

**Problem:** `action.status` is NOT a writable store in the shell action context. It's a regular property, not a Svelte/Nanostores writable.

**Where it failed:**
- Lines 287, 295, 301, 307, 313, 345 in `action-runner.ts`
- All called `action.status.set()` which doesn't exist

---

## ✅ The Fix

**Changed from:**
```typescript
action.status.set(`running:📦 Installing ${currentPackage}...`);
```

**Changed to:**
```typescript
logger.info(`📦 Installing ${currentPackage}...`);
```

**Result:**
- Progress tracking still works via logger
- No more TypeError
- npm install can complete normally
- No more spam

---

## 📝 Files Modified

**File:** `app/lib/runtime/action-runner.ts`

**Lines Changed:** 6 locations (287, 295, 301, 307, 313, 345)

**Changes:**
1. Line 287: `action.status.set` → `logger.info`
2. Line 295: `action.status.set` → `logger.info`
3. Line 301: `action.status.set` → `logger.info`
4. Line 307: `action.status.set` → `logger.info`
5. Line 313: `action.status.set` → `logger.info`
6. Line 345: `action.status.set` → `logger.info`

---

## 🧪 Testing

**Before Fix:**
- ❌ npm install crashes immediately
- ❌ Thousands of retry attempts
- ❌ Console flooded with errors
- ❌ Application unusable

**After Fix:**
- ✅ npm install runs normally
- ✅ Progress logged to console
- ✅ No errors
- ✅ Application works

---

## 💡 Lesson Learned

**Always check object types before calling methods!**

The action object structure:
```typescript
type ActionState = {
  status: 'pending' | 'running' | 'complete' | 'failed';  // ← Just a string!
  // NOT: status: WritableStore<string>
}
```

**Should have used:**
- Type checking: `typeof action.status.set === 'function'`
- Or: Just use logger instead of trying to update UI state

---

## 🎯 Impact

**This fix resolves:**
1. ✅ npm install spam issue
2. ✅ Action execution errors
3. ✅ Console flooding
4. ✅ Application hang

**Side benefit:**
- Progress info still visible in logs
- Cleaner approach (logging vs state mutation)
- No UI coupling in action runner

---

**Status:** ✅ FIXED
**Time to Fix:** 5 minutes
**Severity:** P0 - Critical (blocks all npm installs)
