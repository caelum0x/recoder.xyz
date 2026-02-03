/**
 * Hook to connect to LSP diagnostics WebSocket
 * Receives real-time TypeScript errors from language server
 *
 * NOTE: The /diagnostics/ WebSocket endpoint is not yet implemented.
 * This hook is disabled until the endpoint is added to docker-backend.
 * For now, errors are captured from terminal output and build logs.
 */

import { useEffect, useRef } from 'react';
import { errorsAtom, type BuildError } from '~/lib/stores/errors';
import { getSessionToken } from '~/lib/services/docker-api';

const WS_URL = import.meta.env.VITE_DOCKER_BACKEND_URL?.replace('http', 'ws') || 'ws://localhost:3100';

// Feature flag - disable until /diagnostics/ endpoint is implemented
const LSP_DIAGNOSTICS_ENABLED = false;

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
  const connectionAttemptedRef = useRef(false);

  useEffect(() => {
    // Skip if disabled or no projectId
    if (!LSP_DIAGNOSTICS_ENABLED || !projectId) {
      return;
    }

    // Only attempt connection once per mount to avoid spam
    if (connectionAttemptedRef.current) {
      return;
    }
    connectionAttemptedRef.current = true;

    // Include auth token for cross-origin authentication
    const token = getSessionToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${WS_URL}/diagnostics/${projectId}${tokenParam}`);
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
        // Silently ignore parse errors
      }
    };

    ws.onerror = () => {
      // Silently ignore connection errors - endpoint not implemented yet
      // The /diagnostics/ endpoint will be added in a future update
    };

    ws.onclose = () => {
      // Silently handle disconnect
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [projectId]);

  // Reset connection flag when projectId changes
  useEffect(() => {
    connectionAttemptedRef.current = false;
  }, [projectId]);
}
