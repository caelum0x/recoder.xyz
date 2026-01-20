# Auto-Fix Quick Reference

## 🚀 Quick Start

```typescript
import { requestEnhancedAIFix } from '~/lib/services/auto-fix';

// Enhanced auto-fix (recommended)
await requestEnhancedAIFix(errors, projectId, sendMessage);
```

## 📋 Common Use Cases

### 1. Fix All Errors with Confirmation
```typescript
await requestEnhancedAIFix(errors, projectId, sendMessage, {
  requireConfirmation: true,  // Ask user before fixing
  autoReadFiles: true,        // Read files automatically
  checkDependencies: true,    // Check for missing packages
});
```

### 2. Preview Fix Plan First
```typescript
import { createFixPlan } from '~/lib/services/auto-fix';

const plan = createFixPlan(errors);
console.log(`Will read ${plan.filesToRead.length} files`);
console.log(`Missing: ${plan.missingDependencies.join(', ')}`);
```

### 3. Detect Errors from Terminal
```typescript
import { parseTerminalErrors } from '~/lib/services/auto-fix';

const output = terminal.getBuffer();
const errors = parseTerminalErrors(output);
```

### 4. React Hook for Terminal Monitoring
```typescript
import { useTerminalErrorDetection } from '~/lib/hooks/useTerminalErrorDetection';

function MyComponent() {
  const { addTerminalOutput } = useTerminalErrorDetection({
    onErrorsDetected: (errors) => {
      // Handle detected errors
    },
  });
}
```

### 5. Create Snapshot Before Fix
```typescript
import { createFixSnapshot, rollbackToSnapshot } from '~/lib/services/auto-fix';

const snapshotId = await createFixSnapshot(projectId);
try {
  // Apply fixes...
} catch (error) {
  await rollbackToSnapshot(projectId, snapshotId);
}
```

## 🔍 Error Detection Patterns

| Pattern | Example | Type |
|---------|---------|------|
| TypeScript | `src/App.tsx(10,5): error TS2304` | type |
| Vite/Rollup | `✘ [ERROR] Could not resolve` | module |
| ESLint | `src/App.tsx:10:5: 'foo' is not defined` | syntax |
| npm | `npm ERR! Cannot find module` | npm |
| Runtime | `Error: Cannot find module` | runtime |

## ⚙️ Options Reference

```typescript
interface AutoFixOptions {
  requireConfirmation?: boolean;  // Default: true
  autoReadFiles?: boolean;        // Default: true
  checkDependencies?: boolean;    // Default: true
  maxFilesToRead?: number;        // Default: 10
}
```

## 🎯 API Reference

### Core Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `requestEnhancedAIFix()` | Enhanced fix with pre-processing | `Promise<void>` |
| `requestAIFix()` | Basic fix request | `void` |
| `parseTerminalErrors()` | Parse terminal output | `BuildError[]` |
| `extractMissingDependencies()` | Get missing packages | `string[]` |
| `createFixPlan()` | Preview fix without executing | `FixPlan` |
| `createFixSnapshot()` | Create filesystem snapshot | `Promise<string>` |
| `rollbackToSnapshot()` | Revert to snapshot | `Promise<boolean>` |

### ProblemsPanel Controls

| Icon | Purpose | State |
|------|---------|-------|
| 🛡️ Shield | Confirmation required | On/Off |
| ⚡ Lightning | Enhanced mode | On/Off |
| 📋 Plan | Show fix plan | Button |
| 🪄 Fix All | Execute auto-fix | Button |

## 💡 Best Practices

1. ✅ **Always enable confirmation in production**
   ```typescript
   requireConfirmation: true
   ```

2. ✅ **Limit file reading to prevent slowdown**
   ```typescript
   maxFilesToRead: 10
   ```

3. ✅ **Create snapshots for complex fixes**
   ```typescript
   const snapshotId = await createFixSnapshot(projectId);
   ```

4. ✅ **Use debouncing for terminal detection**
   ```typescript
   debounceMs: 1000  // Wait 1s before processing
   ```

5. ✅ **Check dependencies before fixing**
   ```typescript
   checkDependencies: true
   ```

## 🐛 Debugging

### Check if auto-fix is enabled
```typescript
import { canAutoFix } from '~/lib/stores/errors';
if (!canAutoFix()) {
  console.log('Auto-fix disabled (too many attempts)');
}
```

### View detected errors
```typescript
import { errorsAtom } from '~/lib/stores/errors';
import { useStore } from '@nanostores/react';

const errors = useStore(errorsAtom);
console.log(`Current errors: ${errors.length}`);
```

### Monitor terminal output
```typescript
const { addTerminalOutput } = useTerminalErrorDetection({
  enabled: true,
  onErrorsDetected: (errors) => {
    console.log('[Auto-Fix] Detected:', errors);
  },
});
```

## 📊 Fix Plan Structure

```typescript
interface FixPlan {
  errors: BuildError[];           // Errors to fix
  filesToRead: string[];         // Files to read for context
  missingDependencies: string[]; // Missing npm packages
  estimatedSteps: number;        // Estimated fix steps
  requiresUserConfirmation: boolean;
}
```

## 🔄 Workflow Steps

```
1. EXPLORE
   ├─ Read error files
   ├─ Read package.json
   └─ Read related files

2. DIAGNOSE
   ├─ List possible causes
   ├─ Identify most likely
   └─ Explain reasoning

3. CONFIRM (if required)
   └─ Wait for user approval

4. FIX
   ├─ Create snapshot
   ├─ Apply minimal changes
   ├─ Install missing deps
   └─ Update package.json

5. VERIFY
   ├─ Run build/dev server
   └─ Rollback if failed
```

## 🎨 UI Integration

### In ProblemsPanel
```tsx
import { requestEnhancedAIFix } from '~/lib/services/auto-fix';

<button onClick={async () => {
  await requestEnhancedAIFix(
    errors,
    projectId,
    sendMessage,
    { requireConfirmation: true }
  );
}}>
  Fix All
</button>
```

### Custom Fix Handler
```tsx
const handleFix = useCallback(async (errors: BuildError[]) => {
  const plan = createFixPlan(errors);

  if (plan.missingDependencies.length > 0) {
    console.warn('Missing deps:', plan.missingDependencies);
  }

  await requestEnhancedAIFix(errors, projectId, sendMessage);
}, [projectId]);
```

## 📈 Performance Tips

- **File Reading**: Limited by `maxFilesToRead` option
- **Debouncing**: Use `debounceMs` for terminal detection
- **Caching**: File contents are not cached (reads are fresh)
- **Memory**: Terminal buffer clears after processing

## 🔒 Security Notes

- ✅ Only reads files within workspace
- ✅ Validates dependency names
- ✅ Requires confirmation by default
- ✅ Creates snapshots before changes
- ✅ No arbitrary code execution

## 📞 Support

- 📖 Full docs: `AUTO_FIX_README.md`
- 📝 Examples: `AUTO_FIX_IMPROVEMENTS.md`
- 🔧 Source: `app/lib/services/auto-fix.ts`
- 🪝 Hook: `app/lib/hooks/useTerminalErrorDetection.ts`
