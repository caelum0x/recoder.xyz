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
/**
 * Global awareness manager that tracks all users across all projects
 */
declare class AwarenessManager {
    private projects;
    private userToProjects;
    private listeners;
    constructor();
    /**
     * Add a user to a project's awareness
     */
    addUser(projectId: string, user: UserInfo): void;
    /**
     * Remove a user from a project's awareness
     */
    removeUser(projectId: string, userId: string): void;
    /**
     * Update a user's presence information (cursor, selection, file)
     */
    updatePresence(projectId: string, userId: string, update: Partial<Pick<UserPresence, 'clientId' | 'currentFile' | 'cursor' | 'selection'>>): void;
    /**
     * Get all users present in a project
     */
    getProjectPresence(projectId: string): UserPresence[];
    /**
     * Get all projects a user is participating in
     */
    getUserProjects(userId: string): string[];
    /**
     * Get users currently viewing/editing a specific file
     */
    getFilePresence(projectId: string, filePath: string): UserPresence[];
    /**
     * Subscribe to presence changes for a project
     */
    subscribe(projectId: string, callback: (presence: ProjectPresence) => void): () => void;
    /**
     * Get statistics about current awareness state
     */
    getStats(): {
        totalProjects: number;
        totalUsers: number;
        activeUsers: number;
        projects: Array<{
            projectId: string;
            userCount: number;
            lastActivity: number;
        }>;
    };
    /**
     * Update user statuses based on activity and clean up stale entries
     */
    private updateStatuses;
    /**
     * Notify all listeners of a project's presence changes
     */
    private notifyListeners;
}
export declare const awarenessManager: AwarenessManager;
/**
 * REST API handlers for awareness queries
 */
export declare const awarenessHandlers: {
    /**
     * Get presence for a project
     * GET /api/collab/presence/:projectId
     */
    getProjectPresence: (projectId: string) => {
        projectId: string;
        users: UserPresence[];
    };
    /**
     * Get presence for a specific file
     * GET /api/collab/presence/:projectId/file?path=...
     */
    getFilePresence: (projectId: string, filePath: string) => {
        projectId: string;
        filePath: string;
        users: UserPresence[];
    };
    /**
     * Get all projects a user is in
     * GET /api/collab/user/:userId/projects
     */
    getUserProjects: (userId: string) => {
        userId: string;
        projects: string[];
    };
    /**
     * Get awareness statistics
     * GET /api/collab/stats
     */
    getStats: () => {
        totalProjects: number;
        totalUsers: number;
        activeUsers: number;
        projects: Array<{
            projectId: string;
            userCount: number;
            lastActivity: number;
        }>;
    };
};
export {};
