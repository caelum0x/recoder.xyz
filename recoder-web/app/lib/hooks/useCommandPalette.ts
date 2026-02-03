/**
 * useCommandPalette Hook
 *
 * Registers default commands for the VS Code-style command palette.
 * Integrates with workbench, chat, terminal, and other app features.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from '@remix-run/react';
import {
  registerCommands,
  openCommandPalette,
  type PaletteCommand,
} from '~/lib/stores/command-palette';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { openShortcutsPanel } from '~/lib/stores/keyboard-shortcuts';
import { themeStore } from '~/lib/stores/theme';

/**
 * Hook to register and manage command palette commands
 *
 * @param options Configuration options for command registration
 */
export function useCommandPalette(options?: {
  /** Called when settings should be opened */
  onOpenSettings?: () => void;
  /** Called when a new file should be created */
  onNewFile?: () => void;
  /** Called when a new folder should be created */
  onNewFolder?: () => void;
  /** Called when file search should open */
  onOpenFile?: () => void;
  /** Called when chat should be cleared */
  onClearChat?: () => void;
  /** Called when deploy should be triggered */
  onDeploy?: () => void;
  /** Called when GitHub import should open */
  onImportGitHub?: () => void;
  /** Called when export project is triggered */
  onExportProject?: () => void;
  /** Called to toggle file tree visibility */
  onToggleFileTree?: () => void;
}) {
  const navigate = useNavigate();

  // Create default commands
  const createDefaultCommands = useCallback((): PaletteCommand[] => {
    const commands: PaletteCommand[] = [
      // ===== File Commands =====
      {
        id: 'file.new',
        label: 'New File',
        description: 'Create a new file in the project',
        category: 'file',
        icon: 'i-ph:file-plus',
        shortcut: { mac: ['Cmd', 'N'], win: ['Ctrl', 'N'] },
        action: () => {
          if (options?.onNewFile) {
            options.onNewFile();
          } else {
            // Default: prompt for file name
            const fileName = prompt('Enter file name:');
            if (fileName) {
              // Dispatch event for workbench to handle
              window.dispatchEvent(
                new CustomEvent('recoder:create-file', { detail: { fileName } })
              );
            }
          }
        },
      },
      {
        id: 'file.newFolder',
        label: 'New Folder',
        description: 'Create a new folder in the project',
        category: 'file',
        icon: 'i-ph:folder-plus',
        shortcut: { mac: ['Cmd', 'Shift', 'N'], win: ['Ctrl', 'Shift', 'N'] },
        action: () => {
          if (options?.onNewFolder) {
            options.onNewFolder();
          } else {
            const folderName = prompt('Enter folder name:');
            if (folderName) {
              window.dispatchEvent(
                new CustomEvent('recoder:create-folder', { detail: { folderName } })
              );
            }
          }
        },
      },
      {
        id: 'file.open',
        label: 'Open File',
        description: 'Quick open a file by name',
        category: 'file',
        icon: 'i-ph:folder-open',
        shortcut: { mac: ['Cmd', 'P'], win: ['Ctrl', 'P'] },
        action: () => {
          if (options?.onOpenFile) {
            options.onOpenFile();
          } else {
            // Dispatch event for file search
            window.dispatchEvent(new CustomEvent('recoder:open-file-search'));
          }
        },
      },
      {
        id: 'file.save',
        label: 'Save',
        description: 'Save the current file',
        category: 'file',
        icon: 'i-ph:floppy-disk',
        shortcut: { mac: ['Cmd', 'S'], win: ['Ctrl', 'S'] },
        action: async () => {
          await workbenchStore.saveCurrentDocument();
        },
      },
      {
        id: 'file.saveAll',
        label: 'Save All',
        description: 'Save all open files',
        category: 'file',
        icon: 'i-ph:floppy-disk-back',
        shortcut: { mac: ['Cmd', 'Shift', 'S'], win: ['Ctrl', 'Shift', 'S'] },
        action: async () => {
          await workbenchStore.saveAllFiles();
        },
      },
      {
        id: 'file.closeTab',
        label: 'Close Tab',
        description: 'Close the current editor tab',
        category: 'file',
        icon: 'i-ph:x',
        shortcut: { mac: ['Cmd', 'W'], win: ['Ctrl', 'W'] },
        action: () => {
          const selectedFile = workbenchStore.selectedFile.get();
          if (selectedFile) {
            workbenchStore.closeTab(selectedFile);
          }
        },
      },
      {
        id: 'file.closeAllTabs',
        label: 'Close All Tabs',
        description: 'Close all editor tabs',
        category: 'file',
        icon: 'i-ph:x-circle',
        action: () => {
          workbenchStore.closeAllTabs();
        },
      },

      // ===== Edit Commands =====
      {
        id: 'edit.undo',
        label: 'Undo',
        description: 'Undo the last change',
        category: 'edit',
        icon: 'i-ph:arrow-counter-clockwise',
        shortcut: { mac: ['Cmd', 'Z'], win: ['Ctrl', 'Z'] },
        action: () => {
          // Handled by CodeMirror
          document.execCommand('undo');
        },
      },
      {
        id: 'edit.redo',
        label: 'Redo',
        description: 'Redo the last undone change',
        category: 'edit',
        icon: 'i-ph:arrow-clockwise',
        shortcut: { mac: ['Cmd', 'Shift', 'Z'], win: ['Ctrl', 'Shift', 'Z'] },
        action: () => {
          document.execCommand('redo');
        },
      },
      {
        id: 'edit.find',
        label: 'Find',
        description: 'Search in the current file',
        category: 'edit',
        icon: 'i-ph:magnifying-glass',
        shortcut: { mac: ['Cmd', 'F'], win: ['Ctrl', 'F'] },
        action: () => {
          // Dispatch event for editor to handle
          window.dispatchEvent(new CustomEvent('recoder:find-in-file'));
        },
      },
      {
        id: 'edit.findAndReplace',
        label: 'Find and Replace',
        description: 'Search and replace in the current file',
        category: 'edit',
        icon: 'i-ph:swap',
        shortcut: { mac: ['Cmd', 'H'], win: ['Ctrl', 'H'] },
        action: () => {
          window.dispatchEvent(new CustomEvent('recoder:find-replace'));
        },
      },

      // ===== View Commands =====
      {
        id: 'view.toggleSidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the sidebar',
        category: 'view',
        icon: 'i-ph:sidebar',
        shortcut: { mac: ['Cmd', 'B'], win: ['Ctrl', 'B'] },
        action: () => {
          chatStore.setKey('showChat', !chatStore.get().showChat);
        },
      },
      {
        id: 'view.toggleFileTree',
        label: 'Toggle File Tree',
        description: 'Show or hide the file explorer',
        category: 'view',
        icon: 'i-ph:tree-structure',
        shortcut: { mac: ['Cmd', 'Shift', 'E'], win: ['Ctrl', 'Shift', 'E'] },
        action: () => {
          if (options?.onToggleFileTree) {
            options.onToggleFileTree();
          } else {
            window.dispatchEvent(new CustomEvent('recoder:toggle-file-tree'));
          }
        },
      },
      {
        id: 'view.toggleWorkbench',
        label: 'Toggle Workbench',
        description: 'Show or hide the code editor',
        category: 'view',
        icon: 'i-ph:code',
        action: () => {
          workbenchStore.showWorkbench.set(!workbenchStore.showWorkbench.get());
        },
      },
      {
        id: 'view.codeView',
        label: 'Show Code',
        description: 'Switch to code editor view',
        category: 'view',
        icon: 'i-ph:code',
        action: () => {
          workbenchStore.currentView.set('code');
          workbenchStore.showWorkbench.set(true);
        },
      },
      {
        id: 'view.previewView',
        label: 'Show Preview',
        description: 'Switch to preview view',
        category: 'view',
        icon: 'i-ph:eye',
        action: () => {
          workbenchStore.currentView.set('preview');
          workbenchStore.showWorkbench.set(true);
        },
      },
      {
        id: 'view.toggleSplit',
        label: 'Toggle Split View',
        description: 'Split the editor into two panes',
        category: 'view',
        icon: 'i-ph:columns',
        action: () => {
          workbenchStore.toggleSplit();
        },
      },
      {
        id: 'view.toggleTheme',
        label: 'Toggle Theme',
        description: 'Switch between light and dark theme',
        category: 'view',
        icon: 'i-ph:sun-moon',
        action: () => {
          const current = themeStore.get();
          themeStore.set(current === 'dark' ? 'light' : 'dark');
        },
      },

      // ===== Terminal Commands =====
      {
        id: 'terminal.toggle',
        label: 'Toggle Terminal',
        description: 'Show or hide the terminal panel',
        category: 'terminal',
        icon: 'i-ph:terminal-window',
        shortcut: { mac: ['Cmd', '`'], win: ['Ctrl', '`'] },
        action: () => {
          workbenchStore.toggleTerminal();
        },
      },
      {
        id: 'terminal.clear',
        label: 'Clear Terminal',
        description: 'Clear the terminal output',
        category: 'terminal',
        icon: 'i-ph:trash',
        shortcut: { mac: ['Cmd', 'K'], win: ['Ctrl', 'K'] },
        action: () => {
          workbenchStore.clearActiveTerminal();
        },
        when: () => workbenchStore.showTerminal.get(),
      },
      {
        id: 'terminal.kill',
        label: 'Kill Process',
        description: 'Terminate the running process',
        category: 'terminal',
        icon: 'i-ph:stop-circle',
        action: () => {
          workbenchStore.killActiveProcess();
        },
        when: () => workbenchStore.commandRunning.get(),
      },
      {
        id: 'terminal.runDev',
        label: 'Run Dev Server',
        description: 'Start the development server',
        category: 'terminal',
        icon: 'i-ph:play',
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('npm run dev');
        },
      },
      {
        id: 'terminal.runBuild',
        label: 'Run Build',
        description: 'Build the project',
        category: 'terminal',
        icon: 'i-ph:hammer',
        shortcut: { mac: ['Cmd', 'Shift', 'B'], win: ['Ctrl', 'Shift', 'B'] },
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('npm run build');
        },
      },
      {
        id: 'terminal.runTest',
        label: 'Run Tests',
        description: 'Run project tests',
        category: 'terminal',
        icon: 'i-ph:test-tube',
        shortcut: { mac: ['Cmd', 'Shift', 'T'], win: ['Ctrl', 'Shift', 'T'] },
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('npm test');
        },
      },
      {
        id: 'terminal.install',
        label: 'Install Dependencies',
        description: 'Run npm install',
        category: 'terminal',
        icon: 'i-ph:package',
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('npm install');
        },
      },

      // ===== Git Commands =====
      {
        id: 'git.status',
        label: 'Git Status',
        description: 'Show git status',
        category: 'git',
        icon: 'i-ph:git-branch',
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('git status');
        },
      },
      {
        id: 'git.pull',
        label: 'Git Pull',
        description: 'Pull latest changes',
        category: 'git',
        icon: 'i-ph:arrow-down',
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('git pull');
        },
      },
      {
        id: 'git.commit',
        label: 'Git Commit',
        description: 'Commit staged changes',
        category: 'git',
        icon: 'i-ph:check-circle',
        action: async () => {
          const message = prompt('Enter commit message:');
          if (message) {
            workbenchStore.toggleTerminal(true);
            await workbenchStore.sendTerminalCommand(`git commit -m "${message}"`);
          }
        },
      },
      {
        id: 'git.push',
        label: 'Git Push',
        description: 'Push commits to remote',
        category: 'git',
        icon: 'i-ph:arrow-up',
        action: async () => {
          workbenchStore.toggleTerminal(true);
          await workbenchStore.sendTerminalCommand('git push');
        },
      },
      {
        id: 'git.import',
        label: 'Import from GitHub',
        description: 'Import a repository from GitHub',
        category: 'git',
        icon: 'i-ph:github-logo',
        action: () => {
          if (options?.onImportGitHub) {
            options.onImportGitHub();
          }
        },
      },

      // ===== AI Commands =====
      {
        id: 'ai.clearChat',
        label: 'Clear Chat',
        description: 'Start a new conversation',
        category: 'ai',
        icon: 'i-ph:chat-circle-dots',
        shortcut: { mac: ['Cmd', 'L'], win: ['Ctrl', 'L'] },
        action: () => {
          if (options?.onClearChat) {
            options.onClearChat();
          } else if (confirm('Clear chat history?')) {
            navigate('/');
          }
        },
      },
      {
        id: 'ai.focusChat',
        label: 'Focus Chat Input',
        description: 'Focus on the chat input field',
        category: 'ai',
        icon: 'i-ph:cursor-text',
        shortcut: { mac: ['Cmd', 'I'], win: ['Ctrl', 'I'] },
        action: () => {
          const chatInput = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement;
          chatInput?.focus();
        },
      },
      {
        id: 'ai.explain',
        label: 'Explain Code',
        description: 'Ask AI to explain the current file',
        category: 'ai',
        icon: 'i-ph:question',
        action: () => {
          const selectedFile = workbenchStore.selectedFile.get();
          if (selectedFile) {
            window.dispatchEvent(
              new CustomEvent('recoder:ai-action', {
                detail: { action: 'explain', file: selectedFile },
              })
            );
          }
        },
      },
      {
        id: 'ai.refactor',
        label: 'Refactor Code',
        description: 'Ask AI to refactor the current file',
        category: 'ai',
        icon: 'i-ph:wrench',
        action: () => {
          const selectedFile = workbenchStore.selectedFile.get();
          if (selectedFile) {
            window.dispatchEvent(
              new CustomEvent('recoder:ai-action', {
                detail: { action: 'refactor', file: selectedFile },
              })
            );
          }
        },
      },
      {
        id: 'ai.fixErrors',
        label: 'Fix Errors',
        description: 'Ask AI to fix errors in the current file',
        category: 'ai',
        icon: 'i-ph:bug',
        action: () => {
          const selectedFile = workbenchStore.selectedFile.get();
          if (selectedFile) {
            window.dispatchEvent(
              new CustomEvent('recoder:ai-action', {
                detail: { action: 'fix', file: selectedFile },
              })
            );
          }
        },
      },

      // ===== Project Commands =====
      {
        id: 'project.runCommand',
        label: 'Run Shell Command',
        description: 'Execute a custom shell command',
        category: 'project',
        icon: 'i-ph:terminal',
        shortcut: { mac: ['Cmd', 'Shift', 'C'], win: ['Ctrl', 'Shift', 'C'] },
        action: async () => {
          const command = prompt('Enter shell command:');
          if (command) {
            workbenchStore.toggleTerminal(true);
            await workbenchStore.sendTerminalCommand(command);
          }
        },
      },
      {
        id: 'project.export',
        label: 'Export Project',
        description: 'Download the project as a ZIP file',
        category: 'project',
        icon: 'i-ph:download-simple',
        action: () => {
          if (options?.onExportProject) {
            options.onExportProject();
          } else {
            window.dispatchEvent(new CustomEvent('recoder:export-project'));
          }
        },
      },
      {
        id: 'project.settings',
        label: 'Settings',
        description: 'Open project settings',
        category: 'project',
        icon: 'i-ph:gear',
        shortcut: { mac: ['Cmd', ','], win: ['Ctrl', ','] },
        action: () => {
          if (options?.onOpenSettings) {
            options.onOpenSettings();
          } else {
            navigate('/settings');
          }
        },
      },

      // ===== Help Commands =====
      {
        id: 'help.shortcuts',
        label: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        category: 'help',
        icon: 'i-ph:keyboard',
        shortcut: { mac: ['Cmd', '/'], win: ['Ctrl', '/'] },
        action: () => {
          openShortcutsPanel();
        },
      },
      {
        id: 'help.documentation',
        label: 'Documentation',
        description: 'Open the documentation',
        category: 'help',
        icon: 'i-ph:book-open',
        action: () => {
          window.open('https://docs.recoder.xyz', '_blank');
        },
      },
      {
        id: 'help.reportIssue',
        label: 'Report Issue',
        description: 'Report a bug or request a feature',
        category: 'help',
        icon: 'i-ph:bug-beetle',
        action: () => {
          window.open('https://github.com/recoder-xyz/recoder/issues', '_blank');
        },
      },
      {
        id: 'help.about',
        label: 'About Recoder',
        description: 'View application information',
        category: 'help',
        icon: 'i-ph:info',
        action: () => {
          window.dispatchEvent(new CustomEvent('recoder:show-about'));
        },
      },

      // ===== General Commands =====
      {
        id: 'general.commandPalette',
        label: 'Command Palette',
        description: 'Open command palette',
        category: 'general',
        icon: 'i-ph:command',
        shortcut: { mac: ['Cmd', 'Shift', 'P'], win: ['Ctrl', 'Shift', 'P'] },
        action: () => {
          openCommandPalette();
        },
      },
      {
        id: 'general.keyboardShortcuts',
        label: 'Keyboard Shortcuts',
        description: 'Show all keyboard shortcuts',
        category: 'general',
        icon: 'i-ph:keyboard',
        shortcut: { mac: ['Cmd', '/'], win: ['Ctrl', '/'] },
        action: () => {
          openShortcutsPanel();
        },
      },
      {
        id: 'general.settings',
        label: 'Open Settings',
        description: 'Open application settings',
        category: 'general',
        icon: 'i-ph:gear',
        shortcut: { mac: ['Cmd', ','], win: ['Ctrl', ','] },
        action: () => {
          if (options?.onOpenSettings) {
            options.onOpenSettings();
          } else {
            // Navigate to settings page
            navigate('/settings');
          }
        },
      },
      {
        id: 'general.newProject',
        label: 'New Project',
        description: 'Start a new project',
        category: 'general',
        icon: 'i-ph:plus-circle',
        action: () => {
          navigate('/');
        },
      },
      {
        id: 'general.projects',
        label: 'View Projects',
        description: 'Go to projects page',
        category: 'general',
        icon: 'i-ph:folder',
        action: () => {
          navigate('/projects');
        },
      },
      {
        id: 'general.deploy',
        label: 'Deploy Project',
        description: 'Deploy the current project',
        category: 'general',
        icon: 'i-ph:rocket-launch',
        action: () => {
          if (options?.onDeploy) {
            options.onDeploy();
          }
        },
      },
    ];

    return commands;
  }, [navigate, options]);

  // Register commands on mount
  useEffect(() => {
    const commands = createDefaultCommands();
    registerCommands(commands);
  }, [createDefaultCommands]);

  return {
    openCommandPalette,
  };
}

export default useCommandPalette;
