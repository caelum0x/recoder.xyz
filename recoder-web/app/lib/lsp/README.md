# LSP Client Documentation

Production-quality Language Server Protocol (LSP) integration for Recoder with Monaco/CodeMirror support.

## Features

- ✅ **Connection Management**: Automatic reconnection with exponential backoff
- ✅ **Request Debouncing**: Prevents flooding LSP servers with rapid requests
- ✅ **Request Cancellation**: Properly cancels outdated requests
- ✅ **Diagnostics Support**: Real-time error/warning markers with gutter icons
- ✅ **All LSP Features**: Completions, hover, go-to-definition, references, signatures
- ✅ **TypeScript Types**: Complete type definitions for LSP protocol
- ✅ **Event-Driven**: Listen to connection state, diagnostics, and errors

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌────────────────────────┐   │
│  │  CodeMirror      │         │   React Hooks          │   │
│  │  Extensions      │◄────────┤   (useLSP)             │   │
│  └────────┬─────────┘         └───────────┬────────────┘   │
│           │                               │                 │
│           └───────────┬───────────────────┘                 │
│                       ▼                                     │
│           ┌──────────────────────┐                          │
│           │  Enhanced LSP Client │                          │
│           │  - Debouncing        │                          │
│           │  - Reconnection      │                          │
│           │  - Diagnostics       │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │ HTTP/REST API
┌──────────────────────┼──────────────────────────────────────┐
│                      ▼                                       │
│           ┌──────────────────────┐                          │
│           │   Docker Backend     │                          │
│           │   LSP Server Manager │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│              ┌───────┴────────┐                             │
│              ▼                ▼                              │
│     ┌──────────────┐  ┌──────────────┐                     │
│     │ TypeScript   │  │  Python      │                     │
│     │ Language     │  │  Language    │  ... (Go, Rust)     │
│     │ Server       │  │  Server      │                     │
│     └──────────────┘  └──────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Using Enhanced Client (Recommended)

```typescript
import { getEnhancedLSPClient } from '~/lib/lsp';

const client = getEnhancedLSPClient('project-id', {
  verbose: true,
  reconnectDelay: 2000,
  maxReconnectAttempts: 5,
});

// Connect (auto-reconnects on failure)
await client.connect();

// Listen for diagnostics
client.onDiagnostics((uri, diagnostics) => {
  console.log('Diagnostics:', diagnostics);
});

// Listen for connection state
client.on('connection-state-changed', (state) => {
  console.log('Connection state:', state);
});

// Use LSP features
const completions = await client.getCompletions(
  'src/app.ts',
  { line: 10, character: 5 },
  fileContent
);

const hover = await client.getHover(
  'src/app.ts',
  { line: 10, character: 5 },
  fileContent
);
```

### 2. Using React Hooks

```tsx
import { useLSP, useFileLSP } from '~/lib/lsp';

function Editor({ projectId, filePath, content }) {
  // Project-level hook
  const lsp = useLSP(projectId, {
    autoStart: true,
    onReady: () => console.log('LSP ready'),
    onError: (error) => console.error('LSP error:', error),
  });

  // File-level hook (simpler API)
  const fileLsp = useFileLSP(projectId, filePath, content, {
    autoSync: true,
    syncDebounce: 500,
  });

  const handleHover = async (line: number, char: number) => {
    const hover = await fileLsp.hover(line, char);
    // Display hover info
  };

  return (
    <div>
      {lsp.isReady && <div>LSP Connected</div>}
      {lsp.error && <div>Error: {lsp.error.message}</div>}
    </div>
  );
}
```

### 3. Using CodeMirror Extensions

```typescript
import { lspExtension, lspCompletions, lspDiagnostics } from '~/lib/lsp';
import { EditorView } from '@codemirror/view';

const extensions = [
  // All-in-one extension
  lspExtension(projectId, filePath, {
    enableHover: true,
    enableDefinition: true,
    enableReferences: true,
    enableDiagnostics: true,
    useEnhancedClient: true, // Use production client
    onGotoDefinition: (file, line, char) => {
      // Navigate to definition
    },
    onReferencesFound: (locations) => {
      // Show references panel
    },
  }),

  // Or individual extensions
  lspCompletions(projectId, filePath),
  lspDiagnostics(projectId, filePath),
];

const view = new EditorView({
  extensions,
  parent: document.body,
});
```

## API Reference

### EnhancedLSPClient

#### Configuration

```typescript
interface LSPClientConfig {
  reconnectDelay: number;        // Default: 2000ms
  maxReconnectAttempts: number;  // Default: 5
  requestTimeout: number;        // Default: 10000ms
  completionDebounce: number;    // Default: 150ms
  hoverDebounce: number;         // Default: 300ms
  syncDebounce: number;          // Default: 500ms
  verbose: boolean;              // Default: false
}
```

#### Methods

```typescript
// Connection
await client.connect(): Promise<boolean>
await client.disconnect(): Promise<void>
await client.reconnect(): Promise<void>
client.getConnectionStatus(): LSPConnectionStatus
client.isReady(): boolean

// Document sync
await client.syncDocument(path, content, langId?): Promise<boolean>
await client.closeDocument(path): Promise<void>

// LSP Operations
await client.getCompletions(path, pos, content, trigger?): Promise<LSPCompletionItem[]>
await client.getHover(path, pos, content): Promise<LSPHover | null>
await client.getDefinition(path, pos, content): Promise<LSPLocation[]>
await client.getReferences(path, pos, content, includeDecl?): Promise<LSPLocation[]>
await client.getSignatureHelp(path, pos, content): Promise<LSPSignatureHelp | null>
await client.getDocumentSymbols(path, content): Promise<LSPDocumentSymbol[]>

// Diagnostics
client.getDiagnostics(path): LSPDiagnostic[]
client.getAllDiagnostics(): Map<string, LSPDiagnostic[]>
client.onDiagnostics(listener): () => void

// Server status
await client.getStatus(): Promise<LSPServerStatus[]>
await client.stop(): Promise<void>
```

#### Events

```typescript
client.on('connected', () => {})
client.on('disconnected', (reason) => {})
client.on('reconnecting', (attempt) => {})
client.on('reconnected', () => {})
client.on('reconnect-failed', () => {})
client.on('connection-state-changed', (state) => {})
client.on('error', (error) => {})
client.on('diagnostics', (uri, diagnostics) => {})
```

## Supported Languages

- **TypeScript/JavaScript**: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`
- **Python**: `.py`, `.pyi`
- **Go**: `.go`, `.mod`, `.sum`
- **Rust**: `.rs`

## Best Practices

### 1. Always Use Enhanced Client for New Code

The `EnhancedLSPClient` provides production-ready features:
- Automatic reconnection
- Request debouncing
- Proper error handling
- Diagnostics support

```typescript
// ✅ Good
import { getEnhancedLSPClient } from '~/lib/lsp';
const client = getEnhancedLSPClient(projectId);

// ❌ Avoid for new code
import { getLSPClient } from '~/lib/lsp';
const client = getLSPClient(projectId);
```

### 2. Listen to Connection State

```typescript
client.on('connection-state-changed', (state) => {
  switch (state) {
    case 'connected':
      // Enable LSP features
      break;
    case 'reconnecting':
      // Show reconnecting indicator
      break;
    case 'failed':
      // Show error message
      break;
  }
});
```

### 3. Handle Diagnostics

```typescript
const unsubscribe = client.onDiagnostics((uri, diagnostics) => {
  // Update UI with diagnostics
  const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
  const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

  console.log(`${errors.length} errors, ${warnings.length} warnings`);
});

// Clean up when done
unsubscribe();
```

### 4. Sync Documents Properly

```typescript
// Sync when opening file
await client.syncDocument(filePath, content);

// Sync on content changes (debounced automatically)
editor.on('change', async (newContent) => {
  await client.syncDocument(filePath, newContent);
});

// Close when done
await client.closeDocument(filePath);
```

### 5. Clean Up Resources

```typescript
import { disposeEnhancedLSPClient } from '~/lib/lsp';

// When project is closed
await disposeEnhancedLSPClient(projectId);

// Or dispose all clients
await disposeAllEnhancedLSPClients();
```

## Troubleshooting

### LSP not connecting

1. Check if Docker backend is running
2. Verify project ID is correct
3. Enable verbose logging:
   ```typescript
   const client = getEnhancedLSPClient(projectId, { verbose: true });
   ```

### Completions not showing

1. Ensure document is synced: `await client.syncDocument(path, content)`
2. Check file extension is supported
3. Verify LSP server is running: `await client.getStatus()`

### Diagnostics not appearing

1. Use enhanced client: `useEnhancedClient: true`
2. Enable diagnostics extension: `lspDiagnostics(projectId, filePath)`
3. Listen to diagnostic events: `client.onDiagnostics(listener)`

### Frequent reconnections

1. Check network stability
2. Verify backend health
3. Increase reconnect delay:
   ```typescript
   const client = getEnhancedLSPClient(projectId, {
     reconnectDelay: 5000,
     maxReconnectAttempts: 10,
   });
   ```

## Migration Guide

### From Standard Client to Enhanced Client

```typescript
// Before
import { getLSPClient } from '~/lib/lsp';
const client = getLSPClient(projectId);
await client.initialize();

// After
import { getEnhancedLSPClient } from '~/lib/lsp';
const client = getEnhancedLSPClient(projectId);
await client.connect();

// Listen for diagnostics (new feature)
client.onDiagnostics((uri, diagnostics) => {
  // Handle diagnostics
});
```

### Adding Diagnostics to Existing Code

```typescript
// Add to your CodeMirror extensions
import { lspDiagnostics } from '~/lib/lsp';

const extensions = [
  // ... existing extensions
  lspDiagnostics(projectId, filePath),
];
```

## Performance Tips

1. **Debouncing**: Already built-in, configurable per operation type
2. **Request Cancellation**: Automatic when new requests supersede old ones
3. **Connection Pooling**: Singleton pattern ensures one client per project
4. **Document Caching**: Documents are cached and only synced when content changes

## Contributing

When adding new LSP features:

1. Add types to `types.ts`
2. Implement in `enhanced-lsp-client.ts`
3. Add CodeMirror extension if needed
4. Update this README
5. Add tests

## License

Part of Recoder project.
