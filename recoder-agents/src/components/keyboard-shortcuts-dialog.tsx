'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SHORTCUTS, SHORTCUT_CATEGORIES, formatShortcutParts } from '@/lib/keyboard-shortcuts';
import type { KeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { Search } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutDisplay({ shortcut }: { shortcut: KeyboardShortcut }) {
  const { modifiers, key } = formatShortcutParts(shortcut);

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {modifiers.map((mod, i) => (
        <kbd
          key={i}
          className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs font-mono text-muted-foreground min-w-[1.5rem] text-center"
        >
          {mod}
        </kbd>
      ))}
      <kbd className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs font-mono text-muted-foreground min-w-[1.5rem] text-center">
        {key}
      </kbd>
    </span>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const [filter, setFilter] = useState('');

  const filteredShortcuts = useMemo(() => {
    if (!filter.trim()) return SHORTCUTS;
    const q = filter.toLowerCase();
    return SHORTCUTS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.action.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [filter]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, KeyboardShortcut[]> = {};
    for (const shortcut of filteredShortcuts) {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push(shortcut);
    }
    return groups;
  }, [filteredShortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg font-semibold">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter shortcuts..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>

        <div className="px-6 pb-6 max-h-[400px] overflow-y-auto space-y-5">
          {SHORTCUT_CATEGORIES.map(({ key: categoryKey, label: categoryLabel }) => {
            const shortcuts = groupedShortcuts[categoryKey];
            if (!shortcuts || shortcuts.length === 0) return null;

            return (
              <div key={categoryKey}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {categoryLabel}
                </h3>
                <div className="space-y-1">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm font-medium text-foreground">{shortcut.label}</p>
                        <p className="text-xs text-muted-foreground">{shortcut.description}</p>
                      </div>
                      <ShortcutDisplay shortcut={shortcut} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredShortcuts.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No shortcuts match &quot;{filter}&quot;
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
