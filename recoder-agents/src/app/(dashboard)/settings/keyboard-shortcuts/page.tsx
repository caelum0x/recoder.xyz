'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Keyboard,
  Pencil,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  Navigation,
  Zap,
  Eye,
  Command,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useKeyboardShortcuts,
  useSetShortcuts,
  useResetShortcut,
  useResetAllShortcuts,
} from '@/hooks/use-keyboard-shortcuts';

// ============================================================================
// Types & Constants
// ============================================================================

type ShortcutCategory = 'navigation' | 'actions' | 'views';

interface ShortcutDefinition {
  action: string;
  label: string;
  description: string;
  category: ShortcutCategory;
  defaultCombo: string;
}

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Navigation
  {
    action: 'new_thread',
    label: 'New Thread',
    description: 'Start a new conversation thread',
    category: 'navigation',
    defaultCombo: 'Ctrl+N',
  },
  {
    action: 'search',
    label: 'Search',
    description: 'Open global search',
    category: 'navigation',
    defaultCombo: 'Ctrl+K',
  },
  {
    action: 'dashboard',
    label: 'Dashboard',
    description: 'Navigate to dashboard',
    category: 'navigation',
    defaultCombo: 'Ctrl+D',
  },
  {
    action: 'settings',
    label: 'Settings',
    description: 'Open settings page',
    category: 'navigation',
    defaultCombo: 'Ctrl+,',
  },

  // Actions
  {
    action: 'send_message',
    label: 'Send Message',
    description: 'Send the current message',
    category: 'actions',
    defaultCombo: 'Enter',
  },
  {
    action: 'export',
    label: 'Export',
    description: 'Export current thread or data',
    category: 'actions',
    defaultCombo: 'Ctrl+Shift+E',
  },
  {
    action: 'pin',
    label: 'Pin',
    description: 'Pin the current thread or message',
    category: 'actions',
    defaultCombo: 'Ctrl+Shift+P',
  },

  // Views
  {
    action: 'toggle_sidebar',
    label: 'Toggle Sidebar',
    description: 'Show or hide the sidebar',
    category: 'views',
    defaultCombo: 'Ctrl+B',
  },
  {
    action: 'toggle_dark_mode',
    label: 'Toggle Dark Mode',
    description: 'Switch between light and dark theme',
    category: 'views',
    defaultCombo: 'Ctrl+Shift+L',
  },
  {
    action: 'focus_chat',
    label: 'Focus Chat',
    description: 'Move focus to the chat input',
    category: 'views',
    defaultCombo: 'Ctrl+/',
  },
];

const CATEGORY_META: Record<
  ShortcutCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  navigation: { label: 'Navigation', icon: Navigation },
  actions: { label: 'Actions', icon: Zap },
  views: { label: 'Views', icon: Eye },
};

function getDefaultCombo(action: string): string {
  const def = SHORTCUT_DEFINITIONS.find((d) => d.action === action);
  return def?.defaultCombo ?? '';
}

// ============================================================================
// Key Combo Display
// ============================================================================

function KeyComboDisplay({ combo }: { combo: string }) {
  const parts = combo.split('+');
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium bg-muted border border-border rounded shadow-sm"
        >
          {part === 'Ctrl' ? (
            <span className="flex items-center gap-0.5">
              <Command className="h-3 w-3" />
            </span>
          ) : (
            part
          )}
        </kbd>
      ))}
    </span>
  );
}

// ============================================================================
// Key Capture Modal
// ============================================================================

function KeyCaptureModal({
  open,
  onOpenChange,
  shortcutDef,
  currentCombo,
  allCombos,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcutDef: ShortcutDefinition;
  currentCombo: string;
  allCombos: Map<string, string>;
  onSave: (combo: string) => void;
}) {
  const [capturedCombo, setCapturedCombo] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCapturedCombo(null);
      setConflict(null);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }

      // Build the key combo string
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      const key = e.key;
      // Skip if only modifier keys were pressed
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;

      // Normalize key name
      const normalizedKey =
        key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
      parts.push(normalizedKey);

      const combo = parts.join('+');
      setCapturedCombo(combo);

      // Check for conflicts
      const conflictingAction = Array.from(allCombos.entries()).find(
        ([action, existingCombo]) =>
          action !== shortcutDef.action &&
          existingCombo.toLowerCase() === combo.toLowerCase()
      );

      if (conflictingAction) {
        const conflictDef = SHORTCUT_DEFINITIONS.find(
          (d) => d.action === conflictingAction[0]
        );
        setConflict(conflictDef?.label ?? conflictingAction[0]);
      } else {
        setConflict(null);
      }
    },
    [allCombos, shortcutDef.action, onOpenChange]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const handleSave = () => {
    if (capturedCombo && !conflict) {
      onSave(capturedCombo);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Shortcut: {shortcutDef.label}</DialogTitle>
          <DialogDescription>{shortcutDef.description}</DialogDescription>
        </DialogHeader>
        <div className="py-6">
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Press the key combination you want to assign
            </p>
            <div className="flex items-center justify-center min-h-[60px] rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4">
              {capturedCombo ? (
                <KeyComboDisplay combo={capturedCombo} />
              ) : (
                <span className="text-muted-foreground text-sm">
                  Waiting for input...
                </span>
              )}
            </div>
            {conflict && (
              <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  Already used by &quot;{conflict}&quot;
                </span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Current: <KeyComboDisplay combo={currentCombo} /> | Default:{' '}
              <KeyComboDisplay combo={shortcutDef.defaultCombo} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!capturedCombo || !!conflict}>
            <Check className="h-4 w-4 mr-2" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Shortcut Row
// ============================================================================

function ShortcutRow({
  def,
  currentCombo,
  isDefault,
  onEdit,
  onReset,
}: {
  def: ShortcutDefinition;
  currentCombo: string;
  isDefault: boolean;
  onEdit: () => void;
  onReset: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div>
          <span className="font-medium text-sm">{def.label}</span>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <KeyComboDisplay combo={currentCombo} />
          {!isDefault && (
            <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400">
              Custom
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              title="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Category Group
// ============================================================================

function CategoryGroup({
  category,
  definitions,
  comboMap,
  onEdit,
  onReset,
}: {
  category: ShortcutCategory;
  definitions: ShortcutDefinition[];
  comboMap: Map<string, string>;
  onEdit: (def: ShortcutDefinition) => void;
  onReset: (action: string) => void;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Action</TableHead>
              <TableHead>Shortcut</TableHead>
              <TableHead className="w-[100px] text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.map((def) => {
              const currentCombo = comboMap.get(def.action) ?? def.defaultCombo;
              const isDefault = currentCombo === def.defaultCombo;
              return (
                <ShortcutRow
                  key={def.action}
                  def={def}
                  currentCombo={currentCombo}
                  isDefault={isDefault}
                  onEdit={() => onEdit(def)}
                  onReset={() => onReset(def.action)}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Reset All Confirmation
// ============================================================================

function ResetAllDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset All Shortcuts</DialogTitle>
          <DialogDescription>
            This will remove all your custom keyboard shortcuts and restore
            the defaults. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Resetting...' : 'Reset All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function KeyboardShortcutsPage() {
  const { data: shortcuts, isLoading } = useKeyboardShortcuts();
  const setShortcutsMutation = useSetShortcuts();
  const resetShortcutMutation = useResetShortcut();
  const resetAllMutation = useResetAllShortcuts();

  const [editingDef, setEditingDef] = useState<ShortcutDefinition | null>(null);
  const [showResetAll, setShowResetAll] = useState(false);

  // Build a map of action -> current key_combo from user's saved shortcuts
  const comboMap = useMemo(() => {
    const map = new Map<string, string>();
    // Start with defaults
    for (const def of SHORTCUT_DEFINITIONS) {
      map.set(def.action, def.defaultCombo);
    }
    // Override with user's saved shortcuts
    if (shortcuts) {
      for (const s of shortcuts) {
        if (s.is_active) {
          map.set(s.action, s.key_combo);
        }
      }
    }
    return map;
  }, [shortcuts]);

  const handleEdit = (def: ShortcutDefinition) => {
    setEditingDef(def);
  };

  const handleSaveCombo = (combo: string) => {
    if (!editingDef) return;
    setShortcutsMutation.mutate([
      { action: editingDef.action, key_combo: combo, is_active: true },
    ]);
  };

  const handleReset = (action: string) => {
    resetShortcutMutation.mutate(action);
  };

  const handleResetAll = () => {
    resetAllMutation.mutate(undefined, {
      onSuccess: () => setShowResetAll(false),
    });
  };

  const grouped = useMemo(() => {
    const groups: Record<ShortcutCategory, ShortcutDefinition[]> = {
      navigation: [],
      actions: [],
      views: [],
    };
    for (const def of SHORTCUT_DEFINITIONS) {
      groups[def.category].push(def);
    }
    return groups;
  }, []);

  const customCount = useMemo(() => {
    if (!shortcuts) return 0;
    return shortcuts.filter((s) => {
      const def = SHORTCUT_DEFINITIONS.find((d) => d.action === s.action);
      return def && s.key_combo !== def.defaultCombo;
    }).length;
  }, [shortcuts]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Keyboard className="h-6 w-6" />
            Keyboard Shortcuts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize keyboard shortcuts to match your workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          {customCount > 0 && (
            <Badge variant="secondary">
              {customCount} custom
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => setShowResetAll(true)}
            disabled={!shortcuts || shortcuts.length === 0}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Shortcut Groups */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(grouped) as ShortcutCategory[]).map((category) => (
            <CategoryGroup
              key={category}
              category={category}
              definitions={grouped[category]}
              comboMap={comboMap}
              onEdit={handleEdit}
              onReset={handleReset}
            />
          ))}
        </div>
      )}

      {/* Default Shortcuts Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Command className="h-4 w-4" />
            Default Shortcuts Reference
          </CardTitle>
          <CardDescription>
            Quick reference for all default keyboard shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SHORTCUT_DEFINITIONS.map((def) => (
              <div
                key={def.action}
                className="flex items-center justify-between p-2 rounded-md bg-muted/40"
              >
                <span className="text-sm">{def.label}</span>
                <KeyComboDisplay combo={def.defaultCombo} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {editingDef && (
        <KeyCaptureModal
          open={!!editingDef}
          onOpenChange={(open) => {
            if (!open) setEditingDef(null);
          }}
          shortcutDef={editingDef}
          currentCombo={comboMap.get(editingDef.action) ?? editingDef.defaultCombo}
          allCombos={comboMap}
          onSave={handleSaveCombo}
        />
      )}

      {/* Reset All Dialog */}
      <ResetAllDialog
        open={showResetAll}
        onOpenChange={setShowResetAll}
        onConfirm={handleResetAll}
        isPending={resetAllMutation.isPending}
      />
    </div>
  );
}
