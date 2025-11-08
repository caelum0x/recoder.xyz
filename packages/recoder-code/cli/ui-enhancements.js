#!/usr/bin/env node

/**
 * UI Enhancements - Beautiful terminal output like Claude Code
 * File trees, diffs, progress indicators, etc.
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const fs = require('fs');
const path = require('path');

class UIEnhancements {
  constructor() {
    this.theme = 'default';
    this.showProgress = true;
    this.animationEnabled = true;
  }

  /**
   * Display file tree with beautiful formatting
   */
  displayFileTree(tree, options = {}) {
    const { maxDepth = 3, showFiles = true, showStats = true, highlight = [] } = options;
    
    console.log('');
    console.log(chalk.bold.cyan('📂 Project Structure'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    const formatNode = (node, prefix = '', depth = 0, isLast = false) => {
      if (depth > maxDepth) return;
      
      const connector = isLast ? '└── ' : '├── ';
      const icon = this.getNodeIcon(node);
      const name = highlight.includes(node.path) ? chalk.green.bold(node.name) : node.name;
      
      console.log(`${prefix}${connector}${icon} ${name}`);
      
      if (node.children && node.type === 'directory') {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        const children = showFiles ? node.children : node.children.filter(c => c.type === 'directory');
        
        children.forEach((child, index) => {
          formatNode(child, newPrefix, depth + 1, index === children.length - 1);
        });
      }
    };
    
    formatNode(tree, '', 0, true);
    
    if (showStats && tree.stats) {
      console.log('');
      console.log(chalk.gray(`📊 ${tree.stats.files} files, ${tree.stats.directories} directories`));
    }
    
    console.log('');
  }

  /**
   * Display diff with syntax highlighting
   */
  displayDiff(diff, options = {}) {
    const { filename = 'file', compact = false } = options;
    
    console.log('');
    console.log(chalk.bold.blue(`📝 Changes to ${filename}`));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    const lines = diff.split('\n');
    let addedLines = 0;
    let removedLines = 0;
    
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(chalk.green(line));
        addedLines++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(chalk.red(line));
        removedLines++;
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(line));
      } else if (!compact) {
        console.log(chalk.gray(line));
      }
    }
    
    console.log('');
    console.log(chalk.gray(`+${addedLines} -${removedLines}`));
    console.log('');
  }

  /**
   * Display git status with beautiful formatting
   */
  displayGitStatus(status) {
    console.log('');
    console.log(chalk.bold.blue('🌿 Git Status'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    console.log(chalk.cyan('Branch: ') + chalk.white(status.branch));
    
    if (status.lastCommit) {
      console.log(chalk.gray(`Last commit: ${status.lastCommit.hash} - ${status.lastCommit.subject}`));
    }
    
    console.log('');
    
    if (status.staged && status.staged.length > 0) {
      console.log(chalk.green('Staged changes:'));
      status.staged.forEach(file => {
        console.log(chalk.green('  ✓ ') + file.path);
      });
      console.log('');
    }
    
    if (status.modified && status.modified.length > 0) {
      console.log(chalk.yellow('Modified files:'));
      const display = status.modified.slice(0, 10);
      display.forEach(file => {
        console.log(chalk.yellow('  ○ ') + `${file.path} ${chalk.gray(`(+${file.added}/-${file.removed})`)}`);
      });
      if (status.modified.length > 10) {
        console.log(chalk.gray(`  ... and ${status.modified.length - 10} more`));
      }
      console.log('');
    }
    
    if (status.untracked && status.untracked.length > 0) {
      console.log(chalk.cyan('Untracked files:'));
      const display = status.untracked.slice(0, 5);
      display.forEach(file => {
        console.log(chalk.cyan('  + ') + file.path);
      });
      if (status.untracked.length > 5) {
        console.log(chalk.gray(`  ... and ${status.untracked.length - 5} more`));
      }
      console.log('');
    }
    
    if (status.deleted && status.deleted.length > 0) {
      console.log(chalk.red('Deleted files:'));
      status.deleted.forEach(file => {
        console.log(chalk.red('  - ') + file.path);
      });
      console.log('');
    }
    
    if (status.totalChanges === 0) {
      console.log(chalk.green('✨ Working tree clean'));
      console.log('');
    }
  }

  /**
   * Display session summary
   */
  displaySessionSummary(session) {
    console.log('');
    console.log(chalk.bold.magenta('📊 Session Summary'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    console.log(chalk.gray('ID: ') + chalk.white(session.id.slice(0, 20) + '...'));
    console.log(chalk.gray('Title: ') + chalk.white(session.title));
    console.log(chalk.gray('Directory: ') + chalk.white(session.directory));
    console.log(chalk.gray('Created: ') + chalk.white(new Date(session.time.created).toLocaleString()));
    console.log(chalk.gray('Messages: ') + chalk.white(session.messages.length));
    
    if (session.metadata) {
      console.log(chalk.gray('Tokens: ') + chalk.white(session.metadata.totalTokens.toLocaleString()));
      console.log(chalk.gray('Tool calls: ') + chalk.white(session.metadata.toolCallCount));
    }
    
    console.log('');
  }

  /**
   * Display folder hierarchy with highlighting
   */
  displayFolderHierarchy(hierarchy, createdFolders = []) {
    console.log('');
    console.log(chalk.bold.cyan('🌳 Folder Hierarchy'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    const formatFolder = (folder, prefix = '', isLast = false) => {
      const connector = isLast ? '└── ' : '├── ';
      const isNew = createdFolders.includes(folder.path);
      const name = isNew ? chalk.green.bold(folder.name + ' (new)') : folder.name;
      
      console.log(`${prefix}${connector}📁 ${name}`);
      
      if (folder.subdirectories && folder.subdirectories.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        folder.subdirectories.forEach((sub, index) => {
          formatFolder(sub, newPrefix, index === folder.subdirectories.length - 1);
        });
      }
    };
    
    if (hierarchy) {
      formatFolder(hierarchy, '', true);
    }
    
    console.log('');
  }

  /**
   * Display context statistics
   */
  displayContextStats(stats) {
    console.log('');
    console.log(chalk.bold.yellow('📈 Context Statistics'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    console.log(chalk.gray('Size: ') + chalk.white(stats.size.toLocaleString() + ' chars'));
    console.log(chalk.gray('Tokens: ') + chalk.white(stats.tokens.toLocaleString()));
    console.log(chalk.gray('Parts: ') + chalk.white(stats.parts));
    
    const percentage = (stats.tokens / 100000 * 100).toFixed(1);
    const bar = this.createProgressBar(percentage, 30);
    console.log(chalk.gray('Usage: ') + bar + chalk.white(` ${percentage}%`));
    
    if (stats.tokens > 80000) {
      console.log('');
      console.log(chalk.yellow('⚠️  Context size approaching limit'));
    }
    
    console.log('');
  }

  /**
   * Create progress bar
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round(width * percentage / 100);
    const empty = width - filled;
    
    let color = chalk.green;
    if (percentage > 80) color = chalk.red;
    else if (percentage > 60) color = chalk.yellow;
    
    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  /**
   * Display spinner animation
   */
  async displaySpinner(text, duration = 1000) {
    if (!this.animationEnabled) {
      console.log(chalk.blue(text));
      return;
    }
    
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${chalk.blue(frames[i])} ${text}`);
      i = (i + 1) % frames.length;
    }, 80);
    
    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(text.length + 3) + '\r');
  }

  /**
   * Display success message
   */
  displaySuccess(message, details = null) {
    console.log(chalk.green('✅ ' + message));
    if (details) {
      console.log(chalk.gray('   ' + details));
    }
  }

  /**
   * Display error message
   */
  displayError(message, details = null) {
    console.log(chalk.red('❌ ' + message));
    if (details) {
      console.log(chalk.gray('   ' + details));
    }
  }

  /**
   * Display warning message
   */
  displayWarning(message, details = null) {
    console.log(chalk.yellow('⚠️  ' + message));
    if (details) {
      console.log(chalk.gray('   ' + details));
    }
  }

  /**
   * Display info message
   */
  displayInfo(message, details = null) {
    console.log(chalk.blue('ℹ️  ' + message));
    if (details) {
      console.log(chalk.gray('   ' + details));
    }
  }

  /**
   * Get icon for file/folder node
   */
  getNodeIcon(node) {
    if (node.type === 'directory') {
      return '📁';
    }
    
    const ext = node.extension || '';
    const icons = {
      '.js': '📜',
      '.ts': '📘',
      '.jsx': '⚛️',
      '.tsx': '⚛️',
      '.json': '📋',
      '.md': '📝',
      '.py': '🐍',
      '.java': '☕',
      '.go': '🔷',
      '.rs': '🦀',
      '.html': '🌐',
      '.css': '🎨',
      '.yml': '⚙️',
      '.yaml': '⚙️',
      '.xml': '📰',
      '.sql': '🗄️',
      '.sh': '🔧',
      '.txt': '📄'
    };
    
    return icons[ext] || '📄';
  }

  /**
   * Create box around text (returns string)
   */
  createBox(text, options = {}) {
    const { padding = 1, color = 'cyan' } = options;
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const width = maxLength + (padding * 2);
    
    const colorFn = chalk[color] || chalk.cyan;
    
    const boxLines = [];
    boxLines.push(colorFn('╔' + '═'.repeat(width) + '╗'));
    lines.forEach(line => {
      const padded = line + ' '.repeat(maxLength - line.length);
      boxLines.push(colorFn('║') + ' '.repeat(padding) + padded + ' '.repeat(padding) + colorFn('║'));
    });
    boxLines.push(colorFn('╚' + '═'.repeat(width) + '╝'));
    
    return boxLines.join('\n');
  }

  /**
   * Display box (prints to console)
   */
  displayBox(text, options = {}) {
    console.log(this.createBox(text, options));
  }

  /**
   * Display table
   */
  displayTable(headers, rows) {
    const columnWidths = headers.map((header, i) => {
      const maxCellWidth = Math.max(...rows.map(row => String(row[i]).length));
      return Math.max(header.length, maxCellWidth);
    });
    
    // Header
    const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(' │ ');
    console.log(chalk.bold(headerRow));
    console.log('─'.repeat(headerRow.length));
    
    // Rows
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => String(cell).padEnd(columnWidths[i])).join(' │ ');
      console.log(rowStr);
    });
  }

  /**
   * Create progress bar with completion percentage
   */
  createProgressBar(title, total) {
    let current = 0;
    
    return {
      update: (value) => {
        current = value;
        const percentage = (current / total) * 100;
        const bar = this.createProgressBar(percentage, 30);
        process.stdout.write(`\r${title}: ${bar} ${percentage.toFixed(1)}%`);
      },
      complete: () => {
        const bar = this.createProgressBar(100, 30);
        process.stdout.write(`\r${title}: ${bar} 100%\n`);
      }
    };
  }

  /**
   * Create spinner
   */
  createSpinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let index = 0;
    let interval = null;

    return {
      start: () => {
        if (!this.animationEnabled) {
          console.log(chalk.cyan(`⏳ ${text}`));
          return;
        }
        
        interval = setInterval(() => {
          process.stdout.write(`\r${chalk.cyan(frames[index])} ${text}`);
          index = (index + 1) % frames.length;
        }, 80);
      },
      stop: () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        process.stdout.write('\r' + ' '.repeat(text.length + 5) + '\r');
      },
      succeed: (message) => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        process.stdout.write('\r' + ' '.repeat(text.length + 5) + '\r');
        console.log(chalk.green(`✓ ${message || text}`));
      },
      fail: (message) => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        process.stdout.write('\r' + ' '.repeat(text.length + 5) + '\r');
        console.log(chalk.red(`✗ ${message || text}`));
      }
    };
  }

  /**
   * Create table (returns string instead of printing)
   */
  createTable(headers, rows) {
    const columnWidths = headers.map((header, i) => {
      const maxCellWidth = Math.max(...rows.map(row => String(row[i]).length));
      return Math.max(header.length, maxCellWidth);
    });
    
    const lines = [];
    
    // Header
    const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(' │ ');
    lines.push(chalk.bold(headerRow));
    lines.push('─'.repeat(headerRow.replace(/\u001b\[.*?m/g, '').length));
    
    // Rows
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => String(cell).padEnd(columnWidths[i])).join(' │ ');
      lines.push(rowStr);
    });
    
    return lines.join('\n');
  }

  /**
   * Format status message
   */
  formatStatus(type, message) {
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      pending: '⏳'
    };
    
    const colors = {
      success: 'green',
      error: 'red',
      warning: 'yellow',
      info: 'cyan',
      pending: 'gray'
    };
    
    const icon = icons[type] || icons.info;
    const color = colors[type] || colors.info;
    
    return chalk[color](`${icon} ${message}`);
  }
}

module.exports = UIEnhancements;
