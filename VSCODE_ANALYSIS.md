# VSCode Problems Panel Architecture (Cloned & Analyzed)

## Key Files from VSCode Source

### 1. Markers (Problems) System
Location: `/tmp/vscode/src/vs/workbench/contrib/markers/`

**Core Files:**
- `markersModel.ts` - Data model for markers/diagnostics
- `markersView.ts` - Problems panel UI
- `markersTreeViewer.ts` - Tree view for grouped errors
- `markersFilterOptions.ts` - Filter/search functionality

**Key Classes:**
```typescript
// From markersModel.ts
export class ResourceMarkers {
  readonly resource: URI;
  readonly markers: readonly Marker[];
  get total(): number;
}

export class Marker {
  get resource(): URI;
  get range(): IRange;
  get lines(): string[];
  readonly marker: IMarker; // severity, message, code
}
```

### 2. Language Server Integration
Location: `/tmp/vscode/extensions/typescript-language-features/`

**VSCode uses:**
- `typescript-language-features` extension
- Communicates via LSP (Language Server Protocol)
- Diagnostics pushed from server to client
- No polling - event-driven

### 3. Diagnostic Flow in VSCode

```
Language Server (tsserver, pyright, etc.)
    ↓ (LSP Protocol)
Diagnostic Events
    ↓
Markers Service (central registry)
    ↓
Problems Panel (subscribes to changes)
    ↓
UI Updates (real-time)
```

## What We Implemented (Matching VSCode)

### ✅ Already Matching VSCode:
1. **Multi-language support** - TypeScript, Python, Rust, Go, etc.
2. **WebSocket push** - No polling, event-driven
3. **Grouped by file** - ResourceMarkers pattern
4. **Severity levels** - error, warning, info, hint
5. **Click to navigate** - Jump to file:line:column

### 🔄 Can Improve (From VSCode):
1. **Filter/search** - VSCode has advanced filtering
2. **Quick fixes** - Code actions from language server
3. **Related information** - Show related errors
4. **Problem matchers** - Custom regex patterns for build output

## VSCode Language Servers Used

From `/tmp/vscode/extensions/`:

| Language   | Server                        | Package                          |
|------------|-------------------------------|----------------------------------|
| TypeScript | typescript-language-server    | Built-in                         |
| JavaScript | typescript-language-server    | Built-in                         |
| HTML       | vscode-html-languageserver    | Built-in                         |
| CSS        | vscode-css-languageserver     | Built-in                         |
| JSON       | vscode-json-languageserver    | Built-in                         |
| Python     | Pylance/Pyright               | Extension                        |
| Rust       | rust-analyzer                 | Extension                        |
| Go         | gopls                         | Extension                        |

## Implementation Status

### Backend (docker-backend/src/language-server.ts)
✅ Multi-language detection
✅ Auto-install language servers
✅ Diagnostic collection
✅ WebSocket push

### Frontend (recoder-web/app/)
✅ ProblemsPanel component (VSCode-like UI)
✅ useLSPDiagnostics hook (WebSocket connection)
✅ Error store (nanostores)
✅ CodeMirror diagnostics (red underlines)
✅ File badges (error counts)

## Next Steps (Optional VSCode Features)

1. **Add Quick Fixes**
   - Get code actions from language server
   - Show "Fix" button per error
   - Apply fixes automatically

2. **Add Filtering**
   - Filter by severity
   - Filter by file/folder
   - Search in messages

3. **Add Related Information**
   - Show related errors (e.g., "declared here")
   - Link between errors

4. **Add Problem Matchers**
   - Custom regex for build tools
   - Parse webpack, rollup, etc.

## VSCode Source Reference

Cloned to: `/tmp/vscode/`

Key paths:
- Problems panel: `src/vs/workbench/contrib/markers/`
- Language features: `extensions/typescript-language-features/`
- LSP client: `src/vs/workbench/api/common/extHostLanguageFeatures.ts`
