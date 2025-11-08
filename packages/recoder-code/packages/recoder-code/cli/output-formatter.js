const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Output Formatter for Claude Code-style display
 * Provides collapsible sections, progress indicators, and clean formatting
 */
class OutputFormatter {
  constructor() {
    this.collapsedSections = new Map();
    this.truncateLength = 10; // Show first N lines by default
  }

  /**
   * Format tool execution header (like Claude Code's ⏺ Bash(...))
   */
  formatToolHeader(toolName, args) {
    let header = chalk.dim('⏺ ');

    switch (toolName) {
      case 'bash':
        header += chalk.cyan(`Bash(${this.truncateArg(args.command)})`);
        break;
      case 'str_replace_editor':
        header += chalk.cyan(`Edit(${args.command} ${this.truncateArg(args.path)})`);
        break;
      case 'codebase_search':
        header += chalk.cyan(`Search(${this.truncateArg(args.query)})`);
        break;
      case 'web_fetch':
        header += chalk.cyan(`WebFetch(${this.truncateArg(args.url)})`);
        break;
      default:
        header += chalk.cyan(`${toolName}(...)`);
    }

    return header;
  }

  /**
   * Format tool execution body with collapsible output
   */
  formatToolBody(output, sectionId, truncate = true) {
    if (!output) return '';

    const lines = output.split('\n');
    const totalLines = lines.length;

    if (!truncate || totalLines <= this.truncateLength) {
      // Show all lines with indent
      return lines.map(line => chalk.dim('  ⎿  ') + line).join('\n');
    }

    // Show truncated with expand option
    const visibleLines = lines.slice(0, this.truncateLength);
    const hiddenCount = totalLines - this.truncateLength;

    let formatted = visibleLines.map(line => chalk.dim('  ⎿  ') + line).join('\n');
    formatted += '\n' + chalk.dim('  ⎿  ') + chalk.yellow(`… +${hiddenCount} lines `) + chalk.dim('(ctrl+o to expand)');

    // Store full output for expansion
    this.collapsedSections.set(sectionId, lines);

    return formatted;
  }

  /**
   * Format thinking/processing indicator
   */
  formatThinking(message = 'Thinking') {
    return chalk.dim('✳ ') + chalk.cyan(message) + chalk.dim('…');
  }

  /**
   * Format status line (bottom bar like Claude Code)
   */
  formatStatusBar(mode, sessionInfo = {}) {
    const modeIcons = {
      ask: '⏸',
      auto: '⏵⏵',
      plan: '📖',
      build: '🔨'
    };

    const modeIcon = modeIcons[mode] || '⏸';
    const modeText = mode === 'auto' ? 'accept edits on' : mode + ' mode';

    let status = chalk.dim('  ') + modeIcon + chalk.dim(` ${modeText} `);
    status += chalk.dim('(shift+tab to cycle)');

    // Add background tasks if any
    if (sessionInfo.backgroundTasks > 0) {
      status += chalk.dim(` · ${sessionInfo.backgroundTasks} background task${sessionInfo.backgroundTasks > 1 ? 's' : ''}`);
    }

    // Add shortcuts hint
    status += chalk.dim(' · ? for shortcuts');

    // Add context info
    if (sessionInfo.contextUsage) {
      status += chalk.dim(`     Context left: ${sessionInfo.contextUsage}%`);
    }

    return status;
  }

  /**
   * Format separator line
   */
  formatSeparator(width = 90) {
    return chalk.dim('─'.repeat(width));
  }

  /**
   * Format success message (like Claude Code's ⏺ Perfect! ...)
   */
  formatSuccess(message) {
    return chalk.dim('⏺ ') + chalk.green(message);
  }

  /**
   * Format error message
   */
  formatError(message) {
    return chalk.dim('⏺ ') + chalk.red('Error: ') + message;
  }

  /**
   * Format info message
   */
  formatInfo(message) {
    return chalk.dim('⏺ ') + chalk.cyan(message);
  }

  /**
   * Truncate argument for display
   */
  truncateArg(arg, maxLength = 50) {
    if (!arg) return '';
    const str = String(arg);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format multi-line output with proper indentation
   */
  formatIndented(text, indent = '  ') {
    const lines = text.split('\n');
    return lines.map(line => chalk.dim(indent + '⎿  ') + line).join('\n');
  }

  /**
   * Format code block
   */
  formatCodeBlock(code, language = '') {
    const lines = code.split('\n');
    return lines.map((line, i) => {
      const lineNum = String(i + 1).padStart(3, ' ');
      return chalk.dim(`  ${lineNum} `) + chalk.gray('│ ') + line;
    }).join('\n');
  }

  /**
   * Expand collapsed section
   */
  expandSection(sectionId) {
    const lines = this.collapsedSections.get(sectionId);
    if (!lines) return null;

    return lines.map(line => chalk.dim('  ⎿  ') + line).join('\n');
  }

  /**
   * Format progress with spinner
   */
  formatProgress(message, step = 0, total = 0) {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinner = spinners[step % spinners.length];

    let progress = chalk.cyan(spinner) + ' ' + message;

    if (total > 0) {
      progress += chalk.dim(` (${step}/${total})`);
    }

    return progress;
  }

  /**
   * Format file tree structure
   */
  formatFileTree(files, depth = 0) {
    const indent = '  '.repeat(depth);
    return files.map(file => {
      const icon = file.isDirectory ? '📁' : this.getFileIcon(file.name);
      return chalk.dim(indent) + icon + ' ' + chalk.white(file.name);
    }).join('\n');
  }

  /**
   * Get file icon by extension
   */
  getFileIcon(filename) {
    const ext = filename.split('.').pop();
    const icons = {
      'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
      'py': '🐍', 'rb': '💎', 'go': '🔷', 'rs': '🦀',
      'java': '☕', 'cpp': '⚙️', 'c': '⚙️', 'php': '🐘',
      'html': '🌐', 'css': '🎨', 'json': '📋', 'md': '📝',
      'yaml': '⚙️', 'yml': '⚙️', 'xml': '📄', 'sh': '🔧',
      'sql': '🗃️', 'txt': '📄', 'log': '📊'
    };
    return icons[ext] || '📄';
  }

  /**
   * Format list with bullets
   */
  formatList(items, bullet = '•') {
    return items.map(item => chalk.dim('  ' + bullet + ' ') + item).join('\n');
  }

  /**
   * Format numbered list
   */
  formatNumberedList(items) {
    return items.map((item, i) => {
      const num = String(i + 1).padStart(2, ' ');
      return chalk.dim(`  ${num}. `) + item;
    }).join('\n');
  }

  /**
   * Clear current line
   */
  clearLine() {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Move cursor up N lines
   */
  moveCursorUp(lines = 1) {
    process.stdout.write(`\x1b[${lines}A`);
  }

  /**
   * Format elapsed time
   */
  formatElapsedTime(startTime) {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}

module.exports = OutputFormatter;
