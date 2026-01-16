# VSCode Integration Plan for Recoder.xyz

## What We've Copied from VSCode

Copied to: `/Users/arhansubasi/recoder.xyz/recoder-web/vscode-components/`

1. **Search** - Global search across files
2. **Files** - Advanced file explorer
3. **Debug** - Full debugger UI
4. **InlineCompletions** - Copilot-style suggestions

## Implementation Plan

### Phase 1: VSCode Search Integration ✅ COPIED
**Status**: Files copied, needs adaptation

**What it provides:**
- Search across all files in workspace
- Regex support
- Replace in files
- Search history
- Include/exclude patterns

**Integration steps:**
1. Adapt VSCode search to use our file system
2. Create SearchPanel component
3. Add keyboard shortcut (Cmd/Ctrl+Shift+F)
4. Wire up to workbench

**Files to create:**
- `app/components/workbench/SearchPanel.tsx` (adapted from vscode-components/search)
- `app/lib/services/search.ts` (search backend)

---

### Phase 2: Enhanced File Explorer ✅ COPIED
**Status**: Files copied, needs adaptation

**What it provides:**
- File decorations (git status, errors)
- Context menus
- Drag & drop
- Multi-select
- Inline rename

**Integration steps:**
1. Enhance existing FileTree with VSCode features
2. Add file decorations for errors
3. Add context menu
4. Add drag & drop support

**Files to modify:**
- `app/components/workbench/FileTree.tsx` (merge with vscode-components/files)

---

### Phase 3: Debugger Integration ✅ COPIED
**Status**: Files copied, needs backend

**What it provides:**
- Breakpoints
- Step through code
- Variable inspection
- Call stack
- Debug console

**Integration steps:**
1. Add debug adapter protocol (DAP) to backend
2. Create DebugPanel component
3. Add breakpoint UI in CodeMirror
4. Wire up to language servers

**Files to create:**
- `docker-backend/src/debug-adapter.ts` (DAP implementation)
- `app/components/workbench/DebugPanel.tsx` (adapted from vscode-components/debug)
- `app/lib/hooks/useDebugger.ts`

---

### Phase 4: Inline Completions (Copilot-style) ✅ COPIED
**Status**: Files copied, needs AI integration

**What it provides:**
- Ghost text suggestions
- Tab to accept
- Multi-line completions
- Context-aware

**Integration steps:**
1. Connect to AI model for completions
2. Add inline completion UI to CodeMirror
3. Add accept/reject keybindings
4. Cache completions

**Files to create:**
- `app/lib/services/inline-completions.ts` (AI completion service)
- `app/components/editor/codemirror/inlineCompletions.ts` (adapted from vscode-components)

---

### Phase 5: Problems Panel (Already Implemented) ✅ DONE
**Status**: Complete with LSP integration

**What we have:**
- Multi-language diagnostics (TypeScript, Python, Rust, Go)
- WebSocket-based updates (no polling)
- Quick fixes
- Advanced filtering
- Click to navigate

**Already implemented:**
- `app/components/workbench/ProblemsPanel.tsx`
- `docker-backend/src/language-server.ts`
- `app/lib/hooks/useLSPDiagnostics.ts`

---

## Priority Implementation Order

### High Priority (Week 1)
1. ✅ **Problems Panel** - DONE
2. 🔄 **Search Panel** - Adapt VSCode search
3. 🔄 **Enhanced File Explorer** - Add decorations & context menu

### Medium Priority (Week 2)
4. ⏳ **Inline Completions** - AI-powered suggestions
5. ⏳ **Debugger** - Basic breakpoints & stepping

### Low Priority (Week 3+)
6. ⏳ **Advanced Debug Features** - Variable inspection, call stack
7. ⏳ **Search & Replace** - Multi-file replace
8. ⏳ **File Decorations** - Git status, error badges

---

## Detailed Implementation: Search Panel

### Backend (docker-backend)
```typescript
// docker-backend/src/search.ts
export class SearchService {
  async searchInFiles(
    containerId: string,
    query: string,
    options: {
      regex?: boolean;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      include?: string[];
      exclude?: string[];
    }
  ): Promise<SearchResult[]> {
    // Use ripgrep in container for fast search
    const rgCmd = `rg --json "${query}" /workspace`;
    // Parse results and return
  }
}
```

### Frontend (recoder-web)
```typescript
// app/components/workbench/SearchPanel.tsx
export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  
  const handleSearch = async () => {
    const res = await fetch(`/api/search/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ query, options })
    });
    setResults(await res.json());
  };
  
  return (
    <div className="search-panel">
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SearchResults results={results} />
    </div>
  );
}
```

---

## Detailed Implementation: Inline Completions

### AI Service
```typescript
// app/lib/services/inline-completions.ts
export async function getInlineCompletion(
  code: string,
  cursorPosition: number,
  language: string
): Promise<string> {
  // Call AI model (Claude, GPT, etc.)
  const response = await fetch('/api/completions', {
    method: 'POST',
    body: JSON.stringify({ code, cursorPosition, language })
  });
  return response.text();
}
```

### CodeMirror Integration
```typescript
// app/components/editor/codemirror/inlineCompletions.ts
import { ViewPlugin } from '@codemirror/view';

export const inlineCompletionsPlugin = ViewPlugin.fromClass(class {
  async update(update: ViewUpdate) {
    if (update.docChanged) {
      const completion = await getInlineCompletion(
        update.state.doc.toString(),
        update.state.selection.main.head,
        'typescript'
      );
      // Show ghost text
      this.showGhostText(completion);
    }
  }
});
```

---

## Detailed Implementation: Debugger

### Backend DAP
```typescript
// docker-backend/src/debug-adapter.ts
export class DebugAdapter {
  async setBreakpoint(file: string, line: number): Promise<void> {
    // Use node --inspect or other debugger
  }
  
  async continue(): Promise<void> { }
  async stepOver(): Promise<void> { }
  async stepInto(): Promise<void> { }
  async stepOut(): Promise<void> { }
  
  async getVariables(): Promise<Variable[]> { }
  async getCallStack(): Promise<StackFrame[]> { }
}
```

### Frontend Debug Panel
```typescript
// app/components/workbench/DebugPanel.tsx
export function DebugPanel() {
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [callStack, setCallStack] = useState<StackFrame[]>([]);
  
  return (
    <div className="debug-panel">
      <BreakpointsList breakpoints={breakpoints} />
      <CallStack frames={callStack} />
      <VariablesView />
      <DebugConsole />
    </div>
  );
}
```

---

## File Structure After Integration

```
recoder-web/
├── vscode-components/          # Copied from VSCode
│   ├── search/                 # Search implementation
│   ├── files/                  # File explorer
│   ├── debug/                  # Debugger
│   └── inlineCompletions/      # Copilot-style
│
├── app/
│   ├── components/
│   │   └── workbench/
│   │       ├── ProblemsPanel.tsx      ✅ DONE
│   │       ├── SearchPanel.tsx        🔄 TODO (adapt from vscode-components)
│   │       ├── DebugPanel.tsx         ⏳ TODO (adapt from vscode-components)
│   │       └── FileTree.tsx           🔄 TODO (enhance with vscode-components)
│   │
│   └── lib/
│       ├── services/
│       │   ├── search.ts              🔄 TODO
│       │   ├── inline-completions.ts  ⏳ TODO
│       │   └── debug.ts               ⏳ TODO
│       │
│       └── hooks/
│           ├── useLSPDiagnostics.ts   ✅ DONE
│           ├── useSearch.ts           🔄 TODO
│           └── useDebugger.ts         ⏳ TODO
│
docker-backend/
└── src/
    ├── language-server.ts             ✅ DONE (multi-language)
    ├── search.ts                      🔄 TODO
    └── debug-adapter.ts               ⏳ TODO
```

---

## Next Steps

### Immediate (Today):
1. Adapt VSCode search to our file system
2. Create SearchPanel component
3. Add search API endpoint

### This Week:
1. Enhance FileTree with VSCode decorations
2. Add context menus
3. Implement inline completions

### Next Week:
1. Add debugger backend (DAP)
2. Create DebugPanel UI
3. Add breakpoint support in CodeMirror

---

## Benefits of Using VSCode Components

✅ **Battle-tested** - Used by millions of developers
✅ **Feature-complete** - All edge cases handled
✅ **Accessible** - ARIA compliant
✅ **Performant** - Optimized for large codebases
✅ **Familiar UX** - Developers already know how to use it

---

## Licensing Note

VSCode is MIT licensed, so we can use and adapt their code.
Must include copyright notice in adapted files.
