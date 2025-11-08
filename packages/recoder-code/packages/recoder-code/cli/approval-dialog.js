const readline = require('readline');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Approval Dialog System - Claude Code Style
 * Multi-choice numbered options with preferences
 */
class ApprovalDialog {
  constructor(rl) {
    this.rl = rl;
    this.preferences = new Map(); // Store "don't ask again" preferences
  }

  /**
   * Show bash command approval with multi-choice options
   */
  async showBashApproval(command, description = '') {
    const width = 90;

    // Build dialog
    console.log('');
    console.log(chalk.cyan('╭' + '─'.repeat(width - 2) + '╮'));
    console.log(chalk.cyan('│') + chalk.bold(' Bash command') + ' '.repeat(width - 15) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '  ' + chalk.white(this.truncate(command, width - 6)) + ' '.repeat(Math.max(0, width - 6 - command.length)) + chalk.cyan('│'));

    if (description) {
      console.log(chalk.cyan('│') + '  ' + chalk.dim(this.truncate(description, width - 6)) + ' '.repeat(Math.max(0, width - 6 - description.length)) + chalk.cyan('│'));
    }

    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white(' Do you want to proceed?') + ' '.repeat(width - 28) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(' ❯ 1. ') + chalk.white('Yes') + ' '.repeat(width - 13) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('2. ') + chalk.white('Yes, and don\'t ask again for bash commands') + ' '.repeat(Math.max(0, width - 51)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('3. ') + chalk.white('No, and tell Claude what to do differently ') + chalk.dim('(esc)') + ' '.repeat(Math.max(0, width - 58)) + chalk.cyan('│'));
    console.log(chalk.cyan('╰' + '─'.repeat(width - 2) + '╯'));
    console.log('');

    return this.waitForChoice(3);
  }

  /**
   * Show file operation approval with multi-choice options
   */
  async showFileApproval(operation, filePath, diff, stats = {}) {
    const width = 90;
    const { additions = 0, deletions = 0 } = stats;

    // Determine operation type
    let title = 'File Operation';
    let descText = '';

    if (operation === 'create') {
      title = 'File Creation';
      descText = `Create ${filePath}`;
    } else if (operation === 'str_replace') {
      title = 'File Edit';
      descText = `Modify ${filePath} (${additions > 0 ? '+' + additions : ''}${deletions > 0 ? ' -' + deletions : ''})`;
    }

    // Build dialog
    console.log('');
    console.log(chalk.cyan('╭' + '─'.repeat(width - 2) + '╮'));
    console.log(chalk.cyan('│') + chalk.bold(` ${title}`) + ' '.repeat(width - title.length - 3) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '  ' + chalk.white(this.truncate(descText, width - 6)) + ' '.repeat(Math.max(0, width - 6 - descText.length)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));

    // Show truncated diff
    const diffLines = diff.split('\n').slice(0, 8);
    diffLines.forEach(line => {
      const displayLine = this.truncate(line, width - 6);
      console.log(chalk.cyan('│') + '  ' + displayLine + ' '.repeat(Math.max(0, width - 4 - displayLine.length)) + chalk.cyan('│'));
    });

    if (diff.split('\n').length > 8) {
      const remaining = diff.split('\n').length - 8;
      console.log(chalk.cyan('│') + '  ' + chalk.yellow(`… +${remaining} lines `) + chalk.dim('(ctrl+o to expand)') + ' '.repeat(Math.max(0, width - 30 - remaining.toString().length)) + chalk.cyan('│'));
    }

    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white(' Do you want to proceed?') + ' '.repeat(width - 28) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(' ❯ 1. ') + chalk.white('Yes') + ' '.repeat(width - 13) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('2. ') + chalk.white('Yes, and auto-accept all remaining changes') + ' '.repeat(Math.max(0, width - 50)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('3. ') + chalk.white('No, skip this change') + ' '.repeat(width - 28) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('4. ') + chalk.white('No, and tell Claude what to change ') + chalk.dim('(esc)') + ' '.repeat(Math.max(0, width - 50)) + chalk.cyan('│'));
    console.log(chalk.cyan('╰' + '─'.repeat(width - 2) + '╯'));
    console.log('');

    return this.waitForChoice(4);
  }

  /**
   * Wait for user to select a numbered choice
   */
  async waitForChoice(maxChoice) {
    return new Promise((resolve) => {
      const handleInput = (input) => {
        const choice = input.trim();

        // Handle escape key
        if (input === '\x1b') {
          cleanup();
          resolve({ choice: maxChoice, alternative: true }); // Last option is always "tell me what to do"
          return;
        }

        // Handle numbered choices
        const num = parseInt(choice);
        if (num >= 1 && num <= maxChoice) {
          cleanup();
          resolve({ choice: num, alternative: false });
          return;
        }

        // Invalid input - show again
        process.stdout.write(chalk.red('Invalid choice. ') + chalk.dim(`Enter 1-${maxChoice}: `));
      };

      const cleanup = () => {
        process.stdin.removeListener('data', handleInput);
      };

      // Listen for keypress
      process.stdout.write(chalk.dim(`Enter choice (1-${maxChoice}): `));
      process.stdin.once('data', handleInput);
    });
  }

  /**
   * Show simple yes/no confirmation
   */
  async showConfirmation(message) {
    const width = 90;

    console.log('');
    console.log(chalk.cyan('╭' + '─'.repeat(width - 2) + '╮'));
    console.log(chalk.cyan('│') + '  ' + chalk.white(this.truncate(message, width - 6)) + ' '.repeat(Math.max(0, width - 6 - message.length)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' '.repeat(width - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(' ❯ 1. ') + chalk.white('Yes') + ' '.repeat(width - 13) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + '   ' + chalk.dim('2. ') + chalk.white('No') + ' '.repeat(width - 12) + chalk.cyan('│'));
    console.log(chalk.cyan('╰' + '─'.repeat(width - 2) + '╯'));
    console.log('');

    const result = await this.waitForChoice(2);
    return result.choice === 1;
  }

  /**
   * Store preference to not ask again
   */
  setPreference(key, value) {
    this.preferences.set(key, value);
  }

  /**
   * Check if we should ask based on preferences
   */
  shouldAsk(key) {
    return !this.preferences.has(key);
  }

  /**
   * Clear all preferences
   */
  clearPreferences() {
    this.preferences.clear();
  }

  /**
   * Truncate text to fit width
   */
  truncate(text, maxLength) {
    // Remove ANSI codes for length calculation
    const plainText = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (plainText.length <= maxLength) return text;

    // Find position in original text that corresponds to maxLength in plain text
    let plainPos = 0;
    let textPos = 0;
    while (plainPos < maxLength - 3 && textPos < text.length) {
      if (text.substr(textPos, 2) === '\x1b[') {
        // Skip ANSI code
        const endPos = text.indexOf('m', textPos);
        if (endPos > -1) {
          textPos = endPos + 1;
        } else {
          textPos++;
        }
      } else {
        plainPos++;
        textPos++;
      }
    }

    return text.substring(0, textPos) + '...';
  }

  /**
   * Format diff for display in dialog
   */
  formatDiffForDialog(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    let formatted = [];
    for (let i = 0; i < Math.min(maxLines, 8); i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      const lineNum = String(i + 1).padStart(3, ' ');

      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          formatted.push(chalk.red(`-${lineNum}  ${oldLine}`));
        }
        if (newLine !== undefined) {
          formatted.push(chalk.green(`+${lineNum}  ${newLine}`));
        }
      } else {
        formatted.push(chalk.dim(` ${lineNum}  ${oldLine || ''}`));
      }
    }

    return formatted.join('\n');
  }
}

module.exports = ApprovalDialog;
