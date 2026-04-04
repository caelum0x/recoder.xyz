/**
 * Chat Mode Selector Component
 * Inspired by dyad's implementation
 * Allows switching between Build, Ask, and Agent modes
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  currentChatMode,
  setChatMode,
  CHAT_MODES,
  type ChatMode,
  type ChatModeDefinition,
} from '~/lib/stores/chat-mode';

interface ChatModeSelectorProps {
  compact?: boolean;
}

// Detect if user is on Mac
function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  // Try modern API first
  if ('userAgentData' in nav && nav.userAgentData?.platform) {
    return nav.userAgentData.platform.toLowerCase().includes('mac');
  }

  // Fallback to user agent check
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function ChatModeSelector({ compact = true }: ChatModeSelectorProps) {
  const mode = useStore(currentChatMode);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMac = useMemo(() => detectIsMac(), []);

  const currentModeData = CHAT_MODES[mode];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + . to toggle modes
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (isModifierPressed && event.key === '.') {
        event.preventDefault();
        // Toggle through modes
        const modes: ChatMode[] = ['build', 'ask', 'agent', 'deep-coding'];
        const currentIndex = modes.indexOf(mode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setChatMode(modes[nextIndex]);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, isMac]);

  const handleModeSelect = useCallback((modeId: ChatMode) => {
    setChatMode(modeId);
    setIsOpen(false);
  }, []);

  const getModeColor = (modeData: ChatModeDefinition) => {
    const colors: Record<string, string> = {
      blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      green: 'text-green-400 bg-green-500/10 border-green-500/30',
      purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      orange: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    };
    return colors[modeData.color] || colors.blue;
  };

  const getModeHoverColor = (modeData: ChatModeDefinition) => {
    const colors: Record<string, string> = {
      blue: 'hover:bg-blue-500/20',
      green: 'hover:bg-green-500/20',
      purple: 'hover:bg-purple-500/20',
      orange: 'hover:bg-orange-500/20',
    };
    return colors[modeData.color] || colors.blue;
  };

  if (compact) {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${getModeColor(currentModeData)} ${getModeHoverColor(currentModeData)}`}
          title={`Current mode: ${currentModeData.name} (${isMac ? '⌘' : 'Ctrl'}+. to toggle)`}
        >
          <div className={currentModeData.icon} />
          <span className="text-xs font-medium">{currentModeData.name}</span>
          <div className="i-ph:caret-down text-xs opacity-60" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 rounded-lg shadow-lg z-50 overflow-hidden" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)', border: '1px solid var(--recoder-elements-bg-depth-3)' }}>
            {Object.values(CHAT_MODES).map((m) => (
              <button
                key={m.id}
                onClick={() => handleModeSelect(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-recoder-elements-background-depth-3 ${
                  m.id === mode ? 'bg-recoder-elements-background-depth-3' : ''
                }`}
              >
                <div className={`${m.icon} ${getModeColor(m).split(' ')[0]} text-lg`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-recoder-elements-textPrimary">
                    {m.name}
                  </div>
                  <div className="text-xs text-recoder-elements-textSecondary truncate">
                    {m.description}
                  </div>
                </div>
                {m.id === mode && <div className="i-ph:check text-green-400" />}
              </button>
            ))}
            <div className="px-3 py-2" style={{ borderTop: '1px solid var(--recoder-elements-bg-depth-3)' }}>
              <div className="text-xs text-recoder-elements-textTertiary">
                {isMac ? '⌘' : 'Ctrl'} + . to toggle modes
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full mode selector (non-compact)
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wide">
        Chat Mode
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(CHAT_MODES).map((m) => (
          <button
            key={m.id}
            onClick={() => handleModeSelect(m.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              m.id === mode
                ? `${getModeColor(m)} ring-1 ring-offset-1 ring-offset-recoder-elements-background ring-current`
                : 'text-recoder-elements-textSecondary bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor hover:border-recoder-elements-borderColorActive'
            }`}
            title={m.description}
          >
            <div className={m.icon} />
            <span className="text-sm font-medium">{m.name}</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-recoder-elements-textSecondary">
        {currentModeData.description}
      </div>
    </div>
  );
}

/**
 * Visual indicator component for showing current mode in chat
 */
export function ChatModeIndicator() {
  const mode = useStore(currentChatMode);
  const modeData = CHAT_MODES[mode];

  const getModeColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'text-blue-400',
      green: 'text-green-400',
      purple: 'text-purple-400',
      orange: 'text-orange-400',
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className={`inline-flex items-center gap-1 text-xs ${getModeColor(modeData.color)}`}>
      <div className={modeData.icon} />
      <span className="font-medium">{modeData.name} Mode</span>
    </div>
  );
}

export default ChatModeSelector;
