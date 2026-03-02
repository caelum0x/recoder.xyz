import { memo, useCallback, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';

interface TerminalControlsProps {
  onClear: () => void;
  onKill: () => void;
  onNewTerminal?: () => void;
  onCloseTerminal?: () => void;
  isRunning?: boolean;
  terminalCount?: number;
  activeIndex?: number;
  className?: string;
}

export const TerminalControls = memo(({
  onClear,
  onKill,
  onNewTerminal,
  onCloseTerminal,
  isRunning = false,
  terminalCount = 1,
  activeIndex = 0,
  className,
}: TerminalControlsProps) => {
  const [isKilling, setIsKilling] = useState(false);

  const handleKill = useCallback(async () => {
    setIsKilling(true);
    try {
      await onKill();
    } finally {
      setTimeout(() => setIsKilling(false), 500);
    }
  }, [onKill]);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Terminal info */}
      {terminalCount > 1 && (
        <span className="text-xs text-recoder-elements-textTertiary mr-2">
          Terminal {activeIndex + 1}/{terminalCount}
        </span>
      )}

      {/* New Terminal */}
      {onNewTerminal && (
        <IconButton
          icon="i-ph:plus"
          size="sm"
          title="New Terminal (⌘+Shift+`)"
          onClick={onNewTerminal}
        />
      )}

      {/* Clear Terminal */}
      <IconButton
        icon="i-ph:eraser"
        size="sm"
        title="Clear Terminal (⌘+K)"
        onClick={onClear}
      />

      {/* Kill Process */}
      <button
        onClick={handleKill}
        disabled={isKilling}
        className={`
          flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
          ${isRunning 
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' 
            : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:bg-recoder-elements-background-depth-4 border border-recoder-elements-borderColor'
          }
          ${isKilling ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title="Kill running process (Ctrl+C)"
      >
        {isKilling ? (
          <div className="i-ph:spinner animate-spin" />
        ) : (
          <div className="i-ph:stop-circle" />
        )}
        Kill
      </button>

      {/* Close Terminal */}
      {onCloseTerminal && terminalCount > 1 && (
        <IconButton
          icon="i-ph:x"
          size="sm"
          title="Close Terminal"
          onClick={onCloseTerminal}
        />
      )}
    </div>
  );
});

TerminalControls.displayName = 'TerminalControls';
