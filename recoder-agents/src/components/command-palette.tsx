'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Store,
  FileBarChart,
  Settings,
  Plus,
  MessageSquarePlus,
  Moon,
  Sun,
  Keyboard,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { formatShortcut, SHORTCUTS } from '@/lib/keyboard-shortcuts';

interface CommandAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcutAction?: string; // matches SHORTCUTS[].action for display
  onExecute: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onOpenShortcuts?: () => void;
}

/**
 * Command palette content — renders quick-action commands in a CommandGroup.
 * Designed to be embedded inside the GlobalSearchDialog when the search input is empty.
 */
export function CommandPaletteActions({ onClose, onOpenShortcuts }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const commands: CommandAction[] = useMemo(
    () => [
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        shortcutAction: 'nav-dashboard',
        onExecute: () => {
          router.push('/');
          onClose();
        },
      },
      {
        id: 'go-agents',
        label: 'Go to Agents',
        icon: Bot,
        shortcutAction: 'nav-agents',
        onExecute: () => {
          router.push('/agents');
          onClose();
        },
      },
      {
        id: 'create-thread',
        label: 'Create New Thread',
        icon: MessageSquarePlus,
        shortcutAction: 'new-thread',
        onExecute: () => {
          router.push('/dashboard');
          onClose();
        },
      },
      {
        id: 'create-agent',
        label: 'Create New Agent',
        icon: Plus,
        shortcutAction: 'new-agent',
        onExecute: () => {
          router.push('/agents');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('shortcut:new-agent'));
          }, 300);
          onClose();
        },
      },
      {
        id: 'go-marketplace',
        label: 'Go to Marketplace',
        icon: Store,
        shortcutAction: 'nav-marketplace',
        onExecute: () => {
          router.push('/marketplace');
          onClose();
        },
      },
      {
        id: 'go-reports',
        label: 'View Reports',
        icon: FileBarChart,
        shortcutAction: 'nav-reports',
        onExecute: () => {
          router.push('/reports');
          onClose();
        },
      },
      {
        id: 'go-settings',
        label: 'Open Settings',
        icon: Settings,
        shortcutAction: 'nav-settings',
        onExecute: () => {
          router.push('/settings/account');
          onClose();
        },
      },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        icon: theme === 'dark' ? Sun : Moon,
        onExecute: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          onClose();
        },
      },
      {
        id: 'show-shortcuts',
        label: 'Show Keyboard Shortcuts',
        icon: Keyboard,
        shortcutAction: 'show-shortcuts',
        onExecute: () => {
          onClose();
          if (onOpenShortcuts) {
            onOpenShortcuts();
          } else {
            window.dispatchEvent(new CustomEvent('shortcut:show-shortcuts'));
          }
        },
      },
    ],
    [router, theme, setTheme, onClose, onOpenShortcuts]
  );

  return (
    <CommandGroup heading="Quick Actions">
      {commands.map((cmd) => {
        const Icon = cmd.icon;
        const shortcut = cmd.shortcutAction
          ? SHORTCUTS.find((s) => s.action === cmd.shortcutAction)
          : undefined;

        return (
          <CommandItem
            key={cmd.id}
            value={cmd.id}
            onSelect={cmd.onExecute}
            className="rounded-xl"
          >
            <div className="flex items-center gap-3 px-1 py-1 w-full">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex-1 text-sm font-medium">{cmd.label}</span>
              {shortcut && (
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {formatShortcut(shortcut)}
                </span>
              )}
            </div>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
