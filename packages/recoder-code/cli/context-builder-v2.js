#!/usr/bin/env node

/**
 * Context Builder V2 - Comprehensive context compilation like Claude Code
 * Combines session, file tree, git status, and conversation history
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ContextBuilderV2 {
  constructor(options = {}) {
    this.sessionManager = options.sessionManager;
    this.fileTreeManager = options.fileTreeManager;
    this.gitIntegration = options.gitIntegration;
    this.folderHierarchy = options.folderHierarchy;
    this.conversationContext = options.conversationContext; // ⭐ CRITICAL: Track conversation files
    
    // Token limits
    this.maxContextTokens = options.maxContextTokens || 100000;
    this.maxFileContentTokens = options.maxFileContentTokens || 50000;
    this.maxFilesInContext = options.maxFilesInContext || 20;
    
    // Context priorities
    this.priorities = {
      session: 10,
      gitStatus: 8,
      fileTree: 7,
      recentFiles: 9,
      folderHierarchy: 6,
      conversationFiles: 10 // Highest priority!
    };
  }

  /**
   * Build comprehensive context for AI
   */
  async buildContext(options = {}) {
    const {
      includeFileTree = true,
      includeGitStatus = true,
      includeFolderHierarchy = true,
      includeRecentFiles = true,
      includeSessionInfo = true,
      includeConversationFiles = true
    } = options;

    const contextParts = [];
    let estimatedTokens = 0;

    // 0. ⭐ HIGHEST PRIORITY: Files from conversation (created/modified in this chat)
    if (includeConversationFiles && this.conversationContext) {
      const conversationFilesContext = this.buildConversationFilesContext();
      if (conversationFilesContext) {
        contextParts.push(conversationFilesContext);
        estimatedTokens += this.estimateTokens(conversationFilesContext);
      }
    }

    // 1. Session Information
    if (includeSessionInfo && this.sessionManager) {
      const sessionContext = this.buildSessionContext();
      contextParts.push(sessionContext);
      estimatedTokens += this.estimateTokens(sessionContext);
    }

    // 2. Git Status
    if (includeGitStatus && this.gitIntegration && this.gitIntegration.isGitRepo) {
      const gitContext = await this.buildGitContext();
      contextParts.push(gitContext);
      estimatedTokens += this.estimateTokens(gitContext);
    }

    // 3. Folder Hierarchy
    if (includeFolderHierarchy && this.folderHierarchy) {
      const hierarchyContext = this.buildFolderHierarchyContext();
      contextParts.push(hierarchyContext);
      estimatedTokens += this.estimateTokens(hierarchyContext);
    }

    // 4. File Tree Overview
    if (includeFileTree && this.fileTreeManager) {
      const fileTreeContext = this.buildFileTreeContext();
      contextParts.push(fileTreeContext);
      estimatedTokens += this.estimateTokens(fileTreeContext);
    }

    // 5. Recent File Changes (from git)
    if (includeRecentFiles && this.gitIntegration) {
      const recentFilesContext = await this.buildRecentFilesContext();
      contextParts.push(recentFilesContext);
      estimatedTokens += this.estimateTokens(recentFilesContext);
    }

    const fullContext = contextParts.filter(p => p).join('\n\n---\n\n');

    return {
      context: fullContext,
      estimatedTokens,
      parts: contextParts.length,
      timestamp: Date.now()
    };
  }

  /**
   * Build session context
   */
  buildSessionContext() {
    const session = this.sessionManager.getCurrent();
    if (!session) return '';

    const lines = [];
    
    lines.push('## Session Context');
    lines.push('');
    lines.push(`**Session ID:** ${session.id.slice(0, 16)}...`);
    lines.push(`**Title:** ${session.title}`);
    lines.push(`**Directory:** ${session.directory}`);
    lines.push(`**Started:** ${new Date(session.time.created).toLocaleString()}`);
    lines.push(`**Messages:** ${session.messages.length}`);
    
    if (session.git && session.git.isGitRepo) {
      lines.push(`**Git Branch:** ${session.git.branch}`);
    }
    
    lines.push('');

    return lines.join('\n');
  }

  /**
   * ⭐ Build conversation files context - MOST IMPORTANT!
   * Lists all files created/modified in THIS conversation
   */
  buildConversationFilesContext() {
    if (!this.conversationContext) return '';

    const lines = [];
    
    lines.push('## 🎯 CONVERSATION FILE ACTIVITY (THIS CHAT)');
    lines.push('');
    lines.push('**IMPORTANT: These are files YOU created or modified in THIS conversation.**');
    lines.push('**When the user asks about files you created, refer to this list!**');
    lines.push('');

    // Files created
    if (this.conversationContext.createdFiles.size > 0) {
      lines.push('### ✨ Files Created by You:');
      for (const filePath of this.conversationContext.createdFiles) {
        const fileInfo = this.conversationContext.modifiedFiles.get(filePath);
        if (fileInfo) {
          lines.push(`- \`${filePath}\` (${fileInfo.lineCount || 0} lines)`);
        } else {
          lines.push(`- \`${filePath}\``);
        }
      }
      lines.push('');
    }

    // Files modified (not created)
    const modifiedNotCreated = Array.from(this.conversationContext.modifiedFiles.keys())
      .filter(f => !this.conversationContext.createdFiles.has(f));
    
    if (modifiedNotCreated.length > 0) {
      lines.push('### 📝 Files Modified by You:');
      for (const filePath of modifiedNotCreated) {
        const fileInfo = this.conversationContext.modifiedFiles.get(filePath);
        if (fileInfo) {
          lines.push(`- \`${filePath}\` (${fileInfo.operations.length} edit${fileInfo.operations.length > 1 ? 's' : ''})`);
        } else {
          lines.push(`- \`${filePath}\``);
        }
      }
      lines.push('');
    }

    // Commands executed
    if (this.conversationContext.executedCommands.length > 0) {
      const recentCommands = this.conversationContext.executedCommands.slice(-5);
      lines.push('### ⚡ Recent Commands Executed:');
      for (const cmd of recentCommands) {
        const status = cmd.exitCode === 0 ? '✓' : '✗';
        lines.push(`${status} \`${cmd.command}\``);
      }
      lines.push('');
    }

    return lines.length > 6 ? lines.join('\n') : ''; // Only return if there's actual content
  }

  /**
   * Build git context
   */
  async buildGitContext() {
    if (!this.gitIntegration) return '';

    const status = await this.gitIntegration.getStatus();
    if (!status.isGitRepo) return '';

    const lines = [];
    
    lines.push('## Git Status');
    lines.push('');
    lines.push(`**Branch:** ${status.branch || 'unknown'}`);
    
    if (status.lastCommit) {
      lines.push(`**Last Commit:** ${status.lastCommit.hash} - ${status.lastCommit.subject}`);
    }
    
    lines.push('');

    // Modified files
    if (status.modified.length > 0) {
      lines.push('**Modified Files:**');
      status.modified.slice(0, 15).forEach(file => {
        lines.push(`- \`${file.path}\` (+${file.added}/-${file.removed} lines)`);
      });
      if (status.modified.length > 15) {
        lines.push(`- ... and ${status.modified.length - 15} more files`);
      }
      lines.push('');
    }

    // Untracked files
    if (status.untracked.length > 0) {
      lines.push('**Untracked Files:**');
      status.untracked.slice(0, 10).forEach(file => {
        lines.push(`- \`${file.path}\` (new)`);
      });
      if (status.untracked.length > 10) {
        lines.push(`- ... and ${status.untracked.length - 10} more files`);
      }
      lines.push('');
    }

    // Deleted files
    if (status.deleted.length > 0) {
      lines.push('**Deleted Files:**');
      status.deleted.forEach(file => {
        lines.push(`- \`${file.path}\` (deleted)`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build folder hierarchy context
   */
  buildFolderHierarchyContext() {
    if (!this.folderHierarchy) return '';

    return this.folderHierarchy.buildContextString();
  }

  /**
   * Build file tree context
   */
  buildFileTreeContext() {
    if (!this.fileTreeManager) return '';

    const stats = this.fileTreeManager.getStats();
    if (!stats) return '';

    const lines = [];
    
    lines.push('## Project Files');
    lines.push('');
    lines.push(`**Total Files:** ${stats.totalFiles}`);
    lines.push(`**Total Directories:** ${stats.totalDirectories}`);
    
    // File type breakdown
    const extensions = Object.entries(stats.extensions || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    if (extensions.length > 0) {
      lines.push('');
      lines.push('**File Types:**');
      extensions.forEach(([ext, count]) => {
        lines.push(`- ${ext}: ${count} files`);
      });
    }
    
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Build recent files context (files created/modified in session)
   */
  async buildRecentFilesContext() {
    // This would be populated from conversation-context-manager or session messages
    // For now, we'll get it from git status for recently modified files
    
    if (!this.gitIntegration || !this.gitIntegration.isGitRepo) return '';

    const status = await this.gitIntegration.getStatus();
    const recentFiles = [
      ...status.modified.slice(0, 10),
      ...status.untracked.slice(0, 5)
    ];

    if (recentFiles.length === 0) return '';

    const lines = [];
    
    lines.push('## Recent File Activity');
    lines.push('');

    for (const file of recentFiles) {
      lines.push(`### ${file.path}`);
      
      if (file.status === 'modified') {
        // Try to get diff
        const diff = await this.gitIntegration.getUnifiedDiff(file.path);
        if (diff) {
          lines.push('```diff');
          lines.push(diff.split('\n').slice(0, 30).join('\n')); // Limit diff size
          if (diff.split('\n').length > 30) {
            lines.push('... (diff truncated)');
          }
          lines.push('```');
        }
      } else if (file.status === 'untracked') {
        lines.push('*(New file)*');
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Estimate tokens (rough approximation: 1 token ≈ 4 characters)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Optimize context to fit within token limits
   */
  async optimizeContext(context) {
    const tokens = this.estimateTokens(context.context);
    
    if (tokens <= this.maxContextTokens) {
      return context;
    }

    console.log(chalk.yellow(`⚠️  Context too large (${tokens} tokens), optimizing...`));

    // Rebuild with reduced options
    const optimized = await this.buildContext({
      includeFileTree: tokens > this.maxContextTokens * 1.5 ? false : true,
      includeGitStatus: true,
      includeFolderHierarchy: true,
      includeRecentFiles: tokens > this.maxContextTokens * 1.2 ? false : true,
      includeSessionInfo: true
    });

    console.log(chalk.green(`✅ Optimized to ${this.estimateTokens(optimized.context)} tokens`));

    return optimized;
  }

  /**
   * Get context summary
   */
  getContextSummary(context) {
    return {
      tokens: context.estimatedTokens,
      parts: context.parts,
      size: context.context.length,
      timestamp: context.timestamp,
      withinLimits: context.estimatedTokens <= this.maxContextTokens
    };
  }

  /**
   * Format context for AI system prompt
   */
  formatForAI(context) {
    return `

# COMPREHENSIVE PROJECT CONTEXT

${context.context}

---

**IMPORTANT:** You have full awareness of:
1. The current session and its history
2. The complete project file structure
3. Git status and recent changes
4. Folder hierarchy and organization
5. All files created, modified, or viewed in this session

Use this context to:
- Remember what files exist and their contents
- Understand the project structure
- Know what you've already done
- Make informed decisions about file operations
- Provide accurate responses about the codebase

`;
  }

  /**
   * Build smart context based on user query
   * Automatically selects relevant files and context
   */
  async buildSmartContext(userQuery = '') {
    const query = userQuery.toLowerCase();
    const context = {
      files: [],
      includeGit: false,
      includeSession: true,
      includeFolders: false
    };

    // Detect intent from query
    const hasCodeIntent = /write|create|implement|add|fix|debug|code|function|class/.test(query);
    const hasFileIntent = /file|read|show|view|check|look/.test(query);
    const hasGitIntent = /git|commit|branch|diff|merge|status/.test(query);
    const hasStructureIntent = /structure|organize|folder|directory|tree/.test(query);

    // Always include git if mentioned
    if (hasGitIntent) {
      context.includeGit = true;
    }

    // Include folder structure for structure queries
    if (hasStructureIntent) {
      context.includeFolders = true;
    }

    // Try to extract file mentions
    const fileMatches = query.match(/[\w\-\.\/]+\.(js|ts|jsx|tsx|py|java|go|rs|cpp|c|h|css|html|json|md|txt)/gi);
    if (fileMatches) {
      context.files = fileMatches;
    }

    // If code intent, include common important files
    if (hasCodeIntent && context.files.length === 0) {
      const importantFiles = ['package.json', 'tsconfig.json', 'README.md'];
      context.files = importantFiles.filter(f => {
        const filePath = path.join(this.sessionManager?.directory || process.cwd(), f);
        return require('fs').existsSync(filePath);
      });
    }

    // Build context with smart selections
    return await this.buildContext(context);
  }
}

module.exports = ContextBuilderV2;
