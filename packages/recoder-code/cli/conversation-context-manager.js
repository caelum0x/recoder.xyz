#!/usr/bin/env node

/**
 * Conversation Context Manager
 * Tracks files, edits, and context across the conversation like Claude Code
 * This is the KEY component that makes AI remember what it has done
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ConversationContextManager {
  constructor() {
    // Core context tracking
    this.modifiedFiles = new Map(); // filepath -> { content, hash, timestamp, operations[] }
    this.createdFiles = new Set();
    this.readFiles = new Map(); // Track files that were read/viewed
    this.executedCommands = [];
    this.projectStructure = null;
    
    // Conversation metadata
    this.conversationId = null;
    this.turnCount = 0;
    this.contextTokenEstimate = 0;
    
    // Smart context window management
    this.maxContextFiles = 15; // Max files to include in context
    this.maxContextSize = 50000; // Max characters for file contents
    this.fileRelevanceScores = new Map();
    
    // Session persistence
    this.sessionsDir = path.join(process.env.HOME || process.cwd(), '.recoder-code', 'contexts');
    this.ensureSessionsDir();
  }

  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Start a new conversation context
   */
  startConversation(conversationId) {
    this.conversationId = conversationId;
    this.turnCount = 0;
    this.modifiedFiles.clear();
    this.createdFiles.clear();
    this.readFiles.clear();
    this.executedCommands = [];
    console.log(chalk.blue(`📝 Started tracking context for conversation: ${conversationId.slice(0, 8)}`));
  }

  /**
   * Track a file operation (create, edit, view)
   */
  trackFileOperation(operation, filePath, content = null, metadata = {}) {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), absolutePath);
    
    this.turnCount++;
    
    const operationRecord = {
      type: operation,
      timestamp: new Date().toISOString(),
      turn: this.turnCount,
      ...metadata
    };

    switch (operation) {
      case 'create':
        this.createdFiles.add(relativePath);
        this.modifiedFiles.set(relativePath, {
          content: content,
          hash: this.hashContent(content),
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          operations: [operationRecord],
          size: content ? content.length : 0,
          lineCount: content ? content.split('\n').length : 0
        });
        this.updateRelevanceScore(relativePath, 10); // High relevance for new files
        break;

      case 'edit':
      case 'modify':
        const existing = this.modifiedFiles.get(relativePath) || {
          operations: [],
          created: new Date().toISOString()
        };
        existing.content = content;
        existing.hash = this.hashContent(content);
        existing.modified = new Date().toISOString();
        existing.operations.push(operationRecord);
        existing.size = content ? content.length : 0;
        existing.lineCount = content ? content.split('\n').length : 0;
        this.modifiedFiles.set(relativePath, existing);
        this.updateRelevanceScore(relativePath, 5); // Medium relevance for edits
        break;

      case 'view':
      case 'read':
        this.readFiles.set(relativePath, {
          content: content,
          hash: this.hashContent(content),
          timestamp: new Date().toISOString(),
          turn: this.turnCount
        });
        this.updateRelevanceScore(relativePath, 2); // Lower relevance for views
        break;
    }

    // Update context size estimate
    this.updateContextEstimate();
  }

  /**
   * Track bash command execution
   */
  trackCommand(command, output, exitCode = 0) {
    this.executedCommands.push({
      command,
      output: output.substring(0, 1000), // Limit output size
      exitCode,
      timestamp: new Date().toISOString(),
      turn: this.turnCount
    });
  }

  /**
   * Update relevance score for file (decays over time)
   */
  updateRelevanceScore(filePath, scoreIncrease) {
    const current = this.fileRelevanceScores.get(filePath) || 0;
    this.fileRelevanceScores.set(filePath, current + scoreIncrease);
  }

  /**
   * Decay relevance scores each turn (files become less relevant over time)
   */
  decayRelevanceScores() {
    for (const [filePath, score] of this.fileRelevanceScores.entries()) {
      this.fileRelevanceScores.set(filePath, score * 0.95);
    }
  }

  /**
   * Get the most relevant files for current context
   */
  getRelevantFiles(limit = this.maxContextFiles) {
    const fileScores = Array.from(this.fileRelevanceScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    
    return fileScores.map(([filePath]) => filePath);
  }

  /**
   * Build context string for AI (THIS IS THE KEY METHOD)
   * This is what Claude Code does - it provides ALL relevant context
   */
  buildContextForAI() {
    const relevantFiles = this.getRelevantFiles();
    let contextParts = [];

    // 1. Session overview
    contextParts.push(`## Conversation Context (Turn ${this.turnCount})`);
    contextParts.push(`Working Directory: ${process.cwd()}`);
    contextParts.push('');

    // 2. Files created in this conversation
    if (this.createdFiles.size > 0) {
      contextParts.push('### Files Created in This Session:');
      for (const filePath of this.createdFiles) {
        const fileInfo = this.modifiedFiles.get(filePath);
        if (fileInfo) {
          contextParts.push(`- ${filePath} (${fileInfo.lineCount} lines, created ${this.getRelativeTime(fileInfo.created)})`);
        }
      }
      contextParts.push('');
    }

    // 3. Files modified in this conversation
    const modifiedNotCreated = Array.from(this.modifiedFiles.keys())
      .filter(f => !this.createdFiles.has(f));
    
    if (modifiedNotCreated.length > 0) {
      contextParts.push('### Files Modified in This Session:');
      for (const filePath of modifiedNotCreated) {
        const fileInfo = this.modifiedFiles.get(filePath);
        contextParts.push(`- ${filePath} (${fileInfo.operations.length} edits, last modified ${this.getRelativeTime(fileInfo.modified)})`);
      }
      contextParts.push('');
    }

    // 4. Recent commands executed
    if (this.executedCommands.length > 0) {
      const recentCommands = this.executedCommands.slice(-5);
      contextParts.push('### Recent Commands:');
      for (const cmd of recentCommands) {
        const status = cmd.exitCode === 0 ? '✓' : '✗';
        contextParts.push(`${status} \`${cmd.command}\``);
      }
      contextParts.push('');
    }

    // 5. Content of most relevant files (within size limits)
    const filesToInclude = relevantFiles.slice(0, 10);
    if (filesToInclude.length > 0) {
      contextParts.push('### Relevant File Contents:');
      let totalSize = 0;

      for (const filePath of filesToInclude) {
        const fileInfo = this.modifiedFiles.get(filePath) || this.readFiles.get(filePath);
        if (!fileInfo || !fileInfo.content) continue;

        const contentSize = fileInfo.content.length;
        if (totalSize + contentSize > this.maxContextSize) {
          contextParts.push(`\n*... (${filesToInclude.length - filesToInclude.indexOf(filePath)} more files not shown to stay within context limit)*`);
          break;
        }

        contextParts.push(`\n#### ${filePath}`);
        contextParts.push('```');
        contextParts.push(fileInfo.content);
        contextParts.push('```');
        contextParts.push('');
        totalSize += contentSize;
      }
    }

    return contextParts.join('\n');
  }

  /**
   * Build a compact context summary for display
   */
  getContextSummary() {
    return {
      turn: this.turnCount,
      filesCreated: this.createdFiles.size,
      filesModified: this.modifiedFiles.size,
      filesRead: this.readFiles.size,
      commandsExecuted: this.executedCommands.length,
      contextSize: this.contextTokenEstimate,
      activeFiles: this.getRelevantFiles(5)
    };
  }

  /**
   * Display context summary in terminal
   */
  displayContextSummary() {
    const summary = this.getContextSummary();
    
    console.log(chalk.cyan('\n📊 Context Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (summary.filesCreated > 0) {
      console.log(chalk.green(`  ✨ Created: ${summary.filesCreated} file${summary.filesCreated > 1 ? 's' : ''}`));
    }
    if (summary.filesModified > 0) {
      console.log(chalk.yellow(`  ✏️  Modified: ${summary.filesModified} file${summary.filesModified > 1 ? 's' : ''}`));
    }
    if (summary.commandsExecuted > 0) {
      console.log(chalk.blue(`  ⚡ Commands: ${summary.commandsExecuted} executed`));
    }

    if (summary.activeFiles.length > 0) {
      console.log(chalk.magenta(`\n  🔥 Active Files:`));
      summary.activeFiles.forEach(file => {
        const isNew = this.createdFiles.has(file);
        const icon = isNew ? '✨' : '📝';
        console.log(chalk.gray(`     ${icon} ${file}`));
      });
    }
    
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Hash content for change detection
   */
  hashContent(content) {
    if (!content) return null;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get relative time string
   */
  getRelativeTime(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  /**
   * Update token estimate for context
   */
  updateContextEstimate() {
    // Rough estimate: 1 token ≈ 4 characters
    let totalChars = 0;
    
    for (const [, fileInfo] of this.modifiedFiles) {
      if (fileInfo.content) {
        totalChars += fileInfo.content.length;
      }
    }
    
    this.contextTokenEstimate = Math.ceil(totalChars / 4);
  }

  /**
   * Save context to disk for persistence
   */
  saveContext() {
    if (!this.conversationId) return;

    const contextFile = path.join(this.sessionsDir, `${this.conversationId}.json`);
    const contextData = {
      conversationId: this.conversationId,
      turnCount: this.turnCount,
      modifiedFiles: Array.from(this.modifiedFiles.entries()),
      createdFiles: Array.from(this.createdFiles),
      readFiles: Array.from(this.readFiles.entries()),
      executedCommands: this.executedCommands,
      fileRelevanceScores: Array.from(this.fileRelevanceScores.entries()),
      savedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(contextFile, JSON.stringify(contextData, null, 2));
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Could not save context: ${error.message}`));
    }
  }

  /**
   * Load context from disk
   */
  loadContext(conversationId) {
    const contextFile = path.join(this.sessionsDir, `${conversationId}.json`);
    
    try {
      if (fs.existsSync(contextFile)) {
        const contextData = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
        
        this.conversationId = contextData.conversationId;
        this.turnCount = contextData.turnCount;
        this.modifiedFiles = new Map(contextData.modifiedFiles);
        this.createdFiles = new Set(contextData.createdFiles);
        this.readFiles = new Map(contextData.readFiles);
        this.executedCommands = contextData.executedCommands;
        this.fileRelevanceScores = new Map(contextData.fileRelevanceScores);
        
        console.log(chalk.green(`✅ Loaded context from previous session`));
        return true;
      }
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Could not load context: ${error.message}`));
    }
    
    return false;
  }

  /**
   * Clear context (for new conversation)
   */
  clearContext() {
    this.modifiedFiles.clear();
    this.createdFiles.clear();
    this.readFiles.clear();
    this.executedCommands = [];
    this.fileRelevanceScores.clear();
    this.turnCount = 0;
    this.contextTokenEstimate = 0;
  }

  /**
   * Get file diff to show what changed
   */
  getFileDiff(filePath) {
    const fileInfo = this.modifiedFiles.get(filePath);
    if (!fileInfo) return null;

    return {
      path: filePath,
      operations: fileInfo.operations,
      currentContent: fileInfo.content,
      lineCount: fileInfo.lineCount,
      size: fileInfo.size
    };
  }

  /**
   * Export context for debugging/analysis
   */
  exportContext() {
    return {
      conversationId: this.conversationId,
      turnCount: this.turnCount,
      summary: this.getContextSummary(),
      files: {
        created: Array.from(this.createdFiles),
        modified: Array.from(this.modifiedFiles.keys()),
        read: Array.from(this.readFiles.keys())
      },
      commands: this.executedCommands
    };
  }
}

module.exports = ConversationContextManager;
