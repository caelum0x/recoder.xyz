/**
 * 🚀 useWebContainer Hook
 *
 * React hook for managing WebContainer lifecycle
 * Adapted from bolt.new for Next.js
 */

import { useState, useEffect, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { getWebContainer, writeFiles, runCommand, startDevServer } from '@/lib/webcontainer';

interface UseWebContainerReturn {
  container: WebContainer | null;
  isBooting: boolean;
  isReady: boolean;
  error: Error | null;
  previewUrl: string | null;

  // File operations
  writeFiles: (files: Array<{ path: string; content: string }>) => Promise<void>;
  readFile: (path: string) => Promise<string>;

  // Command execution
  runCommand: (command: string, args?: string[]) => Promise<{ exitCode: number; output: string }>;

  // Dev server
  startDevServer: (command?: string, args?: string[]) => Promise<string>;
}

export function useWebContainer(): UseWebContainerReturn {
  const [container, setContainer] = useState<WebContainer | null>(null);
  const [isBooting, setIsBooting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Boot WebContainer on mount
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const boot = async () => {
      setIsBooting(true);
      setError(null);

      try {
        const wc = await getWebContainer();

        if (!cancelled && wc) {
          setContainer(wc);
          setIsReady(true);
          console.log('✅ WebContainer ready');
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Failed to boot WebContainer');
          setError(error);
          console.error('❌ WebContainer boot failed:', error);
        }
      } finally {
        if (!cancelled) {
          setIsBooting(false);
        }
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  // File operations wrapper
  const writeFilesCallback = useCallback(
    async (files: Array<{ path: string; content: string }>) => {
      if (!container) throw new Error('WebContainer not ready');
      return writeFiles(files);
    },
    [container]
  );

  const readFileCallback = useCallback(
    async (path: string) => {
      if (!container) throw new Error('WebContainer not ready');

      const { readFile } = await import('@/lib/webcontainer');
      return readFile(path);
    },
    [container]
  );

  // Command execution wrapper
  const runCommandCallback = useCallback(
    async (command: string, args: string[] = []) => {
      if (!container) throw new Error('WebContainer not ready');
      return runCommand(command, args);
    },
    [container]
  );

  // Dev server wrapper
  const startDevServerCallback = useCallback(
    async (command: string = 'npm', args: string[] = ['run', 'dev']) => {
      if (!container) throw new Error('WebContainer not ready');

      const url = await startDevServer(command, args);
      setPreviewUrl(url);
      return url;
    },
    [container]
  );

  return {
    container,
    isBooting,
    isReady,
    error,
    previewUrl,
    writeFiles: writeFilesCallback,
    readFile: readFileCallback,
    runCommand: runCommandCallback,
    startDevServer: startDevServerCallback,
  };
}

/**
 * 🔧 useTerminal Hook
 *
 * Hook for terminal integration with WebContainer
 */
export function useTerminal(container: WebContainer | null) {
  const [terminal, setTerminal] = useState<any>(null);

  useEffect(() => {
    if (!container || typeof window === 'undefined') return;

    // Dynamically import xterm (browser-only)
    import('@xterm/xterm').then(({ Terminal }) => {
      import('@xterm/addon-fit').then(({ FitAddon }) => {
        const term = new Terminal({
          cursorBlink: true,
          theme: {
            background: '#1a1a1a',
            foreground: '#e0e0e0',
          },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        setTerminal({ term, fitAddon });
      });
    });

    return () => {
      terminal?.term?.dispose();
    };
  }, [container]);

  const attachTerminal = useCallback(
    async (element: HTMLElement, command: string = 'jsh') => {
      if (!container || !terminal) return;

      const { term, fitAddon } = terminal;

      term.open(element);
      fitAddon.fit();

      const shellProcess = await container.spawn(command);

      shellProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            term.write(data);
          },
        })
      );

      const input = shellProcess.input.getWriter();

      term.onData((data) => {
        input.write(data);
      });

      return () => {
        input.close();
      };
    },
    [container, terminal]
  );

  return { terminal, attachTerminal };
}
