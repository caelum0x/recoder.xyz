import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

export interface TerminalTab {
  id: string;
  name: string;
  isActive: boolean;
  isRunning?: boolean;
}

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeIndex: number;
  maxTerminals: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onClose: (index: number) => void;
  onRename: (index: number, newName: string) => void;
  className?: string;
}

export const TerminalTabs = memo(({
  tabs,
  activeIndex,
  maxTerminals,
  onSelect,
  onAdd,
  onClose,
  onRename,
  className,
}: TerminalTabsProps) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  const handleDoubleClick = useCallback((index: number, currentName: string) => {
    setEditingIndex(index);
    setEditValue(currentName);
  }, []);

  const handleRenameSubmit = useCallback((index: number) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tabs[index]?.name) {
      onRename(index, trimmed);
    }
    setEditingIndex(null);
    setEditValue('');
  }, [editValue, tabs, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(index);
    } else if (e.key === 'Escape') {
      setEditingIndex(null);
      setEditValue('');
    }
  }, [handleRenameSubmit]);

  const handleCloseClick = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    onClose(index);
  }, [onClose]);

  return (
    <div className={classNames('flex items-center gap-1', className)}>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        const isEditing = editingIndex === index;

        return (
          <div
            key={tab.id}
            className={classNames(
              'group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors min-w-[60px] max-w-[140px]',
              {
                'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary': isActive,
                'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive/50': !isActive,
              }
            )}
            onClick={() => !isEditing && onSelect(index)}
            onDoubleClick={() => handleDoubleClick(index, tab.name)}
            title={`${tab.name}${tab.isRunning ? ' (running)' : ''} - Double-click to rename`}
          >
            <div className="i-ph:terminal-window text-sm flex-shrink-0" />

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleRenameSubmit(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="bg-transparent border-none outline-none text-xs w-full min-w-[40px] text-bolt-elements-textPrimary"
                maxLength={20}
              />
            ) : (
              <span className="text-xs truncate flex-1">{tab.name}</span>
            )}

            {tab.isRunning && (
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0 animate-pulse" />
            )}

            {tabs.length > 1 && !isEditing && (
              <button
                onClick={(e) => handleCloseClick(e, index)}
                className={classNames(
                  'flex-shrink-0 p-0.5 rounded hover:bg-bolt-elements-background-depth-3 transition-opacity',
                  {
                    'opacity-100': isActive,
                    'opacity-0 group-hover:opacity-100': !isActive,
                  }
                )}
                title="Close terminal"
              >
                <div className="i-ph:x text-xs" />
              </button>
            )}
          </div>
        );
      })}

      {tabs.length < maxTerminals && (
        <IconButton
          icon="i-ph:plus"
          size="sm"
          onClick={onAdd}
          title={`New Terminal (${tabs.length}/${maxTerminals})`}
          className="flex-shrink-0"
        />
      )}
    </div>
  );
});

TerminalTabs.displayName = 'TerminalTabs';
