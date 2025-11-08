const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Diff Generator for Recoder Code
 * Generates visual diffs for file operations
 * Similar to Claude Code and OpenCode diff displays
 */
class DiffGenerator {
  constructor() {
    this.maxDiffLines = 200; // Recommended by Claude Code

    // File type icons mapping
    this.fileIcons = {
      '.js': '📜',
      '.ts': '📘',
      '.jsx': '⚛️',
      '.tsx': '⚛️',
      '.py': '🐍',
      '.rb': '💎',
      '.go': '🔷',
      '.rs': '🦀',
      '.java': '☕',
      '.cpp': '⚙️',
      '.c': '⚙️',
      '.php': '🐘',
      '.html': '🌐',
      '.css': '🎨',
      '.scss': '🎨',
      '.json': '📋',
      '.md': '📝',
      '.yaml': '⚙️',
      '.yml': '⚙️',
      '.xml': '📄',
      '.sh': '🔧',
      '.sql': '🗃️',
      '.txt': '📄',
      '.log': '📊'
    };
  }

  /**
   * Get icon for file type
   */
  getFileIcon(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.fileIcons[ext] || '📄';
  }

  /**
   * Generate diff for any file operation
   * @param {string} operation - 'create', 'str_replace', 'view'
   * @param {string} filePath
   * @param {string} oldContent
   * @param {string} newContent
   * @returns {string} - Formatted diff
   */
  generateDiff(operation, filePath, oldContent = '', newContent = '') {
    if (operation === 'create') {
      return this.generateCreateDiff(filePath, newContent);
    } else if (operation === 'str_replace') {
      return this.generateEditDiff(filePath, oldContent, newContent);
    } else if (operation === 'view') {
      return this.generateViewDiff(filePath, oldContent);
    }
    return '';
  }

  /**
   * Generate diff for file creation
   */
  generateCreateDiff(filePath, content) {
    const lines = content.split('\n');
    const size = Buffer.byteLength(content, 'utf8');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);
    const icon = this.getFileIcon(filePath);

    // Build header
    let diff = '\n';
    diff += chalk.cyan('┌' + '─'.repeat(58) + '┐\n');
    diff += chalk.cyan('│ ') + chalk.bold.green(`${icon} Create: `) + chalk.bold(fileName);
    diff += ' '.repeat(Math.max(0, 58 - 14 - fileName.length)) + chalk.cyan('│\n');
    diff += chalk.cyan('│ ') + chalk.dim(`Size: ${this.formatBytes(size)} | Lines: ${lines.length} | Type: ${ext || 'txt'}`);
    diff += ' '.repeat(Math.max(0, 58 - 35 - ext.length - size.toString().length - lines.length.toString().length)) + chalk.cyan('│\n');
    diff += chalk.cyan('├' + '─'.repeat(58) + '┤\n');

    // Show content with line numbers (limit to max lines)
    const displayLines = lines.slice(0, this.maxDiffLines);
    const lineNumWidth = displayLines.length.toString().length;

    displayLines.forEach((line, i) => {
      const lineNum = (i + 1).toString().padStart(lineNumWidth, ' ');
      const displayLine = this.truncateLine(line, 52);
      diff += chalk.cyan('│ ') + chalk.green(`+ ${lineNum} │ ${displayLine}`);
      diff += ' '.repeat(Math.max(0, 58 - 6 - lineNumWidth - displayLine.length)) + chalk.cyan('│\n');
    });

    if (lines.length > this.maxDiffLines) {
      diff += chalk.cyan('│ ') + chalk.dim(`... ${lines.length - this.maxDiffLines} more lines`);
      diff += ' '.repeat(Math.max(0, 58 - 15 - (lines.length - this.maxDiffLines).toString().length)) + chalk.cyan('│\n');
    }

    // Footer
    diff += chalk.cyan('├' + '─'.repeat(58) + '┤\n');
    diff += chalk.cyan('│ ') + chalk.green(`+${lines.length} lines to add`);
    diff += ' '.repeat(Math.max(0, 58 - 17 - lines.length.toString().length)) + chalk.cyan('│\n');
    diff += chalk.cyan('└' + '─'.repeat(58) + '┘\n');

    return diff;
  }

  /**
   * Generate diff for file editing
   */
  generateEditDiff(filePath, oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const fileName = path.basename(filePath);
    const icon = this.getFileIcon(filePath);

    // Calculate stats
    const oldSize = Buffer.byteLength(oldContent, 'utf8');
    const newSize = Buffer.byteLength(newContent, 'utf8');
    const sizeDiff = newSize - oldSize;
    const lineDiff = newLines.length - oldLines.length;

    // Build header
    let diff = '\n';
    diff += chalk.cyan('┌' + '─'.repeat(58) + '┐\n');
    diff += chalk.cyan('│ ') + chalk.bold.yellow(`${icon} Edit: `) + chalk.bold(fileName);
    diff += ' '.repeat(Math.max(0, 58 - 13 - fileName.length)) + chalk.cyan('│\n');
    diff += chalk.cyan('│ ') + chalk.dim(`Lines: ${oldLines.length} → ${newLines.length} (${lineDiff >= 0 ? '+' : ''}${lineDiff})`);
    diff += ' '.repeat(Math.max(0, 58 - 20 - oldLines.length.toString().length - newLines.length.toString().length - lineDiff.toString().length)) + chalk.cyan('│\n');
    diff += chalk.cyan('├' + '─'.repeat(58) + '┤\n');

    // Generate unified diff
    const diffLines = this.generateUnifiedDiff(oldLines, newLines);
    const displayLines = diffLines.slice(0, this.maxDiffLines);

    displayLines.forEach(({ type, lineNum, content }) => {
      const displayLine = this.truncateLine(content, 48);
      const num = lineNum.toString().padStart(3, ' ');

      if (type === 'add') {
        diff += chalk.cyan('│ ') + chalk.green(`+ ${num} │ ${displayLine}`);
        diff += ' '.repeat(Math.max(0, 58 - 8 - displayLine.length)) + chalk.cyan('│\n');
      } else if (type === 'remove') {
        diff += chalk.cyan('│ ') + chalk.red(`- ${num} │ ${displayLine}`);
        diff += ' '.repeat(Math.max(0, 58 - 8 - displayLine.length)) + chalk.cyan('│\n');
      } else {
        diff += chalk.cyan('│ ') + chalk.dim(`  ${num} │ ${displayLine}`);
        diff += ' '.repeat(Math.max(0, 58 - 8 - displayLine.length)) + chalk.cyan('│\n');
      }
    });

    if (diffLines.length > this.maxDiffLines) {
      diff += chalk.cyan('│ ') + chalk.dim(`... ${diffLines.length - this.maxDiffLines} more lines`);
      diff += ' '.repeat(Math.max(0, 58 - 15 - (diffLines.length - this.maxDiffLines).toString().length)) + chalk.cyan('│\n');
    }

    // Footer with stats
    diff += chalk.cyan('├' + '─'.repeat(58) + '┤\n');
    const added = diffLines.filter(l => l.type === 'add').length;
    const removed = diffLines.filter(l => l.type === 'remove').length;
    diff += chalk.cyan('│ ') + chalk.dim(`Changes: `) + chalk.green(`+${added}`) + chalk.dim(' ') + chalk.red(`-${removed}`);
    diff += ' '.repeat(Math.max(0, 58 - 14 - added.toString().length - removed.toString().length)) + chalk.cyan('│\n');
    diff += chalk.cyan('└' + '─'.repeat(58) + '┘\n');

    return diff;
  }

  /**
   * Generate view-only diff (for file preview)
   */
  generateViewDiff(filePath, content) {
    const lines = content.split('\n');
    const size = Buffer.byteLength(content, 'utf8');
    const fileName = path.basename(filePath);
    const icon = this.getFileIcon(filePath);

    let diff = '\n';
    diff += chalk.cyan('┌' + '─'.repeat(58) + '┐\n');
    diff += chalk.cyan('│ ') + chalk.bold.blue(`${icon} View: `) + chalk.bold(fileName);
    diff += ' '.repeat(Math.max(0, 58 - 13 - fileName.length)) + chalk.cyan('│\n');
    diff += chalk.cyan('│ ') + chalk.dim(`Size: ${this.formatBytes(size)} | Lines: ${lines.length}`);
    diff += ' '.repeat(Math.max(0, 58 - 25 - size.toString().length - lines.length.toString().length)) + chalk.cyan('│\n');
    diff += chalk.cyan('├' + '─'.repeat(58) + '┤\n');

    const displayLines = lines.slice(0, this.maxDiffLines);
    const lineNumWidth = displayLines.length.toString().length;

    displayLines.forEach((line, i) => {
      const lineNum = (i + 1).toString().padStart(lineNumWidth, ' ');
      const displayLine = this.truncateLine(line, 52 - lineNumWidth);
      diff += chalk.cyan('│ ') + chalk.dim(`${lineNum} │ ${displayLine}`);
      diff += ' '.repeat(Math.max(0, 58 - 4 - lineNumWidth - displayLine.length)) + chalk.cyan('│\n');
    });

    if (lines.length > this.maxDiffLines) {
      diff += chalk.cyan('│ ') + chalk.dim(`... ${lines.length - this.maxDiffLines} more lines`);
      diff += ' '.repeat(Math.max(0, 58 - 15 - (lines.length - this.maxDiffLines).toString().length)) + chalk.cyan('│\n');
    }

    diff += chalk.cyan('└' + '─'.repeat(58) + '┘\n');

    return diff;
  }

  /**
   * Generate unified diff from two arrays of lines
   * Returns array of { type, lineNum, content }
   */
  generateUnifiedDiff(oldLines, newLines) {
    const diff = [];
    const maxLines = Math.max(oldLines.length, newLines.length);

    // Simple line-by-line diff (can be enhanced with better algorithm)
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];

      if (oldLine === newLine) {
        // Unchanged line
        diff.push({ type: 'context', lineNum: newIdx + 1, content: newLine });
        oldIdx++;
        newIdx++;
      } else if (oldIdx >= oldLines.length) {
        // Only new lines left
        diff.push({ type: 'add', lineNum: newIdx + 1, content: newLine });
        newIdx++;
      } else if (newIdx >= newLines.length) {
        // Only old lines left
        diff.push({ type: 'remove', lineNum: oldIdx + 1, content: oldLine });
        oldIdx++;
      } else {
        // Lines differ - simple approach: mark as remove + add
        diff.push({ type: 'remove', lineNum: oldIdx + 1, content: oldLine });
        diff.push({ type: 'add', lineNum: newIdx + 1, content: newLine });
        oldIdx++;
        newIdx++;
      }
    }

    return diff;
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  /**
   * Truncate line to max width
   */
  truncateLine(line, maxWidth) {
    if (line.length <= maxWidth) return line;
    return line.substring(0, maxWidth - 3) + '...';
  }
}

module.exports = DiffGenerator;
