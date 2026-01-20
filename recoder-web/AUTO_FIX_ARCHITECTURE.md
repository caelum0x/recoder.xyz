# Auto-Fix Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                         │
├─────────────────────────────────────────────────────────────────┤
│                      ProblemsPanel.tsx                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Shield  │  │Lightning │  │   Plan   │  │ Fix All  │       │
│  │  Toggle  │  │  Toggle  │  │  Button  │  │  Button  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       │             │              │              │             │
│       └─────────────┴──────────────┴──────────────┘             │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CORE SERVICES                             │
├─────────────────────────────────────────────────────────────────┤
│                    auto-fix.ts (615 lines)                      │
│                                                                 │
│  ┌────────────────────┐  ┌────────────────────┐               │
│  │  Error Detection   │  │   Pre-Processing   │               │
│  ├────────────────────┤  ├────────────────────┤               │
│  │ parseTerminal      │  │ readFileForError   │               │
│  │ Errors()          │  │ checkMissing       │               │
│  │                    │  │ Dependencies()     │               │
│  │ extractMissing     │  │ createFixPlan()    │               │
│  │ Dependencies()     │  │                    │               │
│  └────────────────────┘  └────────────────────┘               │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       │                                         │
│  ┌────────────────────▼──────────────────────┐                 │
│  │         AI Prompt Generation              │                 │
│  ├───────────────────────────────────────────┤                 │
│  │ formatErrorsForAI()                       │                 │
│  │ formatFileErrorsForAI()                   │                 │
│  │ requestEnhancedAIFix()                    │                 │
│  └───────────────────────────────────────────┘                 │
│                       │                                         │
│                       ▼                                         │
│  ┌───────────────────────────────────────────┐                 │
│  │        Safety & Rollback                  │                 │
│  ├───────────────────────────────────────────┤                 │
│  │ createFixSnapshot()                       │                 │
│  │ rollbackToSnapshot()                      │                 │
│  └───────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REACT HOOKS                                │
├─────────────────────────────────────────────────────────────────┤
│              useTerminalErrorDetection.ts                       │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                 │
│  │ addTerminalOutput │  │  detectErrors()   │                 │
│  │                   │  │                   │                 │
│  │ Debounced buffer  │  │ Pattern matching  │                 │
│  └───────────────────┘  └───────────────────┘                 │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       │                                         │
│                       ▼                                         │
│             onErrorsDetected()                                  │
│                  callback                                       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STATE MANAGEMENT                            │
├─────────────────────────────────────────────────────────────────┤
│                    errors.ts (Nanostores)                       │
│                                                                 │
│  errorsAtom                isAutoFixingAtom                     │
│  errorsByFileAtom          autoFixAttemptsAtom                  │
│  hasBlockingErrorsAtom     canAutoFix()                         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND API                                 │
├─────────────────────────────────────────────────────────────────┤
│                   docker-api.ts                                 │
│                                                                 │
│  dockerGet()  - Read files, package.json                        │
│  dockerPost() - Create snapshots, restore                       │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flow

### 1. User Clicks "Fix All"

```
ProblemsPanel
    │
    ├─── Check: autoFixEnabled?
    │    ├─── Yes: requestEnhancedAIFix()
    │    └─── No:  formatErrorsForAI()
    │
    └─── Dispatch: 'recoder:fix-errors' event
```

### 2. Enhanced Fix Flow

```
requestEnhancedAIFix(errors, projectId, sendMessage, options)
    │
    ├─── Extract files to read from errors
    │    └─── Set<string>: [error.filePath, 'package.json', ...]
    │
    ├─── Read files (if autoReadFiles)
    │    └─── Promise.all([readFileForError(), ...])
    │
    ├─── Check dependencies (if checkDependencies)
    │    ├─── extractMissingDependencies(errors)
    │    └─── checkMissingDependencies(projectId, deps)
    │
    ├─── Format prompt with context
    │    ├─── formatErrorsForAI(errors, options)
    │    ├─── Add file contents
    │    └─── Add missing dependencies
    │
    └─── Send to AI
         └─── sendMessage(prompt)
```

### 3. Terminal Error Detection Flow

```
Terminal Output
    │
    ├─── useTerminalErrorDetection hook
    │    │
    │    ├─── addTerminalOutput(data)
    │    │    └─── Append to buffer
    │    │
    │    ├─── Debounce timer (1000ms)
    │    │
    │    └─── detectErrors()
    │         ├─── parseTerminalErrors(buffer)
    │         ├─── Filter duplicates
    │         ├─── Update errorsAtom
    │         └─── Call onErrorsDetected()
    │
    └─── ProblemsPanel shows new errors
```

### 4. Fix Plan Preview Flow

```
User clicks "Plan" button
    │
    ├─── createFixPlan(errors, options)
    │    │
    │    ├─── Extract files to read
    │    ├─── Extract missing dependencies
    │    ├─── Estimate steps
    │    │    └─── read + diagnose + fix + verify
    │    │
    │    └─── Return FixPlan object
    │
    ├─── setFixPlan(plan)
    ├─── setShowFixPlan(true)
    │
    └─── Modal displays:
         ├─── Errors to fix
         ├─── Files to read
         ├─── Missing dependencies
         └─── Estimated steps
```

### 5. Snapshot & Rollback Flow

```
Before Fix
    │
    ├─── createFixSnapshot(projectId)
    │    └─── POST /api/snapshot/:projectId
    │         └─── Returns snapshotId
    │
    ├─── Apply AI fixes...
    │
    └─── If error occurs:
         └─── rollbackToSnapshot(projectId, snapshotId)
              └─── POST /api/snapshot/:projectId/restore
```

## Data Structures

### BuildError
```typescript
interface BuildError {
  id: string;
  type: 'syntax' | 'type' | 'reference' | 'module' | 'build' | 'npm' | 'runtime' | 'unknown';
  severity: 'error' | 'warning';
  message: string;
  shortMessage: string;
  filePath?: string;
  line?: number;
  column?: number;
  source: 'typescript' | 'vite' | 'eslint' | 'npm' | 'runtime' | 'unknown';
  rawError: string;
  timestamp: number;
}
```

### AutoFixOptions
```typescript
interface AutoFixOptions {
  requireConfirmation?: boolean;  // Default: true
  autoReadFiles?: boolean;        // Default: true
  checkDependencies?: boolean;    // Default: true
  maxFilesToRead?: number;        // Default: 10
}
```

### FixPlan
```typescript
interface FixPlan {
  errors: BuildError[];
  filesToRead: string[];
  missingDependencies: string[];
  estimatedSteps: number;
  requiresUserConfirmation: boolean;
}
```

### TerminalErrorPattern
```typescript
interface TerminalErrorPattern {
  pattern: RegExp;
  type: BuildError['type'];
  severity: BuildError['severity'];
  extractFilePath?: (match: RegExpMatchArray) => string | undefined;
  extractLine?: (match: RegExpMatchArray) => number | undefined;
  extractMessage?: (match: RegExpMatchArray) => string;
}
```

## Error Detection Patterns

```typescript
const PATTERNS = [
  // TypeScript: src/App.tsx(10,5): error TS2304: Cannot find name 'React'
  {
    pattern: /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/,
    type: 'type',
    severity: 'error',
  },

  // Vite: ✘ [ERROR] Could not resolve 'module-name'
  {
    pattern: /✘ \[ERROR\] (.+)/,
    type: 'module',
    severity: 'error',
  },

  // ESLint: src/App.tsx:10:5: 'foo' is not defined [no-undef]
  {
    pattern: /(.+?):(\d+):(\d+): (.+?) \[(.+?)\]/,
    type: 'syntax',
    severity: 'error',
  },

  // npm: npm ERR! Cannot find module 'express'
  {
    pattern: /npm ERR! (.+)/,
    type: 'npm',
    severity: 'error',
  },

  // Runtime: Error: Cannot find module 'express'
  {
    pattern: /Error: (.+)/,
    type: 'runtime',
    severity: 'error',
  },
];
```

## AI Workflow Steps

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: EXPLORE (Mandatory)                                  │
├──────────────────────────────────────────────────────────────┤
│ • Read files with errors                                     │
│ • Read package.json                                          │
│ • Read related/imported files                                │
│ • List: [app/App.tsx, app/index.tsx, package.json]          │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: DIAGNOSE                                             │
├──────────────────────────────────────────────────────────────┤
│ • List 3-5 possible causes                                   │
│ • Identify 1-2 most likely causes                            │
│ • Explain reasoning                                          │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: CONFIRM (if requireConfirmation: true)              │
├──────────────────────────────────────────────────────────────┤
│ • Ask: "Does this diagnosis look correct?"                  │
│ • Wait for user response                                     │
│ • ⚠️  DO NOT PROCEED WITHOUT CONFIRMATION                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: FIX (After confirmation)                             │
├──────────────────────────────────────────────────────────────┤
│ • Create snapshot (optional but recommended)                 │
│ • Make MINIMAL targeted fixes using strReplace               │
│ • Don't regenerate entire files                              │
│ • Add missing packages to package.json                       │
│ • Run npm install if needed                                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 5: VERIFY                                               │
├──────────────────────────────────────────────────────────────┤
│ • Run npm run dev (or relevant command)                      │
│ • Check if errors are resolved                               │
│ • If fix failed: rollback to snapshot                        │
└──────────────────────────────────────────────────────────────┘
```

## Performance Considerations

### File Reading
- **Limit**: `maxFilesToRead` (default: 10)
- **Async**: Parallel reads with `Promise.all()`
- **Caching**: None (fresh reads each time)

### Terminal Detection
- **Debouncing**: 1000ms delay (configurable)
- **Buffer**: Cleared after processing
- **Memory**: O(output size) until debounce completes

### Error Deduplication
- **Method**: ID-based Set comparison
- **Complexity**: O(n) where n = existing errors
- **Storage**: All errors in errorsAtom

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Layers                         │
├─────────────────────────────────────────────────────────────┤
│ 1. File Access                                              │
│    └─ Only reads within workspace directory                │
│                                                             │
│ 2. Confirmation                                             │
│    └─ User approval required by default                    │
│                                                             │
│ 3. Snapshots                                                │
│    └─ Created before destructive operations                │
│                                                             │
│ 4. Validation                                               │
│    └─ Dependency names validated (no arbitrary packages)   │
│                                                             │
│ 5. Rollback                                                 │
│    └─ Can revert to previous state                         │
└─────────────────────────────────────────────────────────────┘
```

## Extension Points

### Adding New Error Patterns
```typescript
// In auto-fix.ts
const TERMINAL_ERROR_PATTERNS: TerminalErrorPattern[] = [
  // Add your pattern here
  {
    pattern: /your-pattern-here/,
    type: 'your-type',
    severity: 'error',
    extractFilePath: (match) => match[1],
    extractLine: (match) => parseInt(match[2], 10),
    extractMessage: (match) => match[3],
  },
];
```

### Custom Fix Workflows
```typescript
// Create custom fix function
export async function customFixWorkflow(
  errors: BuildError[],
  projectId: string,
  customOptions: CustomOptions
) {
  // 1. Custom pre-processing
  // 2. Custom prompt generation
  // 3. Custom post-processing
}
```

### Hook Customization
```typescript
// Extend the hook
export function useCustomErrorDetection(options) {
  const detection = useTerminalErrorDetection(options);

  // Add custom logic
  const customDetect = useCallback(() => {
    detection.detectErrors();
    // Your custom logic here
  }, [detection]);

  return { ...detection, customDetect };
}
```

## Future Architecture Considerations

1. **ML Integration**: Add pattern learning from user corrections
2. **Multi-file Fixes**: Coordinate fixes across related files
3. **Git Integration**: Use git for rollback instead of snapshots
4. **Streaming Fixes**: Apply fixes incrementally with live feedback
5. **Fix Templates**: Reusable fix patterns for common errors
