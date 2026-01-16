/**
 * Terminal State Sync - Persistence for terminal sessions
 * Saves and restores terminal state across page reloads
 */

interface TerminalState {
  terminalId: string;
  projectId: string;
  scrollPosition: number;
  cwd?: string;
  lastActive: number;
}

interface TerminalSyncStorage {
  sessions: TerminalState[];
  activeIndex: number;
}

const STORAGE_KEY = 'recoder-terminal-state';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

export class TerminalSync {
  private storage: TerminalSyncStorage = { sessions: [], activeIndex: 0 };

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
        
        this.storage = parsed;
      }
    } catch (error) {
      console.warn('[TerminalSync] Failed to load state:', error);
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
      console.warn('[TerminalSync] Failed to persist state:', error);
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
      console.log(`[TerminalSync] Cleaned up ${before - this.storage.sessions.length} expired sessions`);
      this.persist();
    }
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
  };
}
