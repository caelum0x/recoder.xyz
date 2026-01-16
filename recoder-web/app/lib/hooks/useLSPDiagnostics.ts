/**
 * Hook to connect to LSP diagnostics WebSocket
 * Receives real-time TypeScript errors from language server
 */

import { useEffect, useRef } from 'react';
import { errorsAtom, type BuildError } from '~/lib/stores/errors';

const WS_URL = import.meta.env.VITE_DOCKER_BACKEND_URL?.replace('http', 'ws') || 'ws://localhost:3100';

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: number;
  source: 'typescript';
}

export function useLSPDiagnostics(projectId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const ws = new WebSocket(`${WS_URL}/diagnostics/${projectId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[LSP] Connected to diagnostics stream');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'diagnostics') {
          // Convert LSP diagnostics to BuildError format
          const errors: BuildError[] = data.diagnostics.map((d: Diagnostic) => ({
            id: `ts-${d.code}-${d.file}-${d.line}`,
            type: 'type' as const,
            severity: d.severity === 'info' ? 'warning' : d.severity,
            message: d.message,
            shortMessage: d.message.split('\n')[0],
            filePath: d.file,
            line: d.line,
            column: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
            source: 'typescript' as const,
            rawError: d.message,
            timestamp: Date.now(),
          }));

          // Update error store
          errorsAtom.set(errors);
        }
      } catch (error) {
        console.error('[LSP] Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[LSP] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[LSP] Disconnected from diagnostics stream');
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId]);
}
