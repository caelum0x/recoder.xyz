/**
 * useDaytonaLSP - React hook for Daytona-backed LSP integration
 *
 * Provides code completions, document symbols, and hover info for files
 * running inside a Daytona sandbox. Used by the code editor (CodeMirror/Monaco)
 * to power IntelliSense-style features.
 *
 * Architecture:
 * - All LSP calls go through docker-backend at /api/daytona/lsp/:sandboxId/*
 * - The docker-backend proxies to the Daytona toolbox LSP API at port 3900
 * - The sandboxId is the Daytona sandbox ID (same as projectId for Daytona projects)
 *
 * Usage:
 * ```tsx
 * const lsp = useDaytonaLSP(sandboxId);
 *
 * // Start LSP for a language
 * await lsp.start('typescript', '/home/daytona');
 *
 * // Notify LSP a file is open
 * await lsp.didOpen('file:///home/daytona/src/App.tsx');
 *
 * // Get completions at cursor
 * const { items } = await lsp.completions('file:///home/daytona/src/App.tsx', { line: 10, character: 5 });
 *
 * // Get symbols in document
 * const { symbols } = await lsp.documentSymbols('file:///home/daytona/src/App.tsx');
 * ```
 *
 * For CodeMirror integration, use `createDaytonaCompletionSource` instead.
 */

import { useCallback, useRef, useState } from 'react';
import { dockerGet, dockerPost } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DaytonaLSP');

// ── Types ─────────────────────────────────────────────────────────

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspSymbol {
  name: string;
  /** LSP SymbolKind: 1=File, 2=Module, 5=Class, 6=Method, 12=Function, 13=Variable, 14=Constant */
  kind: number;
  location: {
    uri: string;
    range: LspRange;
  };
}

export interface LspCompletionItem {
  label: string;
  /** LSP CompletionItemKind: 1=Text, 2=Method, 3=Function, 6=Variable, 7=Class, etc. */
  kind?: number;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
}

export interface LspCompletionsResult {
  ok: boolean;
  isIncomplete: boolean;
  items: LspCompletionItem[];
  warning?: string;
}

export interface LspSymbolsResult {
  ok: boolean;
  symbols: LspSymbol[];
  warning?: string;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Convert a local file path to an LSP URI. */
export function pathToUri(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath;
  return `file://${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
}

/** Detect LSP language ID from file extension. */
export function detectLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    pyi: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
  };
  return map[ext] || 'typescript';
}

// ── Hook ──────────────────────────────────────────────────────────

export interface UseDaytonaLSPResult {
  /** Whether an LSP server is currently running for this sandbox */
  isStarted: boolean;
  /** Whether LSP is being initialized */
  isStarting: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Start an LSP server for a language in the sandbox */
  start: (languageId?: string, pathToProject?: string) => Promise<boolean>;
  /** Stop the LSP server */
  stop: (languageId?: string, pathToProject?: string) => Promise<void>;
  /** Notify LSP that a file was opened (required before completions work) */
  didOpen: (uri: string, languageId?: string, pathToProject?: string) => Promise<void>;
  /** Notify LSP that a file was closed */
  didClose: (uri: string, languageId?: string, pathToProject?: string) => Promise<void>;
  /** Get code completions at a position */
  completions: (uri: string, position: LspPosition, languageId?: string, pathToProject?: string) => Promise<LspCompletionsResult>;
  /** Get document symbols (functions, classes, variables) */
  documentSymbols: (uri: string, languageId?: string, pathToProject?: string) => Promise<LspSymbolsResult>;
  /** Get workspace symbols matching a query */
  workspaceSymbols: (query: string, languageId?: string, pathToProject?: string) => Promise<LspSymbolsResult>;
}

/**
 * Hook for Daytona LSP integration.
 *
 * @param sandboxId - Daytona sandbox ID (same as projectId for Daytona projects)
 * @param defaultLanguageId - Default language (default: 'typescript')
 * @param defaultPathToProject - Default project root path (default: '/home/daytona')
 */
export function useDaytonaLSP(
  sandboxId: string | null | undefined,
  defaultLanguageId = 'typescript',
  defaultPathToProject = '/home/daytona',
): UseDaytonaLSPResult {
  const [isStarted, setIsStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track open files to avoid redundant did-open calls
  const openFilesRef = useRef<Set<string>>(new Set());

  const start = useCallback(
    async (languageId = defaultLanguageId, pathToProject = defaultPathToProject): Promise<boolean> => {
      if (!sandboxId) return false;
      if (isStarted) return true;

      setIsStarting(true);
      setError(null);

      try {
        await dockerPost(`/api/daytona/lsp/${encodeURIComponent(sandboxId)}/start`, {
          languageId,
          pathToProject,
        });
        setIsStarted(true);
        logger.info(`LSP started for ${sandboxId} (${languageId})`);
        return true;
      } catch (err) {
        const e = err as Error;
        setError(e);
        logger.error(`LSP start failed for ${sandboxId}:`, e.message);
        return false;
      } finally {
        setIsStarting(false);
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject, isStarted],
  );

  const stop = useCallback(
    async (languageId = defaultLanguageId, pathToProject = defaultPathToProject): Promise<void> => {
      if (!sandboxId) return;

      try {
        await dockerPost(`/api/daytona/lsp/${encodeURIComponent(sandboxId)}/stop`, {
          languageId,
          pathToProject,
        });
        setIsStarted(false);
        openFilesRef.current.clear();
      } catch (err) {
        logger.warn(`LSP stop failed for ${sandboxId}:`, (err as Error).message);
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  const didOpen = useCallback(
    async (uri: string, languageId = defaultLanguageId, pathToProject = defaultPathToProject): Promise<void> => {
      if (!sandboxId) return;
      if (openFilesRef.current.has(uri)) return; // Already open

      try {
        await dockerPost(`/api/daytona/lsp/${encodeURIComponent(sandboxId)}/did-open`, {
          languageId,
          pathToProject,
          uri,
        });
        openFilesRef.current.add(uri);
      } catch (err) {
        logger.warn(`LSP did-open failed for ${uri}:`, (err as Error).message);
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  const didClose = useCallback(
    async (uri: string, languageId = defaultLanguageId, pathToProject = defaultPathToProject): Promise<void> => {
      if (!sandboxId) return;

      try {
        await dockerPost(`/api/daytona/lsp/${encodeURIComponent(sandboxId)}/did-close`, {
          languageId,
          pathToProject,
          uri,
        });
        openFilesRef.current.delete(uri);
      } catch (err) {
        logger.warn(`LSP did-close failed for ${uri}:`, (err as Error).message);
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  const completions = useCallback(
    async (
      uri: string,
      position: LspPosition,
      languageId = defaultLanguageId,
      pathToProject = defaultPathToProject,
    ): Promise<LspCompletionsResult> => {
      if (!sandboxId) return { ok: false, isIncomplete: false, items: [] };

      try {
        const resp = await dockerPost<LspCompletionsResult>(
          `/api/daytona/lsp/${encodeURIComponent(sandboxId)}/completions`,
          { languageId, pathToProject, uri, position },
          { timeout: 8000, skipRetry: true },
        );
        return resp ?? { ok: false, isIncomplete: false, items: [] };
      } catch (err) {
        logger.warn(`LSP completions failed for ${uri}:`, (err as Error).message);
        return { ok: false, isIncomplete: false, items: [], warning: (err as Error).message };
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  const documentSymbols = useCallback(
    async (
      uri: string,
      languageId = defaultLanguageId,
      pathToProject = defaultPathToProject,
    ): Promise<LspSymbolsResult> => {
      if (!sandboxId) return { ok: false, symbols: [] };

      try {
        const params = new URLSearchParams({ languageId, pathToProject, uri }).toString();
        const resp = await dockerGet<LspSymbolsResult>(
          `/api/daytona/lsp/${encodeURIComponent(sandboxId)}/document-symbols?${params}`,
          { timeout: 8000 },
        );
        return resp ?? { ok: false, symbols: [] };
      } catch (err) {
        logger.warn(`LSP document-symbols failed for ${uri}:`, (err as Error).message);
        return { ok: false, symbols: [], warning: (err as Error).message };
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  const workspaceSymbols = useCallback(
    async (
      query: string,
      languageId = defaultLanguageId,
      pathToProject = defaultPathToProject,
    ): Promise<LspSymbolsResult> => {
      if (!sandboxId) return { ok: false, symbols: [] };

      try {
        const params = new URLSearchParams({ languageId, pathToProject, query }).toString();
        const resp = await dockerGet<LspSymbolsResult>(
          `/api/daytona/lsp/${encodeURIComponent(sandboxId)}/workspace-symbols?${params}`,
          { timeout: 8000 },
        );
        return resp ?? { ok: false, symbols: [] };
      } catch (err) {
        // workspace-symbols is not supported in all sandbox images — silently return empty
        return { ok: true, symbols: [] };
      }
    },
    [sandboxId, defaultLanguageId, defaultPathToProject],
  );

  return {
    isStarted,
    isStarting,
    error,
    start,
    stop,
    didOpen,
    didClose,
    completions,
    documentSymbols,
    workspaceSymbols,
  };
}

// ── CodeMirror completion source ──────────────────────────────────

/**
 * Context type for CodeMirror completion source.
 * Matches the CompletionContext interface from @codemirror/autocomplete.
 */
interface CodeMirrorCompletionContext {
  pos: number;
  state: {
    doc: {
      lineAt: (pos: number) => { number: number; from: number };
    };
  };
}

/**
 * Create a CodeMirror autocompletion source backed by Daytona LSP.
 *
 * Usage with @codemirror/autocomplete:
 * ```ts
 * import { autocompletion } from '@codemirror/autocomplete';
 * import { createDaytonaCompletionSource } from '~/lib/hooks/useDaytonaLSP';
 *
 * const extensions = [
 *   autocompletion({
 *     override: [createDaytonaCompletionSource(sandboxId, filePath)],
 *   }),
 * ];
 * ```
 */
export function createDaytonaCompletionSource(
  sandboxId: string,
  filePath: string,
  pathToProject = '/home/daytona',
) {
  const languageId = detectLanguageId(filePath);
  const uri = pathToUri(filePath);

  return async (context: CodeMirrorCompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    // LSP uses 0-based line/character; CodeMirror lines are 1-based
    const lineNumber = line.number - 1;
    const character = context.pos - line.from;

    try {
      const resp = await fetch(
        `/api/daytona/lsp/${encodeURIComponent(sandboxId)}/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageId,
            pathToProject,
            uri,
            position: { line: lineNumber, character },
          }),
        },
      );

      if (!resp.ok) return null;

      const data: LspCompletionsResult = await resp.json();
      if (!data.ok || !data.items.length) return null;

      return {
        from: context.pos,
        options: data.items.map((item) => ({
          label: item.label,
          type: lspKindToCmType(item.kind),
          detail: item.detail,
          info: item.documentation,
          apply: item.insertText || item.label,
          boost: item.sortText ? -item.sortText.charCodeAt(0) : 0,
        })),
        validFor: /^\w*$/,
      };
    } catch {
      return null;
    }
  };
}

/**
 * Map LSP CompletionItemKind to CodeMirror completion type.
 */
function lspKindToCmType(kind?: number): string {
  switch (kind) {
    case 1: return 'text';
    case 2: return 'method';
    case 3: return 'function';
    case 4: return 'constructor';
    case 5: return 'field';
    case 6: return 'variable';
    case 7: return 'class';
    case 8: return 'interface';
    case 9: return 'module';
    case 10: return 'property';
    case 12: return 'function';
    case 13: return 'keyword';
    case 14: return 'keyword';
    case 15: return 'snippet';
    case 17: return 'file';
    case 18: return 'function';
    default: return 'text';
  }
}
