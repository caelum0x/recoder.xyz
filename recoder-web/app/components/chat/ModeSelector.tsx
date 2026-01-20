/**
 * Mode Selector Component
 * Allows users to switch between AI modes (Architect, Code, Ask, Debug, Orchestrator)
 */
import { useStore } from '@nanostores/react';
import { currentMode, setMode } from '~/lib/stores/mode';
import { getAllModes, type ModeDefinition } from '~/lib/modes/types';
import { useState, useRef, useEffect } from 'react';

interface ModeSelectorProps {
  compact?: boolean;
}

export function ModeSelector({ compact = false }: ModeSelectorProps) {
  const mode = useStore(currentMode);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const modes = getAllModes();
  const currentModeData = modes.find(m => m.id === mode) || modes[1]; // Default to 'code'

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

  const handleModeSelect = (modeId: string) => {
    setMode(modeId);
    setIsOpen(false);
  };

  const getModeColor = (modeData: ModeDefinition) => {
    const colors: Record<string, string> = {
      purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      green: 'text-green-400 bg-green-500/10 border-green-500/30',
      red: 'text-red-400 bg-red-500/10 border-red-500/30',
      yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    };
    return colors[modeData.color] || colors.blue;
  };

  if (compact) {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${getModeColor(currentModeData)} hover:opacity-80`}
          title={`Current mode: ${currentModeData.name}`}
        >
          <div className={currentModeData.icon} />
          <span className="text-xs font-medium">{currentModeData.name}</span>
          <div className="i-ph:caret-down text-xs opacity-60" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-recoder-elements-background border border-recoder-elements-borderColor rounded-lg shadow-lg z-50 overflow-hidden">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => handleModeSelect(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5 ${
                  m.id === mode ? 'bg-white/10' : ''
                }`}
              >
                <div className={`${m.icon} ${getModeColor(m).split(' ')[0]}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-recoder-elements-textPrimary">
                    {m.name}
                  </div>
                  <div className="text-xs text-recoder-elements-textSecondary line-clamp-1">
                    {m.description}
                  </div>
                </div>
                {m.id === mode && <div className="i-ph:check text-green-400" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wide">
        AI Mode
      </div>
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
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

export default ModeSelector;
