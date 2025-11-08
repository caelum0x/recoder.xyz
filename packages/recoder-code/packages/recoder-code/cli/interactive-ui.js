/**
 * Interactive UI System
 * Enhanced terminal UI with status, progress bars, and visual feedback
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class InteractiveUI {
  constructor(options = {}) {
    this.showStatus = options.showStatus !== false;
    this.showProgress = options.showProgress !== false;
    this.animations = options.animations !== false;
    this.currentStatus = null;
    this.progressBar = null;
  }

  /**
   * Display a status indicator
   */
  showStatusIndicator(message, type = 'info') {
    if (!this.showStatus) return;

    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      loading: '⏳',
      thinking: '🤔',
      file: '📄',
      folder: '📁',
      git: '🔀',
      search: '🔍'
    };

    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      loading: chalk.cyan,
      thinking: chalk.magenta,
      file: chalk.white,
      folder: chalk.blue,
      git: chalk.yellow,
      search: chalk.cyan
    };

    const icon = icons[type] || icons.info;
    const color = colors[type] || colors.info;

    console.log(color(`${icon} ${message}`));
    this.currentStatus = { message, type, timestamp: Date.now() };
  }

  /**
   * Create a progress bar
   */
  createProgressBar(total, label = 'Progress') {
    if (!this.showProgress) {
      return {
        update: () => {},
        complete: () => {},
        increment: () => {}
      };
    }

    let current = 0;
    const barLength = 40;

    const render = () => {
      const percentage = (current / total) * 100;
      const filled = Math.floor((current / total) * barLength);
      const empty = barLength - filled;
      
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const percentStr = percentage.toFixed(1).padStart(5);
      
      process.stdout.write(`\r${chalk.cyan(label)}: [${chalk.green(bar)}] ${percentStr}% (${current}/${total})`);
    };

    return {
      update: (value) => {
        current = Math.min(value, total);
        render();
      },
      increment: (amount = 1) => {
        current = Math.min(current + amount, total);
        render();
      },
      complete: () => {
        current = total;
        render();
        process.stdout.write('\n');
      }
    };
  }

  /**
   * Show a spinner animation
   */
  showSpinner(message) {
    if (!this.animations) {
      console.log(message);
      return { stop: () => {} };
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let index = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[index])} ${message}`);
      index = (index + 1) % frames.length;
    }, 80);

    return {
      stop: () => {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r');
      }
    };
  }

  /**
   * Display a formatted header
   */
  displayHeader(title, subtitle = '') {
    console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
    console.log(chalk.bold.white(`  ${title}`));
    if (subtitle) {
      console.log(chalk.gray(`  ${subtitle}`));
    }
    console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
  }

  /**
   * Display a section divider
   */
  displayDivider(label = '') {
    if (label) {
      console.log(chalk.gray(`\n── ${label} ${'─'.repeat(Math.max(0, 54 - label.length))}\n`));
    } else {
      console.log(chalk.gray('─'.repeat(60)));
    }
  }

  /**
   * Display a file tree item
   */
  displayFileTreeItem(item, depth = 0, isLast = false) {
    const indent = '  '.repeat(depth);
    const connector = isLast ? '└─' : '├─';
    const icon = item.type === 'directory' ? '📁' : '📄';
    const name = item.type === 'directory' ? chalk.blue(item.name) : chalk.white(item.name);
    
    console.log(`${indent}${chalk.gray(connector)} ${icon} ${name}`);
  }

  /**
   * Display context information
   */
  displayContextInfo(context) {
    console.log(chalk.cyan('\n📋 Context Information:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    if (context.files) {
      console.log(chalk.white(`Files tracked: ${context.files.length}`));
    }
    if (context.folders) {
      console.log(chalk.white(`Folders tracked: ${context.folders.length}`));
    }
    if (context.gitStatus) {
      console.log(chalk.white(`Git status: ${context.gitStatus}`));
    }
    if (context.totalSize) {
      console.log(chalk.white(`Total size: ${this.formatBytes(context.totalSize)}`));
    }
    
    console.log(chalk.gray('─'.repeat(60)) + '\n');
  }

  /**
   * Display token usage
   */
  displayTokenUsage(usage) {
    const { input, output, total, limit } = usage;
    const percentage = (total / limit) * 100;
    
    let color;
    if (percentage < 50) color = chalk.green;
    else if (percentage < 80) color = chalk.yellow;
    else color = chalk.red;

    console.log(color(`\n📊 Token Usage: ${total.toLocaleString()} / ${limit.toLocaleString()} (${percentage.toFixed(1)}%)`));
    console.log(chalk.gray(`   Input: ${input.toLocaleString()} | Output: ${output.toLocaleString()}\n`));
  }

  /**
   * Display a table
   */
  displayTable(headers, rows) {
    const columnWidths = headers.map((header, i) => {
      const maxContentWidth = Math.max(
        header.length,
        ...rows.map(row => String(row[i] || '').length)
      );
      return Math.min(maxContentWidth, 50); // Max column width
    });

    // Header
    const headerRow = headers
      .map((header, i) => header.padEnd(columnWidths[i]))
      .join(' │ ');
    console.log(chalk.cyan('\n┌─' + '─'.repeat(headerRow.length) + '─┐'));
    console.log(chalk.cyan('│ ') + chalk.bold(headerRow) + chalk.cyan(' │'));
    console.log(chalk.cyan('├─' + '─'.repeat(headerRow.length) + '─┤'));

    // Rows
    rows.forEach(row => {
      const rowStr = row
        .map((cell, i) => String(cell || '').padEnd(columnWidths[i]))
        .join(' │ ');
      console.log(chalk.cyan('│ ') + rowStr + chalk.cyan(' │'));
    });

    console.log(chalk.cyan('└─' + '─'.repeat(headerRow.length) + '─┘\n'));
  }

  /**
   * Display a success message
   */
  displaySuccess(message) {
    console.log(chalk.green.bold('\n✅ ' + message + '\n'));
  }

  /**
   * Display an error message
   */
  displayError(message, details = null) {
    console.log(chalk.red.bold('\n❌ ' + message));
    if (details) {
      console.log(chalk.red(details));
    }
    console.log();
  }

  /**
   * Display a warning message
   */
  displayWarning(message) {
    console.log(chalk.yellow.bold('\n⚠️  ' + message + '\n'));
  }

  /**
   * Display an info box
   */
  displayInfoBox(title, content) {
    const width = 60;
    console.log(chalk.blue('\n┌─' + '─'.repeat(width - 2) + '┐'));
    console.log(chalk.blue('│ ') + chalk.bold(title.padEnd(width - 2)) + chalk.blue('│'));
    console.log(chalk.blue('├─' + '─'.repeat(width - 2) + '┤'));
    
    const lines = content.split('\n');
    lines.forEach(line => {
      console.log(chalk.blue('│ ') + line.padEnd(width - 2) + chalk.blue('│'));
    });
    
    console.log(chalk.blue('└─' + '─'.repeat(width - 2) + '┘\n'));
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format duration to human readable
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Clear console
   */
  clear() {
    console.clear();
  }

  /**
   * Display help information
   */
  displayHelp(commands) {
    this.displayHeader('Available Commands', 'Type any command to get started');
    
    Object.entries(commands).forEach(([cmd, desc]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(20)}`), chalk.gray(desc));
    });
    
    console.log();
  }
}

module.exports = InteractiveUI;
