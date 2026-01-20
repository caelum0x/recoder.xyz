import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { parseErrorsFromLogs } from '~/lib/errors/parse-logs';
import { errorsAtom } from '~/lib/stores/errors';
import { dockerGet } from '~/lib/services/docker-api';

interface LogsPanelProps {
  projectId: string | null;
  className?: string;
}

export const LogsPanel = memo(({ projectId, className }: LogsPanelProps) => {
  const [logs, setLogs] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await dockerGet<{ logs?: string }>(`/api/logs/${projectId}?tail=200`);
      const newLogs = data?.logs || 'No logs available';
      setLogs(newLogs);
      setError(null);

      // Parse errors from logs and update error store
      const parsedErrors = parseErrorsFromLogs(newLogs);
      errorsAtom.set(parsedErrors);
    } catch (err: any) {
      setError(err.message);
    }
  }, [projectId]);

  // Initial fetch and polling
  useEffect(() => {
    if (!projectId) {
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
  }, [projectId, fetchLogs]);

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

  // Parse and colorize log output
  const colorizedLogs = logs.replace(
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
        '37': '<span class="text-gray-200">',
        '39': '</span>',
        '90': '<span class="text-gray-500">',
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
          <span className="text-sm font-medium">Dev Server Logs</span>
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
        className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono text-gray-100 whitespace-pre-wrap break-words"
        style={{ tabSize: 2 }}
        dangerouslySetInnerHTML={{ __html: colorizedLogs || 'Waiting for logs...' }}
      />
    </div>
  );
});

LogsPanel.displayName = 'LogsPanel';
