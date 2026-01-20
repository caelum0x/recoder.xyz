# Auto-Fix Service Documentation

## Overview

The enhanced auto-fix service provides AI-assisted error resolution with intelligent pre-processing, dependency checking, and rollback capabilities.

## Features

### 1. Automatic Error Detection
- **Terminal Output Parsing**: Detects errors from terminal output using pattern matching
- **Diagnostics Integration**: Works with existing diagnostics from TypeScript, ESLint, and build tools
- **Real-time Detection**: Monitors terminal output and automatically detects new errors

### 2. Pre-Fix Analysis
- **File Reading**: Automatically reads relevant files before attempting fixes
- **Dependency Checking**: Identifies missing npm packages from error messages
- **Context Gathering**: Provides AI with file contents and package.json for better diagnosis

### 3. Confirmation & Safety
- **Fix Plans**: Shows a preview of what will be fixed before execution
- **User Confirmation**: Optional requirement for user approval before applying fixes
- **Snapshots**: Creates filesystem snapshots before applying fixes (for rollback)
- **Rollback Capability**: Can revert to previous state if fix fails

### 4. Intelligent Fixing
- **Minimal Changes**: Instructs AI to make targeted fixes, not regenerate entire files
- **Dependency Installation**: Automatically adds missing packages to package.json
- **Verification**: Runs build/dev server after fixes to verify success

## Usage

### Basic Usage

```typescript
import { requestAIFix } from '~/lib/services/auto-fix';

// Simple fix request
requestAIFix(errors, sendMessage);
```

### Enhanced Usage with Options

```typescript
import { requestEnhancedAIFix, type AutoFixOptions } from '~/lib/services/auto-fix';

const options: AutoFixOptions = {
  requireConfirmation: true,      // Ask user before applying fixes
  autoReadFiles: true,            // Automatically read relevant files
  checkDependencies: true,        // Check for missing npm packages
  maxFilesToRead: 10,             // Limit number of files to read
};

await requestEnhancedAIFix(errors, projectId, sendMessage, options);
```

### Creating a Fix Plan

```typescript
import { createFixPlan } from '~/lib/services/auto-fix';

const plan = createFixPlan(errors, options);
console.log('Files to read:', plan.filesToRead);
console.log('Missing deps:', plan.missingDependencies);
console.log('Estimated steps:', plan.estimatedSteps);
```

### Terminal Error Detection

```typescript
import { parseTerminalErrors } from '~/lib/services/auto-fix';

const terminalOutput = `
src/App.tsx(10,5): error TS2304: Cannot find name 'React'
npm ERR! Cannot find module 'express'
`;

const errors = parseTerminalErrors(terminalOutput);
// Returns BuildError[] with detected errors
```

### Using the Hook

```typescript
import { useTerminalErrorDetection } from '~/lib/hooks/useTerminalErrorDetection';

function MyComponent() {
  const { addTerminalOutput, detectErrors, reset } = useTerminalErrorDetection({
    enabled: true,
    onErrorsDetected: (errors) => {
      console.log('Detected errors:', errors);
    },
    debounceMs: 1000,
  });

  // Add terminal output as it comes in
  useEffect(() => {
    terminalStore.on('data', (data) => {
      addTerminalOutput(data);
    });
  }, []);
}
```

## Error Detection Patterns

The service detects errors from various sources:

### TypeScript Errors
```
src/file.ts(10,5): error TS2304: Cannot find name 'foo'
```

### Vite/Rollup Errors
```
✘ [ERROR] Could not resolve 'module-name'
```

### ESLint Errors
```
src/file.ts:10:5: 'foo' is not defined [no-undef]
```

### npm Errors
```
npm ERR! Cannot find module 'module-name'
```

### Runtime Errors
```
Error: Cannot find module 'module-name'
```

## AI Prompt Workflow

The service generates prompts that guide the AI through a structured workflow:

### Step 1: Explore
- Read files with errors
- Read package.json
- Read related/imported files

### Step 2: Diagnose
- List 3-5 possible causes
- Identify most likely causes
- Explain reasoning

### Step 3: Confirm (Optional)
- Ask user: "Does this diagnosis look correct? Should I proceed with the fix?"
- Wait for user approval

### Step 4: Fix
- Make minimal targeted fixes using strReplace
- Add missing packages to package.json
- Run npm install if needed
- Create snapshot before applying changes

### Step 5: Verify
- Run build/dev server
- Confirm fix worked
- Rollback if fix failed

## API Reference

### Functions

#### `formatErrorsForAI(errors, options?)`
Formats errors into an AI-readable prompt with context.

#### `requestEnhancedAIFix(errors, projectId, sendMessage, options?)`
Enhanced auto-fix with file reading and dependency checking.

#### `parseTerminalErrors(output)`
Parses terminal output and extracts errors.

#### `extractMissingDependencies(errors)`
Extracts missing npm package names from error messages.

#### `checkMissingDependencies(projectId, requiredDeps)`
Checks package.json for missing dependencies.

#### `createFixPlan(errors, options?)`
Creates a fix plan without executing it.

#### `createFixSnapshot(projectId)`
Creates a filesystem snapshot before fixes.

#### `rollbackToSnapshot(projectId, snapshotId)`
Rolls back to a previous snapshot.

### Types

#### `AutoFixOptions`
```typescript
interface AutoFixOptions {
  requireConfirmation?: boolean;  // Default: true
  autoReadFiles?: boolean;        // Default: true
  checkDependencies?: boolean;    // Default: true
  maxFilesToRead?: number;        // Default: 10
}
```

#### `FixPlan`
```typescript
interface FixPlan {
  errors: BuildError[];
  filesToRead: string[];
  missingDependencies: string[];
  estimatedSteps: number;
  requiresUserConfirmation: boolean;
}
```

## ProblemsPanel Integration

The ProblemsPanel component now includes:

### Enhanced Controls
- **Shield icon**: Toggle confirmation requirement
- **Lightning icon**: Toggle enhanced auto-fix mode
- **Plan button**: Preview fix plan before execution
- **Fix All button**: Execute auto-fix with current settings

### Fix Plan Modal
Shows before execution:
- List of errors to fix
- Files that will be read
- Missing dependencies detected
- Estimated number of steps
- Confirmation requirement status

### Settings Persistence
Settings are stored in component state:
- `requireConfirmation`: Whether to ask before fixing
- `autoFixEnabled`: Whether to use enhanced mode vs basic

## Best Practices

1. **Always Enable Confirmation**: For safety, keep `requireConfirmation: true` in production
2. **Limit File Reading**: Use `maxFilesToRead` to avoid reading too many files
3. **Create Snapshots**: Always create snapshots before applying fixes
4. **Verify Fixes**: Run build/dev server after fixes to ensure they work
5. **Monitor Terminal**: Use terminal error detection for real-time feedback

## Future Enhancements

Potential improvements:
- Machine learning to improve error pattern detection
- Automatic fix attempt limits (max 3 attempts per error)
- Fix success rate tracking
- Custom error patterns (user-defined)
- Integration with git for better rollback
- Multi-file fix coordination
