/**
 * Combined Completions for CodeMirror
 * Integrates multiple completion sources: LSP, snippets, imports
 */

import { autocompletion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { snippetCompletionSource } from './snippets';
import { importCompletionSource } from './import-completions';
import { lspCompletionSource as lspSource } from './lsp-extensions';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('CombinedCompletions');

// ============================================
// Combined Completion Source
// ============================================

export interface CombinedCompletionsOptions {
  /** Enable snippet completions (React hooks, components, etc.) */
  enableSnippets?: boolean;
  /** Enable import completions (common imports like useState, etc.) */
  enableImportCompletions?: boolean;
  /** Enable LSP completions (requires projectId) */
  enableLSP?: boolean;
  /** Project ID for LSP features */
  projectId?: string;
  /** Maximum completions to show */
  maxCompletions?: number;
}

/**
 * Create a combined completion source that merges multiple sources
 */
export function createCombinedCompletionSource(
  filePath: string,
  options: CombinedCompletionsOptions = {}
): CompletionSource {
  const {
    enableSnippets = true,
    enableImportCompletions = true,
    enableLSP = true,
    projectId,
    maxCompletions = 50,
  } = options;

  // Build array of completion sources
  const sources: Array<(context: CompletionContext) => Promise<CompletionResult | null> | CompletionResult | null> = [];

  // Add snippet completions
  if (enableSnippets) {
    sources.push(snippetCompletionSource(filePath));
  }

  // Add import completions
  if (enableImportCompletions) {
    sources.push(importCompletionSource(filePath));
  }

  // Add LSP completions if project ID is available
  if (enableLSP && projectId) {
    sources.push(lspSource(projectId, filePath));
  }

  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Get completions from all sources in parallel
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const result = source(context);
          return result instanceof Promise ? await result : result;
        } catch (err) {
          logger.warn('[Completions] Source error:', err);
          return null;
        }
      })
    );

    // Filter out null results
    const validResults = results.filter((r): r is CompletionResult => r !== null);

    if (validResults.length === 0) {
      return null;
    }

    // Merge all completions
    const allOptions = validResults.flatMap((r) => r.options);

    // Sort by boost (higher is better), then alphabetically
    allOptions.sort((a, b) => {
      const boostA = (a.boost ?? 0);
      const boostB = (b.boost ?? 0);
      if (boostA !== boostB) {
        return boostB - boostA;
      }
      return a.label.localeCompare(b.label);
    });

    // Limit results
    const limitedOptions = allOptions.slice(0, maxCompletions);

    // Use the smallest 'from' position (earliest match)
    const from = Math.min(...validResults.map((r) => r.from));

    return {
      from,
      options: limitedOptions,
      validFor: /^[\w.]*$/,
    };
  };
}

/**
 * Create a CodeMirror autocompletion extension with combined completions
 */
export function combinedCompletions(
  filePath: string,
  options: CombinedCompletionsOptions = {}
): Extension {
  return autocompletion({
    override: [createCombinedCompletionSource(filePath, options)],
    defaultKeymap: true,
    closeOnBlur: false,
    maxRenderedOptions: 50,
    icons: true,
    optionClass: (completion) => {
      // Add custom classes based on completion type for styling
      const type = completion.type || 'text';
      return `cm-completion-${type}`;
    },
  });
}

/**
 * Create a completion sources array for use with autocompletion({ override: [...] })
 * This is useful when you want to add these sources to existing autocompletion config
 */
export function getCompletionSources(
  filePath: string,
  options: CombinedCompletionsOptions = {}
): CompletionSource[] {
  const {
    enableSnippets = true,
    enableImportCompletions = true,
    enableLSP = true,
    projectId,
  } = options;

  const sources: CompletionSource[] = [];

  if (enableSnippets) {
    sources.push(snippetCompletionSource(filePath));
  }

  if (enableImportCompletions) {
    sources.push(importCompletionSource(filePath));
  }

  if (enableLSP && projectId) {
    sources.push(lspSource(projectId, filePath));
  }

  return sources;
}

export default combinedCompletions;
