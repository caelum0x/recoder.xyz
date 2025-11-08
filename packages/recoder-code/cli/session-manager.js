#!/usr/bin/env node

/**
 * Session Manager - Persistent session system like Claude Code
 * Handles session creation, loading, saving, and management
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class SessionManager {
  constructor() {
    // Session storage directory
    this.sessionsDir = path.join(process.env.HOME || process.cwd(), '.recoder-code', 'sessions');
    this.ensureSessionsDir();
    
    // Current active session
    this.currentSession = null;
    
    // Session index (for fast lookups)
    this.sessionIndex = new Map();
    this.loadSessionIndex();
  }

  /**
   * Ensure sessions directory exists
   */
  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Generate unique session ID (ascending timestamp-based like OpenCode)
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `session_${timestamp}_${random}`;
  }

  /**
   * Create new session
   */
  async create(options = {}) {
    const {
      directory = process.cwd(),
      title = null,
      parentId = null,
      model = null
    } = options;

    const sessionId = this.generateSessionId();
    const now = Date.now();

    // Detect git info
    const gitInfo = await this.detectGitInfo(directory);

    const session = {
      id: sessionId,
      title: title || this.generateDefaultTitle(parentId),
      directory: directory,
      parentId: parentId || null,
      model: model || 'default',
      version: '1.0.0',
      time: {
        created: now,
        updated: now,
        compacting: null
      },
      git: gitInfo,
      messages: [],
      metadata: {
        messageCount: 0,
        totalTokens: 0,
        toolCallCount: 0
      },
      revert: null,
      share: null
    };

    // Save session
    await this.save(sessionId, session);
    
    // Update index
    this.sessionIndex.set(sessionId, {
      id: sessionId,
      title: session.title,
      directory: session.directory,
      created: session.time.created,
      updated: session.time.updated
    });
    this.saveSessionIndex();

    this.currentSession = session;
    
    console.log(chalk.green(`✅ Created session: ${sessionId.slice(0, 16)}...`));
    console.log(chalk.gray(`   Directory: ${directory}`));
    if (gitInfo.isGitRepo) {
      console.log(chalk.gray(`   Git branch: ${gitInfo.branch}`));
    }

    return session;
  }

  /**
   * Load existing session
   */
  async load(sessionId) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (!fs.existsSync(sessionPath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf8');
      const session = JSON.parse(data);
      
      // Update last accessed time
      session.time.updated = Date.now();
      await this.save(sessionId, session);
      
      this.currentSession = session;
      
      console.log(chalk.blue(`📂 Loaded session: ${session.title}`));
      console.log(chalk.gray(`   Messages: ${session.messages.length}`));
      console.log(chalk.gray(`   Created: ${new Date(session.time.created).toLocaleString()}`));
      
      return session;
    } catch (error) {
      throw new Error(`Failed to load session: ${error.message}`);
    }
  }

  /**
   * Save session to disk
   */
  async save(sessionId, session) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    
    try {
      // Update timestamp
      session.time.updated = Date.now();
      
      // Write to disk
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8');
      
      // Update index
      if (this.sessionIndex.has(sessionId)) {
        const indexEntry = this.sessionIndex.get(sessionId);
        indexEntry.updated = session.time.updated;
        indexEntry.title = session.title;
        this.saveSessionIndex();
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to save session: ${error.message}`));
      return false;
    }
  }

  /**
   * Update current session
   */
  async update(updates) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    Object.assign(this.currentSession, updates);
    await this.save(this.currentSession.id, this.currentSession);
  }

  /**
   * List all sessions
   */
  list(options = {}) {
    const { limit = 50, sortBy = 'updated', directory = null } = options;
    
    let sessions = Array.from(this.sessionIndex.values());
    
    // Filter by directory if specified
    if (directory) {
      sessions = sessions.filter(s => s.directory === directory);
    }
    
    // Sort
    sessions.sort((a, b) => {
      if (sortBy === 'created') {
        return b.created - a.created;
      }
      return b.updated - a.updated; // Default: most recently updated
    });
    
    // Limit
    return sessions.slice(0, limit);
  }

  /**
   * Delete session
   */
  async delete(sessionId) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    
    try {
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
      
      this.sessionIndex.delete(sessionId);
      this.saveSessionIndex();
      
      if (this.currentSession && this.currentSession.id === sessionId) {
        this.currentSession = null;
      }
      
      console.log(chalk.yellow(`🗑️  Deleted session: ${sessionId.slice(0, 16)}...`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to delete session: ${error.message}`));
      return false;
    }
  }

  /**
   * Add message to current session
   */
  async addMessage(message) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Add timestamp if not present
    if (!message.time) {
      message.time = {
        created: Date.now()
      };
    }

    // Add message ID if not present
    if (!message.id) {
      message.id = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    this.currentSession.messages.push(message);
    this.currentSession.metadata.messageCount++;
    
    // Update tokens if provided
    if (message.tokens) {
      this.currentSession.metadata.totalTokens += message.tokens.total || 0;
    }

    await this.save(this.currentSession.id, this.currentSession);
    
    return message.id;
  }

  /**
   * Get messages from current session
   */
  getMessages(options = {}) {
    if (!this.currentSession) {
      return [];
    }

    const { limit = null, afterId = null } = options;
    
    let messages = [...this.currentSession.messages];
    
    // Filter after specific message ID
    if (afterId) {
      const afterIndex = messages.findIndex(m => m.id === afterId);
      if (afterIndex >= 0) {
        messages = messages.slice(afterIndex + 1);
      }
    }
    
    // Limit
    if (limit) {
      messages = messages.slice(-limit);
    }
    
    return messages;
  }

  /**
   * Get current session
   */
  getCurrent() {
    return this.currentSession;
  }

  /**
   * Generate default session title
   */
  generateDefaultTitle(parentId) {
    const prefix = parentId ? 'Child session - ' : 'New session - ';
    return prefix + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  /**
   * Detect git information
   */
  async detectGitInfo(directory) {
    try {
      const { execSync } = require('child_process');
      
      const branch = execSync('git branch --show-current', { 
        cwd: directory, 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: directory, 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      return {
        isGitRepo: true,
        branch: branch || 'main',
        remoteUrl: remoteUrl || null
      };
    } catch (error) {
      return {
        isGitRepo: false,
        branch: null,
        remoteUrl: null
      };
    }
  }

  /**
   * Load session index from disk
   */
  loadSessionIndex() {
    const indexPath = path.join(this.sessionsDir, '_index.json');
    
    if (fs.existsSync(indexPath)) {
      try {
        const data = fs.readFileSync(indexPath, 'utf8');
        const index = JSON.parse(data);
        this.sessionIndex = new Map(Object.entries(index));
      } catch (error) {
        console.error(chalk.yellow(`⚠️  Failed to load session index: ${error.message}`));
        this.rebuildIndex();
      }
    } else {
      this.rebuildIndex();
    }
  }

  /**
   * Save session index to disk
   */
  saveSessionIndex() {
    const indexPath = path.join(this.sessionsDir, '_index.json');
    const index = Object.fromEntries(this.sessionIndex);
    
    try {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Failed to save session index: ${error.message}`));
    }
  }

  /**
   * Rebuild session index from disk
   */
  rebuildIndex() {
    console.log(chalk.gray('🔄 Rebuilding session index...'));
    
    this.sessionIndex.clear();
    
    try {
      const files = fs.readdirSync(this.sessionsDir);
      
      for (const file of files) {
        if (file.startsWith('session_') && file.endsWith('.json')) {
          const sessionPath = path.join(this.sessionsDir, file);
          try {
            const data = fs.readFileSync(sessionPath, 'utf8');
            const session = JSON.parse(data);
            
            this.sessionIndex.set(session.id, {
              id: session.id,
              title: session.title,
              directory: session.directory,
              created: session.time.created,
              updated: session.time.updated
            });
          } catch (error) {
            console.error(chalk.yellow(`⚠️  Skipping corrupted session: ${file}`));
          }
        }
      }
      
      this.saveSessionIndex();
      console.log(chalk.green(`✅ Indexed ${this.sessionIndex.size} sessions`));
    } catch (error) {
      console.error(chalk.red(`Failed to rebuild index: ${error.message}`));
    }
  }

  /**
   * Get session statistics
   */
  getStats() {
    if (!this.currentSession) {
      return null;
    }

    return {
      id: this.currentSession.id,
      title: this.currentSession.title,
      messages: this.currentSession.metadata.messageCount,
      tokens: this.currentSession.metadata.totalTokens,
      toolCalls: this.currentSession.metadata.toolCallCount,
      duration: Date.now() - this.currentSession.time.created,
      directory: this.currentSession.directory
    };
  }

  /**
   * Create child session (branch)
   */
  async createChild(title = null) {
    if (!this.currentSession) {
      throw new Error('No active session to branch from');
    }

    return await this.create({
      directory: this.currentSession.directory,
      title: title || `Branch of ${this.currentSession.title}`,
      parentId: this.currentSession.id,
      model: this.currentSession.model
    });
  }
}

module.exports = SessionManager;
