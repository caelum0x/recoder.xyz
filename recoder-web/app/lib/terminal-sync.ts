/**
 * Terminal State Sync - Persistence for terminal sessions
 * Saves and restores terminal state across page reloads
 */
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('TerminalSync');

interface TerminalState {
  terminalId: string;
  projectId: string;
  scrollPosition: number;
  cwd?: string;
  lastActive: number;
  name?: string; // Custom terminal name
}

interface TerminalSizePrefs {
  panelSize: number; // Percentage of bottom panel
  cols?: number;
  rows?: number;
}

interface TerminalSyncStorage {
  sessions: TerminalState[];
  activeIndex: number;
  sizePrefs: TerminalSizePrefs;
  terminalNames: Record<string, string>; // terminalId -> custom name
}

const STORAGE_KEY = 'recoder-terminal-state';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes
const DEFAULT_PANEL_SIZE = 25; // Default panel size percentage

export class TerminalSync {
  private storage: TerminalSyncStorage = {
    sessions: [],
    activeIndex: 0,
    sizePrefs: { panelSize: DEFAULT_PANEL_SIZE },
    terminalNames: {},
  };

  constructor() {
    this.load();
  }

  /**
   * Load terminal state from localStorage
   */
  private load() {
    if (typeof window === 'undefined') return;

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as TerminalSyncStorage;

        // Filter out expired sessions
        const now = Date.now();
        parsed.sessions = parsed.sessions.filter(
          s => now - s.lastActive < SESSION_EXPIRY
        );

        // Ensure defaults for new fields
        this.storage = {
          sessions: parsed.sessions || [],
          activeIndex: parsed.activeIndex || 0,
          sizePrefs: parsed.sizePrefs || { panelSize: DEFAULT_PANEL_SIZE },
          terminalNames: parsed.terminalNames || {},
        };
      }
    } catch (error) {
      logger.warn('[TerminalSync] Failed to load state:', error);
    }
  }

  /**
   * Save current state to localStorage
   */
  private persist() {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.storage));
    } catch (error) {
      logger.warn('[TerminalSync] Failed to persist state:', error);
    }
  }

  /**
   * Save a terminal session's state
   */
  saveSession(terminalId: string, projectId: string, scrollPosition: number = 0, cwd?: string) {
    const existing = this.storage.sessions.findIndex(s => s.terminalId === terminalId);
    const state: TerminalState = {
      terminalId,
      projectId,
      scrollPosition,
      cwd,
      lastActive: Date.now(),
    };

    if (existing >= 0) {
      this.storage.sessions[existing] = state;
    } else {
      this.storage.sessions.push(state);
    }

    this.persist();
  }

  /**
   * Get saved sessions for a project
   */
  getSessions(projectId: string): TerminalState[] {
    return this.storage.sessions.filter(s => s.projectId === projectId);
  }

  /**
   * Get a specific session
   */
  getSession(terminalId: string): TerminalState | undefined {
    return this.storage.sessions.find(s => s.terminalId === terminalId);
  }

  /**
   * Remove a session
   */
  removeSession(terminalId: string) {
    this.storage.sessions = this.storage.sessions.filter(s => s.terminalId !== terminalId);
    this.persist();
  }

  /**
   * Clear all sessions for a project
   */
  clearProjectSessions(projectId: string) {
    this.storage.sessions = this.storage.sessions.filter(s => s.projectId !== projectId);
    this.persist();
  }

  /**
   * Set active terminal index
   */
  setActiveIndex(index: number) {
    this.storage.activeIndex = index;
    this.persist();
  }

  /**
   * Get active terminal index
   */
  getActiveIndex(): number {
    return this.storage.activeIndex;
  }

  /**
   * Get all terminal IDs that can be restored
   */
  getRestorableTerminalIds(projectId: string): string[] {
    return this.getSessions(projectId).map(s => s.terminalId);
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    const before = this.storage.sessions.length;
    this.storage.sessions = this.storage.sessions.filter(
      s => now - s.lastActive < SESSION_EXPIRY
    );

    if (this.storage.sessions.length !== before) {
      logger.info(`[TerminalSync] Cleaned up ${before - this.storage.sessions.length} expired sessions`);
      this.persist();
    }
  }

  /**
   * Save terminal panel size preference
   */
  setSizePrefs(panelSize: number, cols?: number, rows?: number) {
    this.storage.sizePrefs = {
      panelSize: Math.max(10, Math.min(70, panelSize)), // Clamp between 10-70%
      cols,
      rows,
    };
    this.persist();
  }

  /**
   * Get terminal size preferences
   */
  getSizePrefs(): TerminalSizePrefs {
    return this.storage.sizePrefs;
  }

  /**
   * Set a custom name for a terminal
   */
  setTerminalName(terminalId: string, name: string) {
    this.storage.terminalNames[terminalId] = name;
    this.persist();
  }

  /**
   * Get custom name for a terminal
   */
  getTerminalName(terminalId: string): string | undefined {
    return this.storage.terminalNames[terminalId];
  }

  /**
   * Remove terminal name when terminal is closed
   */
  removeTerminalName(terminalId: string) {
    delete this.storage.terminalNames[terminalId];
    this.persist();
  }

  /**
   * Get the default panel size
   */
  getDefaultPanelSize(): number {
    return DEFAULT_PANEL_SIZE;
  }

  /**
   * Get all terminal names
   */
  getAllTerminalNames(): Record<string, string> {
    return { ...this.storage.terminalNames };
  }
}

// Export singleton instance
export const terminalSync = new TerminalSync();

/**
 * Hook for using terminal sync in React components
 */
export function useTerminalSync(projectId: string | null) {
  const saveSession = (terminalId: string, scrollPosition?: number, cwd?: string) => {
    if (projectId) {
      terminalSync.saveSession(terminalId, projectId, scrollPosition, cwd);
    }
  };

  const getSessions = () => {
    if (!projectId) return [];
    return terminalSync.getSessions(projectId);
  };

  const getRestorableIds = () => {
    if (!projectId) return [];
    return terminalSync.getRestorableTerminalIds(projectId);
  };

  return {
    saveSession,
    getSessions,
    getRestorableIds,
    removeSession: terminalSync.removeSession.bind(terminalSync),
    setActiveIndex: terminalSync.setActiveIndex.bind(terminalSync),
    getActiveIndex: terminalSync.getActiveIndex.bind(terminalSync),
    // Size preferences
    setSizePrefs: terminalSync.setSizePrefs.bind(terminalSync),
    getSizePrefs: terminalSync.getSizePrefs.bind(terminalSync),
    getDefaultPanelSize: terminalSync.getDefaultPanelSize.bind(terminalSync),
    // Terminal naming
    setTerminalName: terminalSync.setTerminalName.bind(terminalSync),
    getTerminalName: terminalSync.getTerminalName.bind(terminalSync),
    removeTerminalName: terminalSync.removeTerminalName.bind(terminalSync),
    getAllTerminalNames: terminalSync.getAllTerminalNames.bind(terminalSync),
  };
}
