#!/usr/bin/env node

/**
 * Enhanced Output Formatter
 * Provides Claude Code-like beautiful terminal UI
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const fs = require('fs');
const path = require('path');

class EnhancedOutputFormatter {
  constructor() {
    this.terminalWidth = process.stdout.columns || 80;
    this.indent = '  ';
    
    // Theme colors
    this.theme = {
      success: 'green',
      error: 'red',
      warning: 'yellow',
      info: 'blue',
      highlight: 'cyan',
      muted: 'gray',
      accent: 'magenta',
      ai: 'blue',
      user: 'green',
      file: 'yellow',
      command: 'cyan'
    };
  }

  /**
   * Format file operation display (create, edit, etc.)
   */
  formatFileOperation(operation, filePath, details = {}) {
    const icons = {
      create: '✨',
      edit: '✏️',
      view: '👁️',
      delete: '🗑️',
      move: '📦',
      read: '📖'
    };

    const icon = icons[operation] || '📄';
    const action = operation.charAt(0).toUpperCase() + operation.slice(1);
    
    console.log('');
    console.log(chalk[this.theme.file](`${icon} ${action}: ${filePath}`));
    
    if (details.lineCount) {
      console.log(chalk[this.theme.muted](`   ${details.lineCount} lines`));
    }
    
    if (details.preview && operation === 'create') {
      console.log(chalk[this.theme.muted]('   Preview:'));
      const lines = details.preview.split('\n').slice(0, 5);
      lines.forEach(line => {
        console.log(chalk[this.theme.muted](`   │ ${line}`));
      });
      if (details.preview.split('\n').length > 5) {
        console.log(chalk[this.theme.muted](`   │ ... (${details.preview.split('\n').length - 5} more lines)`));
      }
    }
    
    if (details.changes && operation === 'edit') {
      console.log(chalk[this.theme.muted](`   Changed: ${details.changes.added || 0} added, ${details.changes.removed || 0} removed`));
    }
    
    console.log('');
  }

  /**
   * Format command execution display
   */
  formatCommandExecution(command, output, exitCode = 0) {
    const success = exitCode === 0;
    const icon = success ? '✓' : '✗';
    const color = success ? this.theme.success : this.theme.error;
    
    console.log('');
    console.log(chalk[color](`${icon} $ ${command}`));
    
    if (output && output.trim()) {
      const lines = output.trim().split('\n').slice(0, 10);
      lines.forEach(line => {
        console.log(chalk[this.theme.muted](`   ${line}`));
      });
      
      if (output.trim().split('\n').length > 10) {
        console.log(chalk[this.theme.muted](`   ... (${output.trim().split('\n').length - 10} more lines)`));
      }
    }
    
    console.log('');
  }

  /**
   * Format AI thinking/working indicator
   */
  displayThinking(message = 'Thinking') {
    console.log(chalk[this.theme.ai](`\n🤔 ${message}...`));
  }

  /**
   * Display step-by-step progress
   */
  displayStep(stepNumber, totalSteps, description, status = 'running') {
    const icons = {
      running: '⏳',
      complete: '✅',
      error: '❌',
      skipped: '⏭️'
    };

    const colors = {
      running: this.theme.info,
      complete: this.theme.success,
      error: this.theme.error,
      skipped: this.theme.muted
    };

    const icon = icons[status] || '▪️';
    const color = colors[status] || this.theme.info;
    
    console.log(chalk[color](`${icon} [${stepNumber}/${totalSteps}] ${description}`));
  }

  /**
   * Display a beautiful header
   */
  displayHeader(title, subtitle = null) {
    const width = Math.min(this.terminalWidth, 80);
    const line = '═'.repeat(width);
    
    console.log('');
    console.log(chalk[this.theme.accent](line));
    console.log(chalk.bold[this.theme.accent](this.centerText(title, width)));
    if (subtitle) {
      console.log(chalk[this.theme.muted](this.centerText(subtitle, width)));
    }
    console.log(chalk[this.theme.accent](line));
    console.log('');
  }

  /**
   * Display a section header
   */
  displaySection(title, icon = '📍') {
    console.log('');
    console.log(chalk.bold[this.theme.highlight](`${icon} ${title}`));
    console.log(chalk[this.theme.muted]('─'.repeat(Math.min(this.terminalWidth, 80))));
  }

  /**
   * Display a collapsible/expandable file tree
   */
  displayFileTree(structure, title = 'Project Structure', maxDepth = 3) {
    this.displaySection(title, '📁');
    
    const renderTree = (items, prefix = '', depth = 0) => {
      if (depth >= maxDepth) return;
      
      const entries = Object.entries(items);
      entries.forEach(([name, item], index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const icon = item.type === 'directory' ? '📁' : '📄';
        
        console.log(chalk[this.theme.muted](`${prefix}${connector}`) + chalk[this.theme.file](`${icon} ${name}`));
        
        if (item.type === 'directory' && item.children) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          renderTree(item.children, newPrefix, depth + 1);
        }
      });
    };
    
    renderTree(structure);
    console.log('');
  }

  /**
   * Display a pretty diff
   */
  displayDiff(filePath, oldContent, newContent) {
    console.log('');
    console.log(chalk[this.theme.file](`📝 Changes to ${filePath}`));
    console.log(chalk[this.theme.muted]('─'.repeat(Math.min(this.terminalWidth, 80))));
    
    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');
    
    // Simple diff display (showing first/last few lines)
    if (!oldContent) {
      // New file
      console.log(chalk[this.theme.success]('  + New file created'));
      newLines.slice(0, 5).forEach(line => {
        console.log(chalk.green(`  + ${line}`));
      });
      if (newLines.length > 5) {
        console.log(chalk[this.theme.muted](`  ... (${newLines.length - 5} more lines)`));
      }
    } else {
      // Modified file
      console.log(chalk[this.theme.info](`  Lines: ${oldLines.length} → ${newLines.length}`));
      console.log(chalk[this.theme.muted]('  (showing summary)'));
    }
    
    console.log('');
  }

  /**
   * Display a task list (todo list)
   */
  displayTaskList(tasks, title = 'Task List') {
    this.displaySection(title, '📝');
    
    tasks.forEach((task, index) => {
      const status = task.completed ? '✅' : task.inProgress ? '⏳' : '⬜';
      const color = task.completed ? this.theme.success : task.inProgress ? this.theme.info : this.theme.muted;
      const text = task.completed ? chalk.strikethrough(task.title) : task.title;
      
      console.log(chalk[color](`  ${status} ${index + 1}. ${text}`));
      
      if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach(subtask => {
          const subStatus = subtask.completed ? '✅' : '⬜';
          const subColor = subtask.completed ? this.theme.success : this.theme.muted;
          console.log(chalk[subColor](`     ${subStatus} ${subtask.title}`));
        });
      }
    });
    
    console.log('');
  }

  /**
   * Display a summary box
   */
  displaySummary(title, items, icon = '📊') {
    console.log('');
    console.log(chalk[this.theme.accent](`╭─ ${icon} ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`));
    
    items.forEach(item => {
      if (typeof item === 'string') {
        console.log(chalk[this.theme.muted](`│ ${item}`));
      } else if (item.label && item.value) {
        const label = item.label.padEnd(20);
        console.log(chalk[this.theme.muted](`│ ${label}`) + chalk.white(item.value));
      }
    });
    
    console.log(chalk[this.theme.accent](`╰${'─'.repeat(50)}`));
    console.log('');
  }

  /**
   * Display a progress bar
   */
  displayProgress(current, total, label = 'Progress') {
    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filledLength = Math.round((current / total) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    console.log(chalk[this.theme.info](`${label}: ${bar} ${percentage}% (${current}/${total})`));
  }

  /**
   * Display inline status update (overwrites line)
   */
  displayInlineStatus(message) {
    process.stdout.write('\r' + ' '.repeat(this.terminalWidth) + '\r');
    process.stdout.write(chalk[this.theme.info](message));
  }

  /**
   * Clear inline status
   */
  clearInlineStatus() {
    process.stdout.write('\r' + ' '.repeat(this.terminalWidth) + '\r');
  }

  /**
   * Display AI response with nice formatting
   */
  displayAIResponse(content) {
    // Parse and format markdown-like content
    const lines = content.split('\n');
    
    lines.forEach(line => {
      // Headers
      if (line.startsWith('### ')) {
        console.log(chalk.bold[this.theme.highlight](line.substring(4)));
      } else if (line.startsWith('## ')) {
        console.log(chalk.bold[this.theme.accent](line.substring(3)));
      } else if (line.startsWith('# ')) {
        console.log(chalk.bold.underline[this.theme.accent](line.substring(2)));
      }
      // Code blocks
      else if (line.startsWith('```')) {
        console.log(chalk[this.theme.muted](line));
      }
      // Lists
      else if (line.match(/^(\s*)([-*+]|\d+\.)\s/)) {
        console.log(chalk[this.theme.info](line));
      }
      // Quotes
      else if (line.startsWith('> ')) {
        console.log(chalk[this.theme.muted]('│ ') + chalk.italic(line.substring(2)));
      }
      // Bold text
      else if (line.includes('**')) {
        const formatted = line.replace(/\*\*(.*?)\*\*/g, (_, text) => chalk.bold(text));
        console.log(formatted);
      }
      // Regular text
      else {
        console.log(line);
      }
    });
  }

  /**
   * Display error with context
   */
  displayError(error, context = null) {
    console.log('');
    console.log(chalk[this.theme.error]('╭─ ❌ Error ─────────────────────────────────────'));
    console.log(chalk[this.theme.error](`│ ${error.message || error}`));
    
    if (context) {
      console.log(chalk[this.theme.error]('│'));
      console.log(chalk[this.theme.muted](`│ Context: ${context}`));
    }
    
    if (error.stack && process.env.RECODER_DEBUG) {
      console.log(chalk[this.theme.error]('│'));
      console.log(chalk[this.theme.muted]('│ Stack trace:'));
      const stackLines = error.stack.split('\n').slice(0, 3);
      stackLines.forEach(line => {
        console.log(chalk[this.theme.muted](`│   ${line.trim()}`));
      });
    }
    
    console.log(chalk[this.theme.error]('╰────────────────────────────────────────────────'));
    console.log('');
  }

  /**
   * Display success message
   */
  displaySuccess(message, details = []) {
    console.log('');
    console.log(chalk[this.theme.success](`✅ ${message}`));
    
    if (details.length > 0) {
      details.forEach(detail => {
        console.log(chalk[this.theme.muted](`   ${detail}`));
      });
    }
    
    console.log('');
  }

  /**
   * Display warning
   */
  displayWarning(message, suggestions = []) {
    console.log('');
    console.log(chalk[this.theme.warning](`⚠️  ${message}`));
    
    if (suggestions.length > 0) {
      console.log(chalk[this.theme.muted]('   Suggestions:'));
      suggestions.forEach(suggestion => {
        console.log(chalk[this.theme.info](`   • ${suggestion}`));
      });
    }
    
    console.log('');
  }

  /**
   * Center text
   */
  centerText(text, width) {
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(Math.max(0, padding)) + text;
  }

  /**
   * Format file path with icon
   */
  formatFilePath(filePath, operation = null) {
    const ext = path.extname(filePath);
    const icons = {
      '.js': '📜',
      '.ts': '📘',
      '.jsx': '⚛️',
      '.tsx': '⚛️',
      '.py': '🐍',
      '.java': '☕',
      '.go': '🔷',
      '.rs': '🦀',
      '.json': '📋',
      '.md': '📝',
      '.html': '🌐',
      '.css': '🎨',
      '.yml': '⚙️',
      '.yaml': '⚙️'
    };

    const icon = icons[ext] || '📄';
    return `${icon} ${filePath}`;
  }

  /**
   * Display typing animation for streaming
   */
  startTypingAnimation(message = 'AI is typing') {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    const interval = setInterval(() => {
      process.stdout.write('\r' + chalk[this.theme.ai](`${frames[i]} ${message}...`));
      i = (i + 1) % frames.length;
    }, 80);
    
    return interval;
  }

  stopTypingAnimation(interval) {
    if (interval) {
      clearInterval(interval);
      this.clearInlineStatus();
    }
  }
}

module.exports = EnhancedOutputFormatter;
