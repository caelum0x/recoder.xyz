/**
 * ToolExecutor - Manages and executes tools for the AI assistant
 * Based on qwen-code's coreToolScheduler and tool execution patterns
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ToolExecutor {
  constructor(workspaceContext) {
    this.workspaceContext = workspaceContext;
    this.executionHistory = [];
    this.maxHistorySize = 100;
    this.tools = this.registerTools();
  }

  /**
   * Register all available tools
   * @returns {Object} Map of tool name to tool handler
   */
  registerTools() {
    return {
      str_replace_editor: this.handleFileOperation.bind(this),
      bash: this.handleBashCommand.bind(this),
      codebase_search: this.handleCodebaseSearch.bind(this),
      web_fetch: this.handleWebFetch.bind(this)
    };
  }

  /**
   * Execute a tool call from the API response
   * @param {Object} toolCall - Tool call from OpenAI API
   * @returns {string} Tool execution result
   */
  async executeToolCall(toolCall) {
    const startTime = Date.now();
    const toolName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments || '{}');

    try {
      // Validate tool exists
      if (!this.tools[toolName]) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      // Execute tool
      console.log(chalk.blue(`  🔧 ${toolName}...`));
      const result = await this.tools[toolName](args);

      // Record execution
      this.recordExecution({
        id: toolCall.id,
        tool: toolName,
        args,
        result,
        duration: Date.now() - startTime,
        success: true,
        timestamp: new Date()
      });

      return result;

    } catch (error) {
      console.log(chalk.red(`  ✗ ${toolName} failed: ${error.message}`));
      
      // Record failure
      this.recordExecution({
        id: toolCall.id,
        tool: toolName,
        args,
        error: error.message,
        duration: Date.now() - startTime,
        success: false,
        timestamp: new Date()
      });

      return `Error executing ${toolName}: ${error.message}`;
    }
  }

  /**
   * Handle file operations (view, create, str_replace)
   * @param {Object} args - File operation arguments
   * @returns {string} Operation result
   */
  async handleFileOperation(args) {
    const { command, path: filePath, old_str, new_str, file_text, view_range } = args;

    if (!filePath) {
      throw new Error('File path is required');
    }

    // Security: Validate path is within workspace
    const absolutePath = this.workspaceContext.getSafePath(filePath);

    switch (command) {
      case 'view':
        return this.viewFile(absolutePath, view_range);
      
      case 'create':
        return this.createFile(absolutePath, new_str || file_text);
      
      case 'str_replace':
        return this.replaceInFile(absolutePath, old_str, new_str);
      
      case 'insert':
        return this.insertInFile(absolutePath, args.insert_line, new_str);
      
      default:
        throw new Error(`Unknown file command: ${command}`);
    }
  }

  /**
   * View file contents
   * @param {string} filePath - Absolute file path
   * @param {Array} range - Optional [start, end] line range
   * @returns {string} File contents
   */
  viewFile(filePath, range = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (fs.statSync(filePath).isDirectory()) {
      // List directory contents
      const items = fs.readdirSync(filePath);
      return `Directory contents of ${filePath}:\n${items.map(item => {
        const itemPath = path.join(filePath, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        return `${isDir ? '📁' : '📄'} ${item}`;
      }).join('\n')}`;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (range && range.length === 2) {
      const [start, end] = range;
      const endLine = end === -1 ? lines.length : end;
      const selectedLines = lines.slice(start - 1, endLine);
      return selectedLines.map((line, idx) => `${start + idx}  ${line}`).join('\n');
    }

    // Return with line numbers
    return lines.map((line, idx) => `${idx + 1}  ${line}`).join('\n');
  }

  /**
   * Create a new file
   * @param {string} filePath - Absolute file path
   * @param {string} content - File content
   * @returns {string} Success message
   */
  createFile(filePath, content) {
    if (!content) {
      throw new Error('File content is required for create operation');
    }

    if (fs.existsSync(filePath)) {
      throw new Error(`File already exists: ${filePath}. Use str_replace to edit it.`);
    }

    // Create parent directories if needed
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    const lines = content.split('\n').length;
    return `✓ Created ${filePath} (${lines} lines)`;
  }

  /**
   * Replace string in file
   * @param {string} filePath - Absolute file path
   * @param {string} oldStr - String to find
   * @param {string} newStr - Replacement string
   * @returns {string} Success message
   */
  replaceInFile(filePath, oldStr, newStr) {
    if (!oldStr) {
      throw new Error('old_str is required for str_replace operation');
    }

    if (newStr === undefined) {
      throw new Error('new_str is required for str_replace operation');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Count occurrences
    const occurrences = (content.match(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    if (occurrences === 0) {
      throw new Error(`String not found in file: "${oldStr.substring(0, 50)}..."`);
    }

    if (occurrences > 1) {
      throw new Error(`String appears ${occurrences} times in file. Please make old_str more specific.`);
    }

    const newContent = content.replace(oldStr, newStr);
    fs.writeFileSync(filePath, newContent, 'utf8');

    return `✓ Replaced in ${filePath}`;
  }

  /**
   * Insert text at a specific line
   * @param {string} filePath - Absolute file path
   * @param {number} lineNumber - Line number to insert after
   * @param {string} text - Text to insert
   * @returns {string} Success message
   */
  insertInFile(filePath, lineNumber, text) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (lineNumber < 0 || lineNumber > lines.length) {
      throw new Error(`Line number ${lineNumber} is out of range (1-${lines.length})`);
    }

    lines.splice(lineNumber, 0, text);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

    return `✓ Inserted at line ${lineNumber} in ${filePath}`;
  }

  /**
   * Execute bash command
   * @param {Object} args - Command arguments
   * @returns {Promise<string>} Command output
   */
  async handleBashCommand(args) {
    const { command } = args;

    if (!command) {
      throw new Error('Command is required');
    }

    // Security: Warn about dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /:\(\)\{\s*:\|:&\s*\};:/,  // Fork bomb
      /mkfs/,
      /dd\s+if=/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command blocked: ${command}`);
      }
    }

    return new Promise((resolve, reject) => {
      const workDir = this.workspaceContext.getDirectories()[0];
      
      const child = spawn(command, {
        shell: true,
        cwd: workDir,
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB max output
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || '✓ Command executed successfully (no output)');
        } else {
          resolve(`Command exited with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Command failed: ${error.message}`));
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Command timeout after 30 seconds'));
      }, 30000);
    });
  }

  /**
   * Search codebase
   * @param {Object} args - Search arguments
   * @returns {string} Search results
   */
  async handleCodebaseSearch(args) {
    const { query, path: searchPath = '.', case_sensitive = false } = args;

    if (!query) {
      throw new Error('Query is required for codebase search');
    }

    const workDir = this.workspaceContext.getDirectories()[0];
    const absoluteSearchPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.join(workDir, searchPath);

    this.workspaceContext.validatePath(absoluteSearchPath);

    const results = [];
    this.searchDirectory(absoluteSearchPath, query, case_sensitive, results);

    if (results.length === 0) {
      return `No results found for: ${query}`;
    }

    const maxResults = 50;
    const truncated = results.length > maxResults;
    const displayResults = results.slice(0, maxResults);

    let output = `Found ${results.length} matches for: ${query}\n\n`;
    output += displayResults.map(r => 
      `${r.file}:${r.line}: ${r.content.trim()}`
    ).join('\n');

    if (truncated) {
      output += `\n\n... and ${results.length - maxResults} more results`;
    }

    return output;
  }

  /**
   * Search directory recursively
   * @private
   */
  searchDirectory(dirPath, query, caseSensitive, results) {
    if (results.length >= 100) return; // Limit total results

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      // Skip common directories to ignore
      if (item === 'node_modules' || item === '.git' || item.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        this.searchDirectory(fullPath, query, caseSensitive, results);
      } else {
        // Search in file
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          const searchQuery = caseSensitive ? query : query.toLowerCase();

          lines.forEach((line, idx) => {
            const searchLine = caseSensitive ? line : line.toLowerCase();
            if (searchLine.includes(searchQuery)) {
              results.push({
                file: fullPath,
                line: idx + 1,
                content: line
              });
            }
          });
        } catch (error) {
          // Skip binary or unreadable files
        }
      }
    }
  }

  /**
   * Fetch web content
   * @param {Object} args - Fetch arguments
   * @returns {Promise<string>} Web content
   */
  async handleWebFetch(args) {
    const { url, extract_text = true } = args;

    if (!url) {
      throw new Error('URL is required');
    }

    const https = require('https');
    const http = require('http');

    return new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;

      const request = client.get(url, {
        headers: {
          'User-Agent': 'RecoderCode/2.0 (AI Assistant)'
        },
        timeout: 10000
      }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            if (extract_text) {
              // Simple HTML stripping
              const text = data
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              resolve(text.substring(0, 5000) + (text.length > 5000 ? '...' : ''));
            } else {
              resolve(data.substring(0, 5000) + (data.length > 5000 ? '...' : ''));
            }
          } else {
            resolve(`HTTP Error: ${response.statusCode} ${response.statusMessage}`);
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Fetch error: ${error.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Record tool execution in history
   * @param {Object} execution - Execution details
   */
  recordExecution(execution) {
    this.executionHistory.push(execution);

    // Keep history size manageable
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get recent tool executions
   * @param {number} limit - Number of recent executions to return
   * @returns {Array} Recent executions
   */
  getRecentExecutions(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get tool execution statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const byTool = {};
    let totalDuration = 0;
    let successCount = 0;

    for (const exec of this.executionHistory) {
      if (!byTool[exec.tool]) {
        byTool[exec.tool] = { count: 0, duration: 0, success: 0, failure: 0 };
      }

      byTool[exec.tool].count++;
      byTool[exec.tool].duration += exec.duration;
      
      if (exec.success) {
        byTool[exec.tool].success++;
        successCount++;
      } else {
        byTool[exec.tool].failure++;
      }

      totalDuration += exec.duration;
    }

    return {
      totalExecutions: this.executionHistory.length,
      successCount,
      failureCount: this.executionHistory.length - successCount,
      totalDuration,
      averageDuration: totalDuration / this.executionHistory.length || 0,
      byTool
    };
  }

  /**
   * Clear execution history
   */
  clearHistory() {
    this.executionHistory = [];
  }
}

module.exports = ToolExecutor;
