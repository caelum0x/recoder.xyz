"use strict";
/**
 * Cross-Platform Session Manager for Recoder.xyz Ecosystem
 *
 * Enables session sharing between CLI, Web Platform, and VS Code Extension
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extensionSessionManager = exports.webSessionManager = exports.cliSessionManager = exports.SessionManager = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const os = tslib_1.__importStar(require("os"));
const crypto = require("crypto");
const events_1 = require("events");
class SessionManager extends events_1.EventEmitter {
    constructor(platform) {
        super();
        this.sessions = new Map();
        this.watchMode = false;
        this.platform = platform;
        this.sessionDir = this.getSessionDirectory();
        this.loadSessions();
        this.setupFileWatcher();
    }
    static getInstance(platform) {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager(platform);
        }
        return SessionManager.instance;
    }
    /**
     * Get the session storage directory
     */
    getSessionDirectory() {
        const homeDir = os.homedir();
        const sessionDir = path.join(homeDir, '.recoder', 'sessions');
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        return sessionDir;
    }
    /**
     * Setup file watcher for cross-platform synchronization
     */
    setupFileWatcher() {
        if (this.watchMode) {
            try {
                const chokidar = require('chokidar');
                const watcher = chokidar.watch(this.sessionDir, {
                    ignored: /^\./,
                    persistent: true
                });
                watcher.on('change', (filePath) => {
                    if (filePath.endsWith('.json')) {
                        this.handleSessionFileChange(filePath);
                    }
                });
                watcher.on('add', (filePath) => {
                    if (filePath.endsWith('.json')) {
                        this.handleSessionFileChange(filePath);
                    }
                });
            }
            catch (error) {
                console.warn('File watching not available, cross-platform sync disabled');
            }
        }
    }
    /**
     * Handle session file changes from other platforms
     */
    handleSessionFileChange(filePath) {
        try {
            const sessionData = fs.readFileSync(filePath, 'utf8');
            const session = JSON.parse(sessionData);
            // Only sync if the session was modified by another platform
            if (session.platform !== this.platform) {
                this.sessions.set(session.id, session);
                this.emit('sessionUpdated', session);
            }
        }
        catch (error) {
            console.warn('Failed to sync session:', error);
        }
    }
    /**
     * Load all sessions from disk
     */
    loadSessions() {
        try {
            const sessionFiles = fs.readdirSync(this.sessionDir)
                .filter(file => file.endsWith('.json'));
            for (const file of sessionFiles) {
                try {
                    const sessionPath = path.join(this.sessionDir, file);
                    const sessionData = fs.readFileSync(sessionPath, 'utf8');
                    const session = JSON.parse(sessionData);
                    this.sessions.set(session.id, session);
                }
                catch (error) {
                    console.warn(`Failed to load session ${file}:`, error);
                }
            }
        }
        catch (error) {
            console.warn('Failed to load sessions:', error);
        }
    }
    /**
     * Save a session to disk
     */
    saveSession(session) {
        try {
            const sessionPath = path.join(this.sessionDir, `${session.id}.json`);
            const sessionData = JSON.stringify(session, null, 2);
            fs.writeFileSync(sessionPath, sessionData, 'utf8');
        }
        catch (error) {
            console.error('Failed to save session:', error);
            throw new Error('Unable to save session');
        }
    }
    /**
     * Create a new session
     */
    createSession(title, context) {
        const session = {
            id: this.generateSessionId(),
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            platform: this.platform,
            messages: [],
            context: context || {},
            metadata: {
                totalTokens: 0,
                aiProviders: [],
                codeGenerated: 0,
                filesModified: []
            }
        };
        this.sessions.set(session.id, session);
        this.currentSessionId = session.id;
        this.saveSession(session);
        this.emit('sessionCreated', session);
        return session;
    }
    /**
     * Get a session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get current active session
     */
    getCurrentSession() {
        if (!this.currentSessionId) {
            return undefined;
        }
        return this.sessions.get(this.currentSessionId);
    }
    /**
     * Set the current active session
     */
    setCurrentSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            this.currentSessionId = sessionId;
            this.emit('sessionChanged', sessionId);
        }
        else {
            throw new Error('Session not found');
        }
    }
    /**
     * Get all sessions
     */
    getAllSessions() {
        return Array.from(this.sessions.values())
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    /**
     * Get sessions by platform
     */
    getSessionsByPlatform(platform) {
        return this.getAllSessions()
            .filter(session => session.platform === platform);
    }
    /**
     * Add a message to the current session
     */
    addMessage(content, type, metadata) {
        const currentSession = this.getCurrentSession();
        if (!currentSession) {
            throw new Error('No active session');
        }
        const message = {
            id: this.generateMessageId(),
            timestamp: Date.now(),
            platform: this.platform,
            type,
            content,
            metadata
        };
        currentSession.messages.push(message);
        currentSession.updatedAt = Date.now();
        // Update metadata
        if (metadata?.tokens) {
            currentSession.metadata.totalTokens += metadata.tokens;
        }
        if (metadata?.provider && !currentSession.metadata.aiProviders.includes(metadata.provider)) {
            currentSession.metadata.aiProviders.push(metadata.provider);
        }
        this.saveSession(currentSession);
        this.emit('messageAdded', message, currentSession);
        return message;
    }
    /**
     * Update session context
     */
    updateContext(context) {
        const currentSession = this.getCurrentSession();
        if (!currentSession) {
            throw new Error('No active session');
        }
        currentSession.context = {
            ...currentSession.context,
            ...context
        };
        currentSession.updatedAt = Date.now();
        this.saveSession(currentSession);
        this.emit('contextUpdated', currentSession);
    }
    /**
     * Delete a session
     */
    deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        // Remove from memory
        this.sessions.delete(sessionId);
        // Remove from disk
        try {
            const sessionPath = path.join(this.sessionDir, `${sessionId}.json`);
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
        }
        catch (error) {
            console.warn('Failed to delete session file:', error);
        }
        // Update current session if needed
        if (this.currentSessionId === sessionId) {
            this.currentSessionId = undefined;
        }
        this.emit('sessionDeleted', sessionId);
    }
    /**
     * Export session for sharing
     */
    exportSession(sessionId, includeContext = true) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        const exportData = {
            ...session,
            context: includeContext ? session.context : {}
        };
        return JSON.stringify(exportData, null, 2);
    }
    /**
     * Import session from exported data
     */
    importSession(sessionData) {
        try {
            const session = JSON.parse(sessionData);
            // Generate new ID to avoid conflicts
            session.id = this.generateSessionId();
            session.platform = this.platform;
            session.updatedAt = Date.now();
            this.sessions.set(session.id, session);
            this.saveSession(session);
            this.emit('sessionImported', session);
            return session;
        }
        catch (error) {
            throw new Error('Invalid session data format');
        }
    }
    /**
     * Search sessions by content
     */
    searchSessions(query) {
        const lowerQuery = query.toLowerCase();
        return this.getAllSessions().filter(session => {
            // Search in title
            if (session.title.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            // Search in message content
            return session.messages.some(message => message.content.toLowerCase().includes(lowerQuery));
        });
    }
    /**
     * Get session statistics
     */
    getSessionStats(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        const codeBlocks = session.messages.reduce((count, message) => {
            const codeMatches = message.content.match(/```/g);
            return count + (codeMatches ? codeMatches.length / 2 : 0);
        }, 0);
        return {
            messageCount: session.messages.length,
            totalTokens: session.metadata.totalTokens,
            aiProviders: session.metadata.aiProviders,
            duration: session.updatedAt - session.createdAt,
            codeBlocks: Math.floor(codeBlocks)
        };
    }
    /**
     * Enable cross-platform synchronization
     */
    enableSync() {
        this.watchMode = true;
        this.setupFileWatcher();
    }
    /**
     * Disable cross-platform synchronization
     */
    disableSync() {
        this.watchMode = false;
    }
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
    }
    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
    }
    /**
     * Clean up old sessions (older than 30 days)
     */
    cleanupOldSessions(daysToKeep = 30) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        const sessionsToDelete = [];
        for (const [sessionId, session] of this.sessions) {
            if (session.updatedAt < cutoffTime) {
                sessionsToDelete.push(sessionId);
            }
        }
        sessionsToDelete.forEach(sessionId => {
            try {
                this.deleteSession(sessionId);
            }
            catch (error) {
                console.warn(`Failed to delete old session ${sessionId}:`, error);
            }
        });
        return sessionsToDelete.length;
    }
}
exports.SessionManager = SessionManager;
// Export singleton instances for each platform
const cliSessionManager = () => SessionManager.getInstance('cli');
exports.cliSessionManager = cliSessionManager;
const webSessionManager = () => SessionManager.getInstance('web');
exports.webSessionManager = webSessionManager;
const extensionSessionManager = () => SessionManager.getInstance('extension');
exports.extensionSessionManager = extensionSessionManager;
exports.default = SessionManager;
//# sourceMappingURL=session-manager.js.map