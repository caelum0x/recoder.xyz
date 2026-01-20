/**
 * LSP Module - Language Server Protocol integration for Recoder
 *
 * This module provides frontend integration with the TCP-based LSP backend.
 *
 * Usage:
 *
 * 1. Using the hook (recommended for React components):
 *    ```tsx
 *    import { useLSP, useFileLSP } from '~/lib/lsp';
 *
 *    function MyEditor({ projectId, filePath, content }) {
 *      const lsp = useLSP(projectId);
 *
 *      // Or use the file-specific hook
 *      const fileLsp = useFileLSP(projectId, filePath, content);
 *
 *      const handleHover = async (line, char) => {
 *        const hover = await fileLsp.hover(line, char);
 *        // Display hover info
 *      };
 *    }
 *    ```
 *
 * 2. Using the enhanced client (production-ready with reconnection):
 *    ```ts
 *    import { getEnhancedLSPClient } from '~/lib/lsp';
 *
 *    const client = getEnhancedLSPClient(projectId);
 *    await client.connect();
 *
 *    // Listen for diagnostics
 *    client.onDiagnostics((uri, diagnostics) => {
 *      console.log('Diagnostics for', uri, diagnostics);
 *    });
 *
 *    const hover = await client.getHover(filePath, { line: 0, character: 5 }, content);
 *    ```
 *
 * 3. Using CodeMirror extensions:
 *    ```ts
 *    import { lspCompletionSource, lspDiagnostics } from '~/lib/lsp';
 *    import { autocompletion } from '@codemirror/autocomplete';
 *
 *    const extensions = [
 *      autocompletion({
 *        override: [lspCompletionSource(projectId, filePath)],
 *      }),
 *      lspDiagnostics(projectId, filePath),
 *    ];
 *    ```
 *
 * Supported Languages:
 * - TypeScript/JavaScript (.ts, .tsx, .js, .jsx, .mjs, .cjs)
 * - Python (.py, .pyi)
 * - Go (.go, .mod, .sum)
 * - Rust (.rs)
 */

// ============================================
// Type Exports
// ============================================

export type {
  LSPPosition,
  LSPRange,
  LSPLocation,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPCompletionList,
  LSPHover,
  LSPHoverContents,
  LSPSignatureHelp,
  LSPServerStatus,
  LSPConnectionState,
  LSPConnectionStatus,
  LSPDocumentSymbol,
  LSPMarkupContent,
  LSPTextEdit,
  CompletionTriggerKind,
  DiagnosticTag,
  SymbolKind,
} from './types';

export { DiagnosticSeverity, CompletionItemKind, InsertTextFormat } from './types';

// ============================================
// Standard Client Exports
// ============================================

export {
  LSPClient,
  getLSPClient,
  disposeLSPClient,
  disposeAllLSPClients,
} from './lsp-client';

// ============================================
// Enhanced Client Exports (Recommended)
// ============================================

export {
  EnhancedLSPClient,
  getEnhancedLSPClient,
  disposeEnhancedLSPClient,
  disposeAllEnhancedLSPClients,
} from './enhanced-lsp-client';

// ============================================
// Hook Exports
// ============================================

export {
  useLSP,
  useFileLSP,
  type UseLSPOptions,
  type UseLSPResult,
  type UseFileLSPOptions,
  type UseFileLSPResult,
} from '~/lib/hooks/useLSP';

// ============================================
// Completion Exports
// ============================================

export {
  createLSPCompletionSource,
  lspCompletionSource,
  getSignatureHelpAtPosition,
  getDocumentSymbols,
  type LSPCompletionOptions,
  type SignatureHelpResult,
  type DocumentSymbol,
} from './completions';

// ============================================
// Diagnostics Exports
// ============================================

export { lspDiagnostics, setDiagnostics } from './diagnostics-extension';
