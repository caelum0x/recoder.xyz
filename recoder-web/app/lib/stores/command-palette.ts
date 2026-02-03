/**
 * Command Palette Store
 *
 * Manages VS Code-style command palette state and command registry.
 * Commands can be triggered via Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows).
 */

import { atom, map } from 'nanostores';

// =============================================================================
// Types
// =============================================================================

export type CommandCategory = 'file' | 'edit' | 'view' | 'project' | 'ai' | 'help' | 'terminal' | 'git' | 'navigation' | 'general';

export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon?: string;
  shortcut?: {
    mac: string[];
    win: string[];
  };
  action: () => void | Promise<void>;
  when?: () => boolean; // Condition for showing the command
}

// =============================================================================
// Stores
// =============================================================================

/** Command palette open state */
export const commandPaletteOpen = atom<boolean>(false);

/** Search query in command palette */
export const commandPaletteQuery = atom<string>('');

/** Recently used command IDs (most recent first) */
export const recentCommands = atom<string[]>([]);

/** Command registry */
export const commandRegistry = map<Record<string, PaletteCommand>>({});

// =============================================================================
// Functions
// =============================================================================

/**
 * Open the command palette
 */
export function openCommandPalette(): void {
  commandPaletteOpen.set(true);
  commandPaletteQuery.set('');
}

/**
 * Close the command palette
 */
export function closeCommandPalette(): void {
  commandPaletteOpen.set(false);
  commandPaletteQuery.set('');
}

/**
 * Toggle the command palette
 */
export function toggleCommandPalette(): void {
  if (commandPaletteOpen.get()) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

/**
 * Register a command
 */
export function registerCommand(command: PaletteCommand): void {
  const current = commandRegistry.get();
  commandRegistry.set({ ...current, [command.id]: command });
}

/**
 * Register multiple commands
 */
export function registerCommands(commands: PaletteCommand[]): void {
  const current = commandRegistry.get();
  const newCommands = { ...current };
  for (const command of commands) {
    newCommands[command.id] = command;
  }
  commandRegistry.set(newCommands);
}

/**
 * Unregister a command
 */
export function unregisterCommand(id: string): void {
  const current = commandRegistry.get();
  const { [id]: _, ...rest } = current;
  commandRegistry.set(rest);
}

/**
 * Get all registered commands
 */
export function getAllCommands(): PaletteCommand[] {
  const commands = Object.values(commandRegistry.get());
  // Filter out commands that don't meet their "when" condition
  return commands.filter((cmd) => !cmd.when || cmd.when());
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: CommandCategory): PaletteCommand[] {
  return getAllCommands().filter((cmd) => cmd.category === category);
}

/**
 * Execute a command by ID
 */
export async function executeCommand(id: string): Promise<void> {
  const command = commandRegistry.get()[id];
  if (!command) {
    console.warn(`[CommandPalette] Command not found: ${id}`);
    return;
  }

  // Add to recent commands
  addToRecent(id);

  // Execute the command
  try {
    await command.action();
  } catch (error) {
    console.error(`[CommandPalette] Error executing command ${id}:`, error);
  }

  // Close the palette after execution
  closeCommandPalette();
}

/**
 * Add command to recent list
 */
export function addToRecent(id: string): void {
  const current = recentCommands.get();
  // Remove if already exists, then add to front
  const filtered = current.filter((cid) => cid !== id);
  recentCommands.set([id, ...filtered].slice(0, 10)); // Keep last 10

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('recentPaletteCommands', JSON.stringify(recentCommands.get()));
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Get recent commands
 */
export function getRecentCommands(): PaletteCommand[] {
  const recent = recentCommands.get();
  const commands = commandRegistry.get();
  return recent
    .map((id) => commands[id])
    .filter((cmd): cmd is PaletteCommand => cmd !== undefined && (!cmd.when || cmd.when()));
}

/**
 * Search commands by query
 */
export function searchCommands(query: string): PaletteCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllCommands();

  return getAllCommands().filter((cmd) => {
    const labelMatch = cmd.label.toLowerCase().includes(q);
    const descMatch = cmd.description?.toLowerCase().includes(q);
    const categoryMatch = cmd.category.toLowerCase().includes(q);
    const idMatch = cmd.id.toLowerCase().includes(q);
    return labelMatch || descMatch || categoryMatch || idMatch;
  });
}

/**
 * Load recent commands from localStorage
 */
export function loadRecentCommands(): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem('recentPaletteCommands');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        recentCommands.set(parsed);
      }
    }
  } catch {
    // Ignore parse errors
  }
}

// =============================================================================
// Category Metadata
// =============================================================================

export const CATEGORY_INFO: Record<CommandCategory, { label: string; icon: string }> = {
  file: { label: 'File', icon: 'i-ph:file' },
  edit: { label: 'Edit', icon: 'i-ph:pencil-simple' },
  view: { label: 'View', icon: 'i-ph:eye' },
  project: { label: 'Project', icon: 'i-ph:folder-notch' },
  ai: { label: 'AI', icon: 'i-ph:robot' },
  help: { label: 'Help', icon: 'i-ph:question' },
  terminal: { label: 'Terminal', icon: 'i-ph:terminal-window' },
  git: { label: 'Git', icon: 'i-ph:git-branch' },
  navigation: { label: 'Navigation', icon: 'i-ph:compass' },
  general: { label: 'General', icon: 'i-ph:gear' },
};

// =============================================================================
// Selected command index for keyboard navigation
// =============================================================================

/** Currently selected command index in the palette */
export const selectedCommandIndex = atom<number>(0);

/**
 * Set the selected command index
 */
export function setSelectedIndex(index: number): void {
  selectedCommandIndex.set(index);
}

/**
 * Reset the selected index
 */
export function resetSelectedIndex(): void {
  selectedCommandIndex.set(0);
}

// Load recent commands on module initialization
if (typeof window !== 'undefined') {
  loadRecentCommands();
}
