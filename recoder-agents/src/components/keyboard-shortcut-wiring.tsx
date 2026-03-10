'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcutAction } from '@/components/keyboard-shortcut-provider';
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog';

interface KeyboardShortcutWiringProps {
  onOpenSearch?: () => void;
  onNewAgent?: () => void;
}

/**
 * Wires up all keyboard shortcuts to actual application actions.
 * Place this component inside the KeyboardShortcutProvider, within a router context.
 */
export function KeyboardShortcutWiring({ onOpenSearch, onNewAgent }: KeyboardShortcutWiringProps) {
  const router = useRouter();
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // Navigation shortcuts
  useShortcutAction(
    'open-search',
    useCallback(() => {
      if (onOpenSearch) {
        onOpenSearch();
      } else {
        // Dispatch a custom event that the sidebar can listen for
        window.dispatchEvent(new CustomEvent('shortcut:open-search'));
      }
    }, [onOpenSearch])
  );

  useShortcutAction(
    'nav-dashboard',
    useCallback(() => {
      router.push('/');
    }, [router])
  );

  useShortcutAction(
    'nav-agents',
    useCallback(() => {
      router.push('/agents');
    }, [router])
  );

  useShortcutAction(
    'nav-marketplace',
    useCallback(() => {
      router.push('/marketplace');
    }, [router])
  );

  useShortcutAction(
    'nav-reports',
    useCallback(() => {
      router.push('/reports');
    }, [router])
  );

  useShortcutAction(
    'nav-settings',
    useCallback(() => {
      router.push('/settings/account');
    }, [router])
  );

  // Action shortcuts
  useShortcutAction(
    'new-thread',
    useCallback(() => {
      router.push('/dashboard');
    }, [router])
  );

  useShortcutAction(
    'new-agent',
    useCallback(() => {
      if (onNewAgent) {
        onNewAgent();
      } else {
        // Navigate to agents and dispatch event to open new agent dialog
        router.push('/agents');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('shortcut:new-agent'));
        }, 300);
      }
    }, [onNewAgent, router])
  );

  useShortcutAction(
    'export',
    useCallback(() => {
      window.dispatchEvent(new CustomEvent('shortcut:export'));
    }, [])
  );

  useShortcutAction(
    'focus-input',
    useCallback(() => {
      // Find the chat textarea and focus it
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder*="message"], textarea[placeholder*="Message"], textarea[placeholder*="chat"], textarea[data-chat-input]'
      );
      if (textarea) {
        textarea.focus();
      }
    }, [])
  );

  // General shortcuts
  useShortcutAction(
    'show-shortcuts',
    useCallback(() => {
      setShortcutsDialogOpen(true);
    }, [])
  );

  useShortcutAction(
    'close-dialog',
    useCallback(() => {
      // Escape is handled natively by dialogs, but we dispatch for custom overlays
      window.dispatchEvent(new CustomEvent('shortcut:close-dialog'));
    }, [])
  );

  return (
    <KeyboardShortcutsDialog
      open={shortcutsDialogOpen}
      onOpenChange={setShortcutsDialogOpen}
    />
  );
}
