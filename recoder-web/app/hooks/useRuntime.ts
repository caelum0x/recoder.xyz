/**
 * useRuntime Hook
 * Provides unified access to WebContainer or Docker runtime
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import type { WebContainer } from '@webcontainer/api';
import { appendDockerAuthQuery, dockerFetch, dockerPost, dockerGet, DOCKER_URL } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RuntimeHook');

export type RuntimeMode = 'webcontainer' | 'docker';

interface RuntimeState {
  mode: RuntimeMode;
  ready: boolean;
  error: string | null;
}

interface ApiResponse {
  content?: string;
  output?: string;
  error?: string;
}

export function useRuntime(projectId: string) {
  const [state, setState] = useState<RuntimeState>({
    mode: DOCKER_URL ? 'docker' : 'webcontainer',
    ready: false,
    error: null,
  });

  const wcRef = useRef<WebContainer | null>(null);
  const terminalWsRef = useRef<WebSocket | null>(null);

  // Initialize runtime
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (DOCKER_URL) {
          // dockerFetch returns parsed JSON, not a Response object
          const health = await dockerFetch<{ status?: string }>('/health', {
            timeout: 3000,
            skipRetry: true,
          }).catch(() => null);

          if (health && (health.status === 'ok' || health.status === 'healthy')) {
            // Use centralized container creation to avoid duplicates
            const { ensureContainerExists } = await import('~/lib/stores/workbench');
            const containerReady = await ensureContainerExists(projectId);
            if (containerReady && !cancelled) {
              setState({ mode: 'docker', ready: true, error: null });
              logger.info('🐳 Docker runtime ready');
              return;
            }
          }
        }

        wcRef.current = await webcontainer;
        if (!cancelled) {
          setState({ mode: 'webcontainer', ready: true, error: null });
          logger.info('📦 WebContainer runtime ready');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setState((s) => ({ ...s, ready: false, error: message }));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      terminalWsRef.current?.close();
    };
  }, [projectId]);

  // Write file
  const writeFile = useCallback(
    async (path: string, content: string) => {
      if (state.mode === 'docker' && DOCKER_URL) {
        await dockerPost(`/api/file/${projectId}`, { path: `/workspace${path}`, content });
      } else if (wcRef.current) {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) await wcRef.current.fs.mkdir(dir, { recursive: true });
        await wcRef.current.fs.writeFile(path, content);
      }
    },
    [state.mode, projectId]
  );

  // Read file
  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (state.mode === 'docker' && DOCKER_URL) {
        const data = await dockerGet<ApiResponse>(`/api/file/${projectId}?path=/workspace${path}`);
        return data.content || '';
      } else if (wcRef.current) {
        return await wcRef.current.fs.readFile(path, 'utf-8');
      }
      throw new Error('Runtime not ready');
    },
    [state.mode, projectId]
  );

  // Execute command
  const exec = useCallback(
    async (command: string, cwd: string = '/'): Promise<string> => {
      if (state.mode === 'docker' && DOCKER_URL) {
        const data = await dockerPost<ApiResponse>(`/api/exec/${projectId}`, { command, cwd: `/workspace${cwd}` });
        return data.output || '';
      } else if (wcRef.current) {
        const [cmd, ...args] = command.split(' ');
        const process = await wcRef.current.spawn(cmd, args, { cwd });
        let output = '';
        await process.output.pipeTo(new WritableStream({ write(chunk) { output += chunk; } }));
        await process.exit;
        return output;
      }
      throw new Error('Runtime not ready');
    },
    [state.mode, projectId]
  );

  // Spawn process
  const spawn = useCallback(
    async (command: string, args: string[], cwd?: string) => {
      if (state.mode === 'docker' && DOCKER_URL) {
        const output = await exec(`${command} ${args.join(' ')}`, cwd);
        return {
          output: new ReadableStream({
            start(controller) {
              controller.enqueue(output);
              controller.close();
            },
          }),
          exit: Promise.resolve(0),
        };
      } else if (wcRef.current) {
        return await wcRef.current.spawn(command, args, { cwd });
      }
      throw new Error('Runtime not ready');
    },
    [state.mode, projectId, exec]
  );

  // Connect terminal
  const connectTerminal = useCallback(
    (onData: (data: string) => void) => {
      if (state.mode === 'docker' && DOCKER_URL) {
        const wsUrl = DOCKER_URL.replace('http', 'ws');
        terminalWsRef.current = new WebSocket(
          appendDockerAuthQuery(`${wsUrl}/terminal/${projectId}`)
        );
        terminalWsRef.current.onmessage = (e) => onData(e.data);

        return {
          write: (data: string) => terminalWsRef.current?.send(data),
          close: () => terminalWsRef.current?.close(),
        };
      }
      return { write: () => {}, close: () => {} };
    },
    [state.mode, projectId]
  );

  // Get preview URL — use same-origin proxy to avoid cross-origin iframe issues
  const getPreviewUrl = useCallback(() => {
    if (state.mode === 'docker' && DOCKER_URL) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `${origin}/preview/${projectId}`;
    }
    return null;
  }, [state.mode, projectId]);

  // Get WebContainer instance
  const getWebContainer = useCallback(async () => {
    if (wcRef.current) return wcRef.current;
    return await webcontainer;
  }, []);

  return {
    ...state,
    writeFile,
    readFile,
    exec,
    spawn,
    connectTerminal,
    getPreviewUrl,
    getWebContainer,
    isDocker: state.mode === 'docker',
  };
}
