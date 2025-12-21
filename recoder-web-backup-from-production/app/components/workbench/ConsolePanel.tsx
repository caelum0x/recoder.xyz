import { useStore } from '@nanostores/react';
import { memo, useEffect, useRef } from 'react';
import { workbenchStore, type ConsoleLogEntry } from '~/lib/stores/workbench';

interface ConsolePanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

const LogEntry = memo(({ entry }: { entry: ConsoleLogEntry }) => {
  const colors: Record<string, string> = {
    log: 'text-gray-300',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className={`font-mono text-xs py-0.5 ${colors[entry.type] || 'text-gray-300'}`}>
      <span className="text-gray-500 mr-2">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>
      {entry.message}
    </div>
  );
});

export const ConsolePanel = memo(({ isOpen, onToggle }: ConsolePanelProps) => {
  const logs = useStore(workbenchStore.consoleLogs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestMessage = logs.length > 0 ? logs[logs.length - 1]?.message : undefined;

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  return (
    <div className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {/* Header - always visible */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-bolt-elements-background-depth-3 transition-colors"
      >
        <div className="i-ph:terminal text-sm" />
        <span className="text-xs font-medium">Console</span>
        {logs.length > 0 && (
          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 rounded">
            {logs.length}
          </span>
        )}
        {!isOpen && latestMessage && (
          <span className="text-xs text-gray-500 truncate max-w-[200px] ml-2">
            {latestMessage.substring(0, 50)}
          </span>
        )}
        <div className="flex-1" />
        <div className={`i-ph:caret-${isOpen ? 'down' : 'up'} text-sm`} />
      </div>

      {/* Content - only when open */}
      {isOpen && (
        <div
          ref={scrollRef}
          className="h-32 overflow-auto px-3 py-2 bg-bolt-elements-background-depth-1"
        >
          {logs.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              No console output yet
            </div>
          ) : (
            logs.map((entry, i) => <LogEntry key={i} entry={entry} />)
          )}
        </div>
      )}
    </div>
  );
});
