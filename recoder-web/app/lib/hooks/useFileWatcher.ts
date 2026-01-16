/**
 * useFileWatcher - Listens for file changes from CLI tools (claude, recoder-code)
 * Auto-refreshes preview and updates file tree when changes detected
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';

interface FileChange {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

interface UseFileWatcherOptions {
  onFileChange?: (changes: FileChange[]) => void;
  onPreviewRefresh?: () => void;
  enabled?: boolean;
}

export function useFileWatcher(options: UseFileWatcherOptions = {}) {
  const { onFileChange, onPreviewRefresh, enabled = true } = options;
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!projectId || !containerReady || !enabled) return;

    const wsUrl = DOCKER_URL.replace('http', 'ws');
    const ws = new WebSocket(`${wsUrl}/watch/${projectId}`);

    ws.onopen = () => {
      console.log('[FileWatcher] Connected to file watch stream');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'file-changes' && data.changes?.length > 0) {
          console.log(`[FileWatcher] ${data.changes.length} file changes detected:`, 
            data.changes.map((c: FileChange) => `${c.type}: ${c.path}`).join(', ')
          );

          // Notify callback
          onFileChange?.(data.changes);

          // Auto-refresh preview for code file changes
          const codeExtensions = ['.tsx', '.ts', '.jsx', '.js', '.css', '.html', '.json', '.vue', '.svelte'];
          const hasCodeChange = data.changes.some((c: FileChange) => 
            codeExtensions.some(ext => c.path.endsWith(ext))
          );

          if (hasCodeChange) {
            console.log('[FileWatcher] Code file changed, triggering preview refresh');
            onPreviewRefresh?.();
            
            // Dispatch event for preview component
            window.dispatchEvent(new CustomEvent('recoder:file-changed', {
              detail: { changes: data.changes }
            }));
          }

          // Dispatch event for file tree refresh
          window.dispatchEvent(new CustomEvent('recoder:refresh-files', {
            detail: { changes: data.changes }
          }));
        }
      } catch (e) {
        console.warn('[FileWatcher] Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      console.warn('[FileWatcher] Connection error');
    };

    ws.onclose = () => {
      console.log('[FileWatcher] Disconnected');
      wsRef.current = null;
      
      // Reconnect after 3 seconds
      if (enabled && projectId && containerReady) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    wsRef.current = ws;
  }, [projectId, containerReady, enabled, onFileChange, onPreviewRefresh]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
