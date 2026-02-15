import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { IconButton } from '~/components/ui/IconButton';
import { parseErrorsFromLogs } from '~/lib/errors/parse-logs';
import { errorsAtom } from '~/lib/stores/errors';
import { dockerGet } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('LogsPanel');

interface LogsPanelProps {
  projectId: string | null;
  className?: string;
}

/** Max consecutive fetch failures before we stop polling */
const MAX_CONSECUTIVE_FAILURES = 3;
/** How long to pause polling after hitting the failure threshold (ms) */
const BACKOFF_PAUSE_MS = 30_000;

export const LogsPanel = memo(({ projectId, className }: LogsPanelProps) => {
  const containerReady = useStore(workbenchStore.containerReady);

  const [logs, setLogs] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpo, setIsExpo] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const backoffUntilRef = useRef(0);

  // Detect Expo project type (same pattern as Preview.tsx)
  useEffect(() => {
    if (!projectId || !containerReady) return;

    let cancelled = false;

    dockerGet<{ type: string }>(`/api/project-type/${projectId}`, { skipRetry: true, timeout: 10000 })
      .then((data) => {
        if (!cancelled && data?.type === 'expo') {
          setIsExpo(true);
        }
      })
      .catch(() => {
        // Silently ignore - best effort
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, containerReady]);

  // Listen for dev-server-ready events that indicate Expo framework
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.framework === 'expo') {
        setIsExpo(true);
      }
    };
    window.addEventListener('recoder:dev-server-ready', handler);
    return () => window.removeEventListener('recoder:dev-server-ready', handler);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!projectId || !containerReady) return;

    // If we've hit the failure threshold, skip until backoff expires
    if (Date.now() < backoffUntilRef.current) {
      return;
    }

    try {
      const sourceParam = isExpo ? '&source=expo' : '';
      const data = await dockerGet<{ logs?: string }>(`/api/logs/${projectId}?tail=200${sourceParam}`);
      const newLogs = data?.logs || 'No logs available';
      setLogs(newLogs);
      setError(null);
      // Reset failure counter on success
      consecutiveFailuresRef.current = 0;

      // Parse errors from logs and update error store
      const parsedErrors = parseErrorsFromLogs(newLogs);
      errorsAtom.set(parsedErrors);
    } catch (err: any) {
      consecutiveFailuresRef.current++;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        logger.debug(`[LogsPanel] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, pausing polling for ${BACKOFF_PAUSE_MS / 1000}s`);
        backoffUntilRef.current = Date.now() + BACKOFF_PAUSE_MS;
      }
      setError(err.message);
    }
  }, [projectId, containerReady, isExpo]);

  // Reset failure tracking when container readiness changes
  useEffect(() => {
    if (containerReady) {
      consecutiveFailuresRef.current = 0;
      backoffUntilRef.current = 0;
    }
  }, [containerReady]);

  // Initial fetch and polling - only when container is ready
  useEffect(() => {
    if (!projectId || !containerReady) {
      setLogs('');
      return;
    }

    setIsLoading(true);
    fetchLogs().finally(() => setIsLoading(false));

    // Poll for updates every 2 seconds
    intervalRef.current = setInterval(fetchLogs, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [projectId, containerReady, fetchLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClearLogs = useCallback(() => {
    setLogs('');
  }, []);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev);
  }, []);

  const handleScrollToTop = useCallback(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = 0;
    }
  }, []);

  const handleScrollToBottom = useCallback(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, []);

  // HTML-escape logs first to prevent XSS, then apply ANSI colorization
  const escapedLogs = logs
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const colorizedLogs = escapedLogs.replace(
    /\x1b\[(\d+)m/g,
    (_, code) => {
      const colorMap: Record<string, string> = {
        '0': '</span>',
        '1': '<span class="font-bold">',
        '31': '<span class="text-red-400">',
        '32': '<span class="text-green-400">',
        '33': '<span class="text-yellow-400">',
        '34': '<span class="text-blue-400">',
        '35': '<span class="text-purple-400">',
        '36': '<span class="text-cyan-400">',
        '37': '<span class="text-bolt-elements-textSecondary">',
        '39': '</span>',
        '90': '<span class="text-bolt-elements-textTertiary">',
      };
      return colorMap[code] || '';
    }
  );

  if (!projectId) {
    return (
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
        <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
          <p>No project selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2">
          <div className="i-ph:terminal text-lg" />
          <span className="text-sm font-medium">{isExpo ? 'Metro Logs' : 'Dev Server Logs'}</span>
          {isLoading && (
            <div className="i-ph:spinner animate-spin text-sm text-bolt-elements-textTertiary" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon="i-ph:arrow-line-up"
            size="sm"
            title="Scroll to top"
            onClick={handleScrollToTop}
          />
          <IconButton
            icon="i-ph:arrow-line-down"
            size="sm"
            title="Scroll to bottom"
            onClick={handleScrollToBottom}
          />
          <button
            onClick={handleToggleAutoScroll}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              autoScroll
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary border border-bolt-elements-borderColor'
            }`}
            title={autoScroll ? 'Auto-scroll enabled (click to pause)' : 'Auto-scroll paused (click to enable)'}
          >
            <span className={autoScroll ? 'i-ph:pin-fill' : 'i-ph:pause'} />
            {autoScroll ? 'Auto' : 'Paused'}
          </button>
          <IconButton
            icon="i-ph:trash"
            size="sm"
            title="Clear logs"
            onClick={handleClearLogs}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Logs content */}
      <pre
        ref={logsRef}
        className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono text-bolt-elements-textSecondary whitespace-pre-wrap break-words"
        style={{ tabSize: 2 }}
        dangerouslySetInnerHTML={{ __html: colorizedLogs || 'Waiting for logs...' }}
      />
    </div>
  );
});

LogsPanel.displayName = 'LogsPanel';
