"use strict";
/**
 * Terminal Session Store
 * Persists terminal sessions in Redis for recovery after container/backend restarts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SESSION_TTL = 24 * 60 * 60; // 24 hours
class SessionStore {
    redis = null;
    connected = false;
    memoryFallback = new Map();
    async connect() {
        if (this.connected)
            return true;
        try {
            this.redis = new ioredis_1.default(REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    // Never give up — exponential backoff capped at 30s.
                    return Math.min(times * 500, 30000);
                },
                reconnectOnError: () => true,
                lazyConnect: true,
            });
            await this.redis.connect();
            this.connected = true;
            console.log('[SessionStore] Connected to Redis');
            return true;
        }
        catch (error) {
            console.warn('[SessionStore] Redis not available, using memory fallback:', error.message);
            this.redis = null;
            this.connected = false;
            return false;
        }
    }
    // Terminal Session Methods
    async saveTerminalSession(session) {
        const key = `terminal:${session.projectId}:${session.terminalId}`;
        const data = JSON.stringify(session);
        if (this.redis && this.connected) {
            await this.redis.setex(key, SESSION_TTL, data);
        }
        else {
            this.memoryFallback.set(key, session);
        }
    }
    async getTerminalSession(projectId, terminalId) {
        const key = `terminal:${projectId}:${terminalId}`;
        if (this.redis && this.connected) {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        else {
            return this.memoryFallback.get(key) || null;
        }
    }
    async updateTerminalActivity(projectId, terminalId) {
        const session = await this.getTerminalSession(projectId, terminalId);
        if (session) {
            session.lastActive = Date.now();
            await this.saveTerminalSession(session);
        }
    }
    async addCommandToHistory(projectId, terminalId, command) {
        const session = await this.getTerminalSession(projectId, terminalId);
        if (session) {
            session.history.push(command);
            // Keep last 100 commands
            if (session.history.length > 100) {
                session.history = session.history.slice(-100);
            }
            session.lastActive = Date.now();
            await this.saveTerminalSession(session);
        }
    }
    async getTerminalSessions(projectId) {
        const pattern = `terminal:${projectId}:*`;
        const sessions = [];
        if (this.redis && this.connected) {
            const keys = await this.redis.keys(pattern);
            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    sessions.push(JSON.parse(data));
                }
            }
        }
        else {
            for (const [key, value] of this.memoryFallback) {
                if (key.startsWith(`terminal:${projectId}:`)) {
                    sessions.push(value);
                }
            }
        }
        return sessions;
    }
    async deleteTerminalSession(projectId, terminalId) {
        const key = `terminal:${projectId}:${terminalId}`;
        if (this.redis && this.connected) {
            await this.redis.del(key);
        }
        else {
            this.memoryFallback.delete(key);
        }
    }
    // Chat Session Methods (for CLI-Web sync)
    async saveChatSession(session) {
        const key = `chat:${session.projectId}`;
        const data = JSON.stringify(session);
        if (this.redis && this.connected) {
            await this.redis.setex(key, SESSION_TTL, data);
        }
        else {
            this.memoryFallback.set(key, session);
        }
    }
    async getChatSession(projectId) {
        const key = `chat:${projectId}`;
        if (this.redis && this.connected) {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        else {
            return this.memoryFallback.get(key) || null;
        }
    }
    async addChatMessage(projectId, message) {
        let session = await this.getChatSession(projectId);
        if (!session) {
            session = {
                projectId,
                messages: [],
                createdAt: Date.now(),
                lastActive: Date.now(),
            };
        }
        session.messages.push(message);
        session.lastActive = Date.now();
        // Keep last 200 messages
        if (session.messages.length > 200) {
            session.messages = session.messages.slice(-200);
        }
        await this.saveChatSession(session);
    }
    async getChatMessages(projectId, limit = 50) {
        const session = await this.getChatSession(projectId);
        if (!session)
            return [];
        return session.messages.slice(-limit);
    }
    // Offline Queue Methods
    async queueOfflineChange(projectId, change) {
        const key = `offline:${projectId}`;
        if (this.redis && this.connected) {
            await this.redis.rpush(key, JSON.stringify(change));
            await this.redis.expire(key, SESSION_TTL);
        }
        else {
            const queue = this.memoryFallback.get(key) || [];
            queue.push(change);
            this.memoryFallback.set(key, queue);
        }
    }
    async getOfflineChanges(projectId) {
        const key = `offline:${projectId}`;
        if (this.redis && this.connected) {
            const changes = await this.redis.lrange(key, 0, -1);
            return changes.map(c => JSON.parse(c));
        }
        else {
            return this.memoryFallback.get(key) || [];
        }
    }
    async clearOfflineChanges(projectId) {
        const key = `offline:${projectId}`;
        if (this.redis && this.connected) {
            await this.redis.del(key);
        }
        else {
            this.memoryFallback.delete(key);
        }
    }
    // Connection status
    isConnected() {
        return this.connected;
    }
    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
            this.connected = false;
        }
    }
}
exports.sessionStore = new SessionStore();
