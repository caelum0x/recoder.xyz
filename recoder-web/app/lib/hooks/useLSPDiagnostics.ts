/**
 * Hook to fetch LSP diagnostics from Daytona via docker-backend
 *
 * Polls the Daytona LSP diagnostics endpoint for errors/warnings on the
 * currently active file. Results are merged into the central errorsAtom store.
 */

import { useEffect, useRef, useCallback } from 'react';
import { errorsAtom, type BuildError } from '~/lib/stores/errors';
import { dockerPost } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LSPDiagnostics');

/** Polling interval in ms — diagnostics are not latency-critical */
const POLL_INTERVAL_MS = 5000;

// ── Language detection from file extension ──

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'typescript',
  jsx: 'typescript',
  py: 'python',
  go: 'go',
  rs: 'rust',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_LANGUAGE[ext] || 'typescript';
}

// ── Types ──

interface LspDiagnostic {
  file?: string;
  path?: string;
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity?: number | string;
  code?: number | string;
  source?: string;
}

interface DiagnosticsResponse {
  ok: boolean;
  diagnostics: LspDiagnostic[];
  error?: string;
}

function mapSeverity(severity: number | string | undefined): 'error' | 'warning' {
  if (severity === 1 || severity === 'error') return 'error';
  return 'warning';
}

function toLspSource(language: string): BuildError['source'] {
  if (language === 'typescript') return 'typescript';
  // Other languages map to 'unknown' since BuildError.source is a fixed union
  return 'unknown';
}

function diagnosticToBuildError(d: LspDiagnostic, language: string): BuildError {
  const file = d.file || d.path || '';
  const line = d.range?.start?.line ?? d.line ?? 0;
  const column = d.range?.start?.character ?? d.column ?? 0;
  const endLine = d.range?.end?.line ?? d.endLine ?? line;
  const endColumn = d.range?.end?.character ?? d.endColumn ?? column;
  const code = d.code ?? 0;

  return {
    id: `lsp-${code}-${file}-${line}`,
    type: 'type',
    severity: mapSeverity(d.severity),
    message: d.message,
    shortMessage: d.message.split('\n')[0],
    filePath: file,
    line,
    column,
    endLine,
    endColumn,
    source: toLspSource(language),
    rawError: d.message,
    timestamp: Date.now(),
  };
}

// ── Hook ──

export function useLSPDiagnostics(projectId: string | null, filePath?: string | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFileRef = useRef<string | null>(null);

  const fetchDiagnostics = useCallback(async (pid: string, fp: string) => {
    const language = detectLanguage(fp);

    try {
      const resp = await dockerPost<DiagnosticsResponse>(
        `/api/daytona/lsp/${encodeURIComponent(pid)}/diagnostics`,
        { file: fp, language },
        { timeout: 8000, skipRetry: true },
      );

      if (!resp?.ok) {
        return;
      }

      const diagnostics = resp.diagnostics || [];

      if (diagnostics.length === 0) {
        // Clear any previous LSP-sourced errors for this file
        const current = errorsAtom.get();
        const filtered = current.filter((e) => !e.id.startsWith('lsp-') || e.filePath !== fp);

        if (filtered.length !== current.length) {
          errorsAtom.set(filtered);
        }

        return;
      }

      const newErrors = diagnostics.map((d) => diagnosticToBuildError(d, language));

      // Merge: keep non-LSP errors + replace LSP errors for this file
      const current = errorsAtom.get();
      const otherErrors = current.filter((e) => !e.id.startsWith('lsp-') || e.filePath !== fp);
      errorsAtom.set([...otherErrors, ...newErrors]);
    } catch {
      // Silently ignore — LSP may not be available for this sandbox
    }
  }, []);

  useEffect(() => {
    if (!projectId || !filePath) {
      return;
    }

    lastFileRef.current = filePath;

    // Fetch immediately, then poll
    fetchDiagnostics(projectId, filePath);

    intervalRef.current = setInterval(() => {
      if (lastFileRef.current) {
        fetchDiagnostics(projectId, lastFileRef.current);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [projectId, filePath, fetchDiagnostics]);
}
