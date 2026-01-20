/**
 * Awareness Manager for Real-time Collaboration
 *
 * Tracks user presence, cursor positions, and selections across all
 * collaboration sessions. Provides a global view of who is working
 * on what files in each project.
 */

export interface UserInfo {
  id: string;
  name: string;
  email?: string;
  color: string;
  avatar?: string;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  anchor: CursorPosition;
  head: CursorPosition;
}

export interface UserPresence {
  user: UserInfo;
  clientId: number;
  currentFile?: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  lastActivity: number;
  status: 'active' | 'idle' | 'away';
}

export interface ProjectPresence {
  projectId: string;
  users: Map<string, UserPresence>;
  lastActivity: number;
}

// Idle timeout thresholds
const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const AWAY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CLEANUP_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Global awareness manager that tracks all users across all projects
 */
class AwarenessManager {
  private projects = new Map<string, ProjectPresence>();
  private userToProjects = new Map<string, Set<string>>(); // userId -> projectIds
  private listeners = new Map<string, Set<(presence: ProjectPresence) => void>>();

  constructor() {
    // Periodically update user statuses and clean up stale entries
    setInterval(() => this.updateStatuses(), 30 * 1000);
  }

  /**
   * Add a user to a project's awareness
   */
  addUser(projectId: string, user: UserInfo): void {
    let project = this.projects.get(projectId);

    if (!project) {
      project = {
        projectId,
        users: new Map(),
        lastActivity: Date.now(),
      };
      this.projects.set(projectId, project);
    }

    // Don't overwrite existing presence, just update last activity
    if (!project.users.has(user.id)) {
      const presence: UserPresence = {
        user,
        clientId: 0,
        lastActivity: Date.now(),
        status: 'active',
      };
      project.users.set(user.id, presence);
    } else {
      const existing = project.users.get(user.id)!;
      existing.lastActivity = Date.now();
      existing.status = 'active';
    }

    project.lastActivity = Date.now();

    // Track user-to-project mapping
    if (!this.userToProjects.has(user.id)) {
      this.userToProjects.set(user.id, new Set());
    }
    this.userToProjects.get(user.id)!.add(projectId);

    this.notifyListeners(projectId);
    console.log(`[Awareness] User ${user.name} (${user.id}) joined project ${projectId}`);
  }

  /**
   * Remove a user from a project's awareness
   */
  removeUser(projectId: string, userId: string): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    const presence = project.users.get(userId);
    if (presence) {
      project.users.delete(userId);
      console.log(`[Awareness] User ${presence.user.name} (${userId}) left project ${projectId}`);
    }

    // Update user-to-project mapping
    const userProjects = this.userToProjects.get(userId);
    if (userProjects) {
      userProjects.delete(projectId);
      if (userProjects.size === 0) {
        this.userToProjects.delete(userId);
      }
    }

    // Clean up empty projects
    if (project.users.size === 0) {
      this.projects.delete(projectId);
    }

    this.notifyListeners(projectId);
  }

  /**
   * Update a user's presence information (cursor, selection, file)
   */
  updatePresence(
    projectId: string,
    userId: string,
    update: Partial<Pick<UserPresence, 'clientId' | 'currentFile' | 'cursor' | 'selection'>>
  ): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    const presence = project.users.get(userId);
    if (!presence) return;

    Object.assign(presence, update);
    presence.lastActivity = Date.now();
    presence.status = 'active';
    project.lastActivity = Date.now();

    this.notifyListeners(projectId);
  }

  /**
   * Get all users present in a project
   */
  getProjectPresence(projectId: string): UserPresence[] {
    const project = this.projects.get(projectId);
    if (!project) return [];
    return Array.from(project.users.values());
  }

  /**
   * Get all projects a user is participating in
   */
  getUserProjects(userId: string): string[] {
    const projects = this.userToProjects.get(userId);
    return projects ? Array.from(projects) : [];
  }

  /**
   * Get users currently viewing/editing a specific file
   */
  getFilePresence(projectId: string, filePath: string): UserPresence[] {
    const project = this.projects.get(projectId);
    if (!project) return [];

    return Array.from(project.users.values()).filter(
      (presence) => presence.currentFile === filePath
    );
  }

  /**
   * Subscribe to presence changes for a project
   */
  subscribe(projectId: string, callback: (presence: ProjectPresence) => void): () => void {
    if (!this.listeners.has(projectId)) {
      this.listeners.set(projectId, new Set());
    }
    this.listeners.get(projectId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(projectId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(projectId);
        }
      }
    };
  }

  /**
   * Get statistics about current awareness state
   */
  getStats(): {
    totalProjects: number;
    totalUsers: number;
    activeUsers: number;
    projects: Array<{ projectId: string; userCount: number; lastActivity: number }>;
  } {
    let totalUsers = 0;
    let activeUsers = 0;
    const projects: Array<{ projectId: string; userCount: number; lastActivity: number }> = [];

    const now = Date.now();

    this.projects.forEach((project, projectId) => {
      const userCount = project.users.size;
      totalUsers += userCount;

      project.users.forEach((presence) => {
        if (now - presence.lastActivity < IDLE_TIMEOUT) {
          activeUsers++;
        }
      });

      projects.push({
        projectId,
        userCount,
        lastActivity: project.lastActivity,
      });
    });

    return {
      totalProjects: this.projects.size,
      totalUsers,
      activeUsers,
      projects,
    };
  }

  /**
   * Update user statuses based on activity and clean up stale entries
   */
  private updateStatuses(): void {
    const now = Date.now();
    const toRemove: Array<{ projectId: string; userId: string }> = [];

    this.projects.forEach((project, projectId) => {
      project.users.forEach((presence, userId) => {
        const elapsed = now - presence.lastActivity;

        if (elapsed > CLEANUP_TIMEOUT) {
          // User has been inactive for too long, remove them
          toRemove.push({ projectId, userId });
        } else if (elapsed > AWAY_TIMEOUT) {
          if (presence.status !== 'away') {
            presence.status = 'away';
            this.notifyListeners(projectId);
          }
        } else if (elapsed > IDLE_TIMEOUT) {
          if (presence.status !== 'idle') {
            presence.status = 'idle';
            this.notifyListeners(projectId);
          }
        }
      });
    });

    // Clean up stale users
    toRemove.forEach(({ projectId, userId }) => {
      console.log(`[Awareness] Removing stale user ${userId} from project ${projectId}`);
      this.removeUser(projectId, userId);
    });
  }

  /**
   * Notify all listeners of a project's presence changes
   */
  private notifyListeners(projectId: string): void {
    const listeners = this.listeners.get(projectId);
    if (!listeners) return;

    const project = this.projects.get(projectId);
    if (!project) return;

    listeners.forEach((callback) => {
      try {
        callback(project);
      } catch (error: any) {
        console.error(`[Awareness] Error in listener callback:`, error.message);
      }
    });
  }
}

// Export singleton instance
export const awarenessManager = new AwarenessManager();

/**
 * REST API handlers for awareness queries
 */
export const awarenessHandlers = {
  /**
   * Get presence for a project
   * GET /api/collab/presence/:projectId
   */
  getProjectPresence: (projectId: string) => {
    return {
      projectId,
      users: awarenessManager.getProjectPresence(projectId),
    };
  },

  /**
   * Get presence for a specific file
   * GET /api/collab/presence/:projectId/file?path=...
   */
  getFilePresence: (projectId: string, filePath: string) => {
    return {
      projectId,
      filePath,
      users: awarenessManager.getFilePresence(projectId, filePath),
    };
  },

  /**
   * Get all projects a user is in
   * GET /api/collab/user/:userId/projects
   */
  getUserProjects: (userId: string) => {
    return {
      userId,
      projects: awarenessManager.getUserProjects(userId),
    };
  },

  /**
   * Get awareness statistics
   * GET /api/collab/stats
   */
  getStats: () => {
    return awarenessManager.getStats();
  },
};
