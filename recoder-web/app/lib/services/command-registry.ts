/**
 * Command Registry Service
 *
 * Centralized service for managing VS Code-style commands.
 * Supports command registration, search, execution, and recently used tracking.
 */


import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('CommandRegistry');

// =============================================================================
// Types
// =============================================================================

export type CommandCategory = 'file' | 'edit' | 'view' | 'project' | 'ai' | 'help';

export interface CommandShortcut {
  mac: string[];
  win: string[];
}

export interface Command {
  /** Unique command identifier (e.g., 'file.newFile') */
  id: string;
  /** Display label for the command */
  label: string;
  /** Optional description */
  description?: string;
  /** Command category for grouping */
  category: CommandCategory;
  /** Icon class (e.g., 'i-ph:file-plus') */
  icon?: string;
  /** Keyboard shortcut */
  shortcut?: CommandShortcut;
  /** Action to execute */
  action: () => void | Promise<void>;
  /** Condition for showing the command */
  when?: () => boolean;
}

export interface CommandRegistryState {
  commands: Map<string, Command>;
  recentCommandIds: string[];
}

// =============================================================================
// Command Registry Singleton
// =============================================================================

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private recentCommandIds: string[] = [];
  private maxRecentCommands: number = 10;
  private storageKey = 'recoder_recent_commands';

  constructor() {
    this.loadRecentFromStorage();
  }

  // ===== Registration =====

  /**
   * Register a single command
   */
  register(command: Command): void {
    if (this.commands.has(command.id)) {
      logger.warn(`[CommandRegistry] Command "${command.id}" already registered, overwriting`);
    }
    this.commands.set(command.id, command);
  }

  /**
   * Register multiple commands at once
   */
  registerAll(commands: Command[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Unregister a command by ID
   */
  unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  /**
   * Clear all registered commands
   */
  clear(): void {
    this.commands.clear();
  }

  // ===== Retrieval =====

  /**
   * Get a command by ID
   */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values()).filter(
      (cmd) => !cmd.when || cmd.when()
    );
  }

  /**
   * Get commands by category
   */
  getByCategory(category: CommandCategory): Command[] {
    return this.getAll().filter((cmd) => cmd.category === category);
  }

  /**
   * Get all categories with their commands
   */
  getAllByCategory(): Map<CommandCategory, Command[]> {
    const result = new Map<CommandCategory, Command[]>();
    const categories: CommandCategory[] = ['file', 'edit', 'view', 'project', 'ai', 'help'];

    for (const category of categories) {
      const commands = this.getByCategory(category);
      if (commands.length > 0) {
        result.set(category, commands);
      }
    }

    return result;
  }

  // ===== Search =====

  /**
   * Search commands by name, description, or ID
   */
  search(query: string): Command[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();

    const commands = this.getAll();
    const scored: Array<{ command: Command; score: number }> = [];

    for (const command of commands) {
      const score = this.calculateMatchScore(command, q);
      if (score > 0) {
        scored.push({ command, score });
      }
    }

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    return scored.map((item) => item.command);
  }

  /**
   * Calculate match score for a command
   */
  private calculateMatchScore(command: Command, query: string): number {
    const id = command.id.toLowerCase();
    const label = command.label.toLowerCase();
    const description = command.description?.toLowerCase() || '';

    // Exact ID match
    if (id === query) return 100;

    // ID starts with query
    if (id.startsWith(query)) return 90;

    // Label starts with query
    if (label.startsWith(query)) return 80;

    // Label contains word that starts with query
    const words = label.split(/\s+/);
    if (words.some((word) => word.startsWith(query))) return 70;

    // ID contains query
    if (id.includes(query)) return 60;

    // Label contains query
    if (label.includes(query)) return 50;

    // Description contains query
    if (description.includes(query)) return 30;

    // Fuzzy match on label
    if (this.fuzzyMatch(label, query)) return 20;

    // Fuzzy match on ID
    if (this.fuzzyMatch(id, query)) return 10;

    return 0;
  }

  /**
   * Simple fuzzy matching - all characters must appear in order
   */
  private fuzzyMatch(text: string, query: string): boolean {
    let textIndex = 0;
    let queryIndex = 0;

    while (textIndex < text.length && queryIndex < query.length) {
      if (text[textIndex] === query[queryIndex]) {
        queryIndex++;
      }
      textIndex++;
    }

    return queryIndex === query.length;
  }

  // ===== Execution =====

  /**
   * Execute a command by ID
   */
  async execute(id: string): Promise<boolean> {
    const command = this.commands.get(id);

    if (!command) {
      logger.warn(`[CommandRegistry] Command not found: ${id}`);
      return false;
    }

    // Check if command should be shown
    if (command.when && !command.when()) {
      logger.warn(`[CommandRegistry] Command "${id}" condition not met`);
      return false;
    }

    // Track as recently used
    this.addToRecent(id);

    // Execute the action
    try {
      await command.action();
      return true;
    } catch (error) {
      logger.error(`[CommandRegistry] Error executing command "${id}":`, error);
      return false;
    }
  }

  // ===== Recently Used =====

  /**
   * Add a command to recently used
   */
  addToRecent(id: string): void {
    // Remove if already in list
    const index = this.recentCommandIds.indexOf(id);
    if (index > -1) {
      this.recentCommandIds.splice(index, 1);
    }

    // Add to front
    this.recentCommandIds.unshift(id);

    // Trim to max size
    if (this.recentCommandIds.length > this.maxRecentCommands) {
      this.recentCommandIds = this.recentCommandIds.slice(0, this.maxRecentCommands);
    }

    // Persist to storage
    this.saveRecentToStorage();
  }

  /**
   * Get recently used commands
   */
  getRecent(): Command[] {
    return this.recentCommandIds
      .map((id) => this.commands.get(id))
      .filter((cmd): cmd is Command => cmd !== undefined && (!cmd.when || cmd.when()));
  }

  /**
   * Clear recently used commands
   */
  clearRecent(): void {
    this.recentCommandIds = [];
    this.saveRecentToStorage();
  }

  // ===== Persistence =====

  /**
   * Load recent commands from localStorage
   */
  private loadRecentFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.recentCommandIds = parsed;
        }
      }
    } catch (error) {
      logger.warn('[CommandRegistry] Failed to load recent commands:', error);
    }
  }

  /**
   * Save recent commands to localStorage
   */
  private saveRecentToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.recentCommandIds));
    } catch (error) {
      logger.warn('[CommandRegistry] Failed to save recent commands:', error);
    }
  }

  // ===== Utilities =====

  /**
   * Get command count
   */
  get count(): number {
    return this.commands.size;
  }

  /**
   * Check if a command is registered
   */
  has(id: string): boolean {
    return this.commands.has(id);
  }

  /**
   * Get the state for debugging
   */
  getState(): CommandRegistryState {
    return {
      commands: new Map(this.commands),
      recentCommandIds: [...this.recentCommandIds],
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const commandRegistry = new CommandRegistry();

// =============================================================================
// Category Metadata
// =============================================================================

export const CATEGORY_METADATA: Record<CommandCategory, { label: string; icon: string; color: string }> = {
  file: { label: 'File', icon: 'i-ph:file', color: 'text-blue-400' },
  edit: { label: 'Edit', icon: 'i-ph:pencil-simple', color: 'text-green-400' },
  view: { label: 'View', icon: 'i-ph:eye', color: 'text-purple-400' },
  project: { label: 'Project', icon: 'i-ph:folder-notch', color: 'text-orange-400' },
  ai: { label: 'AI', icon: 'i-ph:robot', color: 'text-pink-400' },
  help: { label: 'Help', icon: 'i-ph:question', color: 'text-cyan-400' },
};

// =============================================================================
// Default Commands Factory
// =============================================================================

/**
 * Create default commands for the application
 */
export function createDefaultCommands(options?: {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onSaveFile?: () => void;
  onToggleTerminal?: () => void;
  onTogglePreview?: () => void;
  onToggleFileTree?: () => void;
  onRunShellCommand?: () => void;
  onClearTerminal?: () => void;
  onExportProject?: () => void;
  onOpenSettings?: () => void;
  onExplainCode?: () => void;
  onFixErrors?: () => void;
  onRefactorCode?: () => void;
}): Command[] {
  const commands: Command[] = [
    // ===== File Commands =====
    {
      id: 'file.newFile',
      label: 'New File',
      description: 'Create a new file in the project',
      category: 'file',
      icon: 'i-ph:file-plus',
      shortcut: { mac: ['Cmd', 'N'], win: ['Ctrl', 'N'] },
      action: () => options?.onNewFile?.(),
    },
    {
      id: 'file.newFolder',
      label: 'New Folder',
      description: 'Create a new folder in the project',
      category: 'file',
      icon: 'i-ph:folder-plus',
      shortcut: { mac: ['Cmd', 'Shift', 'N'], win: ['Ctrl', 'Shift', 'N'] },
      action: () => options?.onNewFolder?.(),
    },
    {
      id: 'file.save',
      label: 'Save File',
      description: 'Save the current file',
      category: 'file',
      icon: 'i-ph:floppy-disk',
      shortcut: { mac: ['Cmd', 'S'], win: ['Ctrl', 'S'] },
      action: () => options?.onSaveFile?.(),
    },

    // ===== Edit Commands =====
    {
      id: 'edit.undo',
      label: 'Undo',
      description: 'Undo the last change',
      category: 'edit',
      icon: 'i-ph:arrow-counter-clockwise',
      shortcut: { mac: ['Cmd', 'Z'], win: ['Ctrl', 'Z'] },
      action: () => { document.execCommand('undo'); },
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      description: 'Redo the last undone change',
      category: 'edit',
      icon: 'i-ph:arrow-clockwise',
      shortcut: { mac: ['Cmd', 'Shift', 'Z'], win: ['Ctrl', 'Y'] },
      action: () => { document.execCommand('redo'); },
    },
    {
      id: 'edit.cut',
      label: 'Cut',
      description: 'Cut selected text',
      category: 'edit',
      icon: 'i-ph:scissors',
      shortcut: { mac: ['Cmd', 'X'], win: ['Ctrl', 'X'] },
      action: () => { document.execCommand('cut'); },
    },
    {
      id: 'edit.copy',
      label: 'Copy',
      description: 'Copy selected text',
      category: 'edit',
      icon: 'i-ph:copy',
      shortcut: { mac: ['Cmd', 'C'], win: ['Ctrl', 'C'] },
      action: () => { document.execCommand('copy'); },
    },
    {
      id: 'edit.paste',
      label: 'Paste',
      description: 'Paste from clipboard',
      category: 'edit',
      icon: 'i-ph:clipboard',
      shortcut: { mac: ['Cmd', 'V'], win: ['Ctrl', 'V'] },
      action: () => { document.execCommand('paste'); },
    },
    {
      id: 'edit.find',
      label: 'Find',
      description: 'Search in the current file',
      category: 'edit',
      icon: 'i-ph:magnifying-glass',
      shortcut: { mac: ['Cmd', 'F'], win: ['Ctrl', 'F'] },
      action: () => { window.dispatchEvent(new CustomEvent('recoder:find-in-file')); },
    },

    // ===== View Commands =====
    {
      id: 'view.toggleTerminal',
      label: 'Toggle Terminal',
      description: 'Show or hide the terminal panel',
      category: 'view',
      icon: 'i-ph:terminal-window',
      shortcut: { mac: ['Cmd', '`'], win: ['Ctrl', '`'] },
      action: () => options?.onToggleTerminal?.(),
    },
    {
      id: 'view.togglePreview',
      label: 'Toggle Preview',
      description: 'Show or hide the preview panel',
      category: 'view',
      icon: 'i-ph:eye',
      shortcut: { mac: ['Cmd', 'Shift', 'V'], win: ['Ctrl', 'Shift', 'V'] },
      action: () => options?.onTogglePreview?.(),
    },
    {
      id: 'view.toggleFileTree',
      label: 'Toggle File Tree',
      description: 'Show or hide the file explorer',
      category: 'view',
      icon: 'i-ph:tree-structure',
      shortcut: { mac: ['Cmd', 'B'], win: ['Ctrl', 'B'] },
      action: () => options?.onToggleFileTree?.(),
    },
    {
      id: 'view.toggleSidebar',
      label: 'Toggle Sidebar',
      description: 'Show or hide the sidebar',
      category: 'view',
      icon: 'i-ph:sidebar',
      shortcut: { mac: ['Cmd', '\\'], win: ['Ctrl', '\\'] },
      action: () => { window.dispatchEvent(new CustomEvent('recoder:toggle-sidebar')); },
    },

    // ===== Project Commands =====
    {
      id: 'project.runCommand',
      label: 'Run Shell Command',
      description: 'Execute a shell command in the terminal',
      category: 'project',
      icon: 'i-ph:terminal',
      shortcut: { mac: ['Cmd', 'Shift', 'C'], win: ['Ctrl', 'Shift', 'C'] },
      action: () => options?.onRunShellCommand?.(),
    },
    {
      id: 'project.clearTerminal',
      label: 'Clear Terminal',
      description: 'Clear the terminal output',
      category: 'project',
      icon: 'i-ph:trash',
      shortcut: { mac: ['Cmd', 'K'], win: ['Ctrl', 'K'] },
      action: () => options?.onClearTerminal?.(),
    },
    {
      id: 'project.export',
      label: 'Export Project',
      description: 'Download the project as a ZIP file',
      category: 'project',
      icon: 'i-ph:download-simple',
      action: () => options?.onExportProject?.(),
    },
    {
      id: 'project.settings',
      label: 'Settings',
      description: 'Open project settings',
      category: 'project',
      icon: 'i-ph:gear',
      shortcut: { mac: ['Cmd', ','], win: ['Ctrl', ','] },
      action: () => options?.onOpenSettings?.(),
    },

    // ===== AI Commands =====
    {
      id: 'ai.explain',
      label: 'Explain Code',
      description: 'Ask AI to explain the selected code',
      category: 'ai',
      icon: 'i-ph:lightbulb',
      action: () => options?.onExplainCode?.(),
    },
    {
      id: 'ai.fixErrors',
      label: 'Fix Errors',
      description: 'Ask AI to fix errors in the current file',
      category: 'ai',
      icon: 'i-ph:bug',
      action: () => options?.onFixErrors?.(),
    },
    {
      id: 'ai.refactor',
      label: 'Refactor Code',
      description: 'Ask AI to refactor the selected code',
      category: 'ai',
      icon: 'i-ph:wrench',
      action: () => options?.onRefactorCode?.(),
    },
    {
      id: 'ai.generateTests',
      label: 'Generate Tests',
      description: 'Ask AI to generate tests for the current file',
      category: 'ai',
      icon: 'i-ph:test-tube',
      action: () => { window.dispatchEvent(new CustomEvent('recoder:ai-action', { detail: { action: 'generateTests' } })); },
    },
    {
      id: 'ai.addComments',
      label: 'Add Comments',
      description: 'Ask AI to add documentation comments',
      category: 'ai',
      icon: 'i-ph:chat-text',
      action: () => { window.dispatchEvent(new CustomEvent('recoder:ai-action', { detail: { action: 'addComments' } })); },
    },

    // ===== Help Commands =====
    {
      id: 'help.shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      category: 'help',
      icon: 'i-ph:keyboard',
      shortcut: { mac: ['Cmd', '/'], win: ['Ctrl', '/'] },
      action: () => { window.dispatchEvent(new CustomEvent('recoder:show-shortcuts')); },
    },
    {
      id: 'help.documentation',
      label: 'Documentation',
      description: 'Open the documentation',
      category: 'help',
      icon: 'i-ph:book-open',
      action: () => { window.open('https://docs.recoder.xyz', '_blank'); },
    },
    {
      id: 'help.reportIssue',
      label: 'Report Issue',
      description: 'Report a bug or request a feature',
      category: 'help',
      icon: 'i-ph:bug-beetle',
      action: () => { window.open('https://github.com/recoder-xyz/recoder/issues', '_blank'); },
    },
    {
      id: 'help.about',
      label: 'About',
      description: 'About Recoder',
      category: 'help',
      icon: 'i-ph:info',
      action: () => { window.dispatchEvent(new CustomEvent('recoder:show-about')); },
    },
  ];

  return commands;
}

// =============================================================================
// Export Convenience Functions
// =============================================================================

export function registerCommand(command: Command): void {
  commandRegistry.register(command);
}

export function registerCommands(commands: Command[]): void {
  commandRegistry.registerAll(commands);
}

export function unregisterCommand(id: string): boolean {
  return commandRegistry.unregister(id);
}

export function executeCommand(id: string): Promise<boolean> {
  return commandRegistry.execute(id);
}

export function searchCommands(query: string): Command[] {
  return commandRegistry.search(query);
}

export function getAllCommands(): Command[] {
  return commandRegistry.getAll();
}

export function getRecentCommands(): Command[] {
  return commandRegistry.getRecent();
}

export function getCommandsByCategory(category: CommandCategory): Command[] {
  return commandRegistry.getByCategory(category);
}
