/**
 * ShikiCode React Hook
 *
 * A React hook for easily integrating ShikiCode into React components.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Highlighter } from 'shiki';

import type { EditorOptions, InitOptions, ShikiCode, UpdateOptions } from './core';
import { shikiCode } from './core';
import { createMinimalHighlighter, defaultTheme, getLanguageFromPath } from './highlighter';
import { autoload, defaultComments, hookClosingPairs, hookTab } from './plugins';

export interface UseShikiCodeOptions extends Partial<InitOptions> {
  /**
   * Initial value for the editor
   */
  value?: string;

  /**
   * Callback when the value changes
   */
  onChange?: (value: string) => void;

  /**
   * The language to use for syntax highlighting
   */
  language?: string;

  /**
   * The theme to use for syntax highlighting
   */
  theme?: string;

  /**
   * Whether to show line numbers
   */
  lineNumbers?: 'on' | 'off';

  /**
   * Whether the editor should be read-only
   */
  readOnly?: boolean;

  /**
   * Tab size for indentation
   */
  tabSize?: number;

  /**
   * Whether to use spaces instead of tabs
   */
  insertSpaces?: boolean;

  /**
   * File path to auto-detect language from extension
   */
  filePath?: string;

  /**
   * Custom highlighter instance (optional, will create one if not provided)
   */
  highlighter?: Highlighter;

  /**
   * Whether to enable auto-loading of languages/themes
   */
  autoloadEnabled?: boolean;

  /**
   * Whether to enable closing pairs plugin
   */
  closingPairsEnabled?: boolean;

  /**
   * Whether to enable tab handling plugin
   */
  tabHandlingEnabled?: boolean;

  /**
   * Whether to enable comments plugin
   */
  commentsEnabled?: boolean;
}

export interface UseShikiCodeReturn {
  /**
   * Ref to attach to the container element
   */
  containerRef: React.RefObject<HTMLDivElement>;

  /**
   * The ShikiCode editor instance
   */
  editor: ShikiCode | null;

  /**
   * Whether the editor is loading
   */
  isLoading: boolean;

  /**
   * Any error that occurred during initialization
   */
  error: Error | null;

  /**
   * Get the current value
   */
  getValue: () => string;

  /**
   * Set the value programmatically
   */
  setValue: (value: string) => void;

  /**
   * Update editor options
   */
  updateOptions: (options: UpdateOptions) => void;

  /**
   * Force a re-render of the syntax highlighting
   */
  forceRender: () => void;
}

/**
 * React hook for using ShikiCode editor
 *
 * @example
 * ```tsx
 * function CodeEditor() {
 *   const { containerRef, isLoading, error, getValue } = useShikiCode({
 *     value: 'const hello = "world";',
 *     language: 'typescript',
 *     theme: 'github-dark',
 *     onChange: (value) => console.log('Code changed:', value),
 *   });
 *
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <div style={{ position: 'relative', height: '400px' }}>
 *       {isLoading && <div>Loading editor...</div>}
 *       <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useShikiCode(options: UseShikiCodeOptions = {}): UseShikiCodeReturn {
  const {
    value = '',
    onChange,
    language,
    theme = defaultTheme,
    lineNumbers = 'on',
    readOnly = false,
    tabSize = 2,
    insertSpaces = true,
    filePath,
    highlighter: externalHighlighter,
    autoloadEnabled = true,
    closingPairsEnabled = true,
    tabHandlingEnabled = true,
    commentsEnabled = true,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ShikiCode | null>(null);
  const highlighterRef = useRef<Highlighter | null>(null);
  const valueRef = useRef(value);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [, forceUpdate] = useState({});

  // Determine the language
  const resolvedLanguage = language ?? (filePath ? getLanguageFromPath(filePath) : 'typescript');

  // Initialize the editor
  useEffect(() => {
    let mounted = true;
    let editor: ShikiCode | null = null;

    async function init() {
      if (!containerRef.current) return;

      try {
        // Get or create highlighter
        const highlighter = externalHighlighter ?? (await createMinimalHighlighter());

        if (!mounted) return;

        highlighterRef.current = highlighter;

        // Create the editor factory with plugins
        let factory = shikiCode().withOptions({
          lineNumbers,
          readOnly,
          tabSize,
          insertSpaces,
        });

        // Add plugins based on options
        const plugins = [];

        if (tabHandlingEnabled) {
          plugins.push(hookTab);
        }

        if (closingPairsEnabled) {
          plugins.push(hookClosingPairs());
        }

        if (commentsEnabled) {
          plugins.push(defaultComments());
        }

        if (autoloadEnabled) {
          plugins.push(autoload);
        }

        if (plugins.length > 0) {
          factory = factory.withPlugins(...plugins);
        }

        // Create the editor
        editor = factory.create(containerRef.current, highlighter, {
          language: resolvedLanguage,
          theme,
          value: valueRef.current,
        });

        editorRef.current = editor;

        // Set up change listener
        const handleInput = () => {
          const newValue = editor?.value ?? '';
          valueRef.current = newValue;
          onChange?.(newValue);
        };

        editor.input.addEventListener('input', handleInput);

        setIsLoading(false);
        forceUpdate({});
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (editor) {
        editor.dispose();
      }
    };
  }, [
    externalHighlighter,
    resolvedLanguage,
    theme,
    lineNumbers,
    readOnly,
    tabSize,
    insertSpaces,
    autoloadEnabled,
    closingPairsEnabled,
    tabHandlingEnabled,
    commentsEnabled,
  ]);

  // Update value when prop changes
  useEffect(() => {
    if (editorRef.current && value !== valueRef.current) {
      valueRef.current = value;
      editorRef.current.value = value;
    }
  }, [value]);

  // Memoized callbacks
  const getValue = useCallback(() => {
    return editorRef.current?.value ?? valueRef.current;
  }, []);

  const setValue = useCallback((newValue: string) => {
    valueRef.current = newValue;
    if (editorRef.current) {
      editorRef.current.value = newValue;
    }
  }, []);

  const updateOptions = useCallback((opts: UpdateOptions) => {
    editorRef.current?.updateOptions(opts);
  }, []);

  const forceRender = useCallback(() => {
    editorRef.current?.forceRender();
  }, []);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    editor: editorRef.current,
    isLoading,
    error,
    getValue,
    setValue,
    updateOptions,
    forceRender,
  };
}

/**
 * Options for the useHighlighter hook
 */
export interface UseHighlighterOptions {
  /**
   * Languages to preload
   */
  languages?: string[];

  /**
   * Themes to preload
   */
  themes?: string[];
}

/**
 * Hook to manage a Shiki highlighter instance
 *
 * @example
 * ```tsx
 * function App() {
 *   const { highlighter, isLoading, error } = useHighlighter({
 *     languages: ['typescript', 'javascript', 'json'],
 *     themes: ['github-dark', 'github-light'],
 *   });
 *
 *   if (isLoading) return <div>Loading syntax highlighter...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return <CodeEditor highlighter={highlighter} />;
 * }
 * ```
 */
export function useHighlighter(options: UseHighlighterOptions = {}) {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { createHighlighter } = await import('shiki');

        const hl = await createHighlighter({
          langs: (options.languages as any) ?? ['typescript', 'javascript', 'json', 'html', 'css'],
          themes: (options.themes as any) ?? [defaultTheme, 'github-light'],
        });

        if (mounted) {
          setHighlighter(hl);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [options.languages, options.themes]);

  return { highlighter, isLoading, error };
}
