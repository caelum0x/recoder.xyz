const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Permission Manager for Recoder Code
 * Manages approval workflows for file operations and commands
 * Similar to Claude Code and OpenCode permission systems
 */
class PermissionManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.recoder-code', 'config.json');
    this.config = this.loadConfig();
    this.sessionAutoAccept = false;
    this.sessionMode = null; // Override config mode for current session
  }

  /**
   * Load configuration from ~/.recoder-code/config.json
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);

        // Ensure permission object exists
        if (!config.permission) {
          config.permission = this.getDefaultPermissions();
        }

        return config;
      }
    } catch (error) {
      // Silent error - use defaults
    }

    // Default configuration
    return {
      permission: this.getDefaultPermissions()
    };
  }

  /**
   * Get default permission settings
   */
  getDefaultPermissions() {
    return {
      mode: 'ask',        // 'ask', 'auto', 'deny'
      edit: 'ask',        // File editing permission
      bash: 'ask',        // Bash command permission
      autoAcceptAll: false
    };
  }

  /**
   * Save configuration to ~/.recoder-code/config.json
   */
  saveConfig() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if we should ask for permission for a specific operation
   * @param {string} operation - 'edit', 'bash', 'web_fetch', etc.
   * @returns {boolean} - true if should ask, false if auto-approve
   */
  shouldAskPermission(operation) {
    // Ensure config and permission object exist
    if (!this.config || !this.config.permission) {
      this.config = { permission: this.getDefaultPermissions() };
    }

    // Session auto-accept overrides everything
    if (this.sessionAutoAccept) {
      return false;
    }

    // Session mode overrides config
    const mode = this.sessionMode || this.config.permission.mode || 'ask';

    // Check global mode first
    if (mode === 'auto') {
      return false;
    }

    if (mode === 'deny') {
      return true; // Will be denied, but still "ask"
    }

    // Check operation-specific permission
    const operationPerm = this.config.permission[operation] || 'ask';
    if (operationPerm === 'allow') {
      return false;
    }

    if (operationPerm === 'deny') {
      return true;
    }

    // Default to ask
    return true;
  }

  /**
   * Check if an operation is denied
   * @param {string} operation
   * @returns {boolean}
   */
  isDenied(operation) {
    // Ensure config and permission object exist
    if (!this.config || !this.config.permission) {
      this.config = { permission: this.getDefaultPermissions() };
    }

    const mode = this.sessionMode || this.config.permission.mode || 'ask';

    if (mode === 'deny') {
      return true;
    }

    const operationPerm = this.config.permission[operation] || 'ask';
    return operationPerm === 'deny';
  }

  /**
   * Enable auto-accept for the current session
   * Similar to Claude Code's "⏵⏵ accept edits on"
   */
  setAutoAcceptSession(enabled) {
    this.sessionAutoAccept = enabled;
  }

  /**
   * Get current auto-accept status
   */
  isAutoAcceptEnabled() {
    return this.sessionAutoAccept;
  }

  /**
   * Set session mode (overrides config)
   * @param {string} mode - 'ask', 'auto', 'plan', 'deny'
   */
  setSessionMode(mode) {
    this.sessionMode = mode;
  }

  /**
   * Get current mode (session override or config)
   */
  getCurrentMode() {
    // Ensure config and permission object exist
    if (!this.config || !this.config.permission) {
      this.config = { permission: this.getDefaultPermissions() };
    }
    return this.sessionMode || this.config.permission.mode || 'ask';
  }

  /**
   * Update config permission for an operation
   * @param {string} operation
   * @param {string} value - 'ask', 'allow', 'deny'
   */
  setPermission(operation, value) {
    // Ensure config and permission object exist
    if (!this.config || !this.config.permission) {
      this.config = { permission: this.getDefaultPermissions() };
    }
    this.config.permission[operation] = value;
    this.saveConfig();
  }

  /**
   * Update global mode
   * @param {string} mode - 'ask', 'auto', 'deny'
   */
  setMode(mode) {
    // Ensure config and permission object exist
    if (!this.config || !this.config.permission) {
      this.config = { permission: this.getDefaultPermissions() };
    }
    this.config.permission.mode = mode;
    this.saveConfig();
  }

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.config = {
      permission: this.getDefaultPermissions()
    };
    this.sessionAutoAccept = false;
    this.sessionMode = null;
    this.saveConfig();
  }

  /**
   * Get human-readable mode description
   */
  getModeDescription() {
    const mode = this.getCurrentMode();
    const descriptions = {
      ask: '⏸ Manual approval mode - will ask for each change',
      auto: '⏵⏵ Auto-accept mode - all changes approved automatically',
      plan: '📖 Plan mode - read-only, no changes allowed',
      deny: '⊘ Deny mode - all changes blocked'
    };
    return descriptions[mode] || descriptions.ask;
  }
}

module.exports = PermissionManager;
