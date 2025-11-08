#!/usr/bin/env node

/**
 * Tool Registry - Qwen Code Architecture
 * 
 * Central registry for all tools with type-safe definitions, execution,
 * and confirmation workflows.
 * 
 * Adapted from Qwen Code (Google Gemini Code) for Recoder Code
 * Original: packages/core/src/tools/tool-registry.ts
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Tool execution result
 * @typedef {Object} ToolResult
 * @property {string} content - Content for the LLM
 * @property {string} display - Display content for the user
 * @property {Object} [error] - Error information if execution failed
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Tool confirmation details
 * @typedef {Object} ToolConfirmation
 * @property {string} message - Message to show user
 * @property {boolean} required - Whether confirmation is required
 * @property {Object} [details] - Additional details to show
 */

/**
 * Base class for all tools
 */
class BaseTool {
  constructor(name, description, parameterSchema, options = {}) {
    this.name = name;
    this.description = description;
    this.parameterSchema = parameterSchema || { type: 'object', properties: {} };
    this.requiresConfirmation = options.requiresConfirmation || false;
    this.category = options.category || 'general';
    this.isEnabled = options.isEnabled !== false;
    this.metadata = options.metadata || {};
  }

  /**
   * Validates parameters against the schema
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateParams(params) {
    // Basic validation - check required properties
    const required = this.parameterSchema.required || [];
    const missing = required.filter(prop => !(prop in params));
    
    if (missing.length > 0) {
      return {
        valid: false,
        errors: [`Missing required parameters: ${missing.join(', ')}`]
      };
    }
    
    return { valid: true, errors: [] };
  }

  /**
   * Checks if execution should be confirmed by user
   * @param {Object} params - Tool parameters
   * @param {AbortSignal} signal - Abort signal
   * @returns {Promise<ToolConfirmation|false>} Confirmation details or false
   */
  async shouldConfirmExecute(params, signal) {
    if (!this.requiresConfirmation) {
      return false;
    }
    
    return {
      message: `Execute ${this.name} with parameters: ${JSON.stringify(params, null, 2)}`,
      required: true,
      details: { tool: this.name, params }
    };
  }

  /**
   * Executes the tool
   * @param {Object} params - Tool parameters
   * @param {AbortSignal} signal - Abort signal
   * @param {Function} updateOutput - Callback for streaming output
   * @returns {Promise<ToolResult>} Tool execution result
   */
  async execute(params, signal, updateOutput) {
    throw new Error(`Tool ${this.name} must implement execute() method`);
  }

  /**
   * Converts tool to OpenAI function schema
   * @returns {Object} OpenAI function schema
   */
  toOpenAISchema() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameterSchema
      }
    };
  }

  /**
   * Gets tool information
   * @returns {Object} Tool info
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      requiresConfirmation: this.requiresConfirmation,
      isEnabled: this.isEnabled,
      metadata: this.metadata
    };
  }
}

/**
 * Built-in file system tool
 */
class FileSystemTool extends BaseTool {
  constructor(workspaceContext) {
    super(
      'file_operation',
      'Perform file system operations (read, write, list, etc.)',
      {
        type: 'object',
        required: ['operation', 'path'],
        properties: {
          operation: {
            type: 'string',
            enum: ['read', 'write', 'list', 'delete', 'exists', 'stat'],
            description: 'The file operation to perform'
          },
          path: {
            type: 'string',
            description: 'The file or directory path'
          },
          content: {
            type: 'string',
            description: 'Content to write (for write operation)'
          },
          encoding: {
            type: 'string',
            default: 'utf8',
            description: 'File encoding'
          }
        }
      },
      {
        category: 'filesystem',
        requiresConfirmation: false
      }
    );
    this.workspaceContext = workspaceContext;
  }

  async execute(params, signal, updateOutput) {
    const { operation, path: filePath, content, encoding = 'utf8' } = params;
    
    // Validate path is within workspace
    if (!this.workspaceContext.isPathWithinWorkspace(filePath)) {
      return {
        content: `Error: Path ${filePath} is outside workspace`,
        display: `⚠️ Path validation failed: ${filePath}`,
        error: {
          type: 'SECURITY_ERROR',
          message: 'Path is outside workspace'
        }
      };
    }
    
    const absolutePath = this.workspaceContext.validatePath(filePath);
    
    try {
      switch (operation) {
        case 'read':
          const readContent = await fs.promises.readFile(absolutePath, encoding);
          return {
            content: readContent,
            display: `✅ Read ${filePath} (${readContent.length} bytes)`,
            metadata: { path: absolutePath, size: readContent.length }
          };
          
        case 'write':
          await fs.promises.writeFile(absolutePath, content, encoding);
          return {
            content: `File written successfully: ${filePath}`,
            display: `✅ Wrote ${filePath} (${content.length} bytes)`,
            metadata: { path: absolutePath, size: content.length }
          };
          
        case 'list':
          const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
          const list = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(filePath, entry.name)
          }));
          return {
            content: JSON.stringify(list, null, 2),
            display: `✅ Listed ${list.length} entries in ${filePath}`,
            metadata: { path: absolutePath, count: list.length, entries: list }
          };
          
        case 'delete':
          await fs.promises.unlink(absolutePath);
          return {
            content: `File deleted successfully: ${filePath}`,
            display: `✅ Deleted ${filePath}`,
            metadata: { path: absolutePath }
          };
          
        case 'exists':
          const exists = fs.existsSync(absolutePath);
          return {
            content: exists ? 'true' : 'false',
            display: `${exists ? '✅' : '❌'} ${filePath} ${exists ? 'exists' : 'does not exist'}`,
            metadata: { path: absolutePath, exists }
          };
          
        case 'stat':
          const stats = await fs.promises.stat(absolutePath);
          const statInfo = {
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory()
          };
          return {
            content: JSON.stringify(statInfo, null, 2),
            display: `✅ Stats for ${filePath}`,
            metadata: { path: absolutePath, stats: statInfo }
          };
          
        default:
          return {
            content: `Unknown operation: ${operation}`,
            display: `⚠️ Unknown operation: ${operation}`,
            error: {
              type: 'INVALID_OPERATION',
              message: `Unknown operation: ${operation}`
            }
          };
      }
    } catch (error) {
      return {
        content: `Error performing ${operation}: ${error.message}`,
        display: `❌ ${operation} failed: ${error.message}`,
        error: {
          type: 'EXECUTION_ERROR',
          message: error.message,
          stack: error.stack
        }
      };
    }
  }
}

/**
 * Built-in shell execution tool
 */
class ShellTool extends BaseTool {
  constructor(workspaceContext) {
    super(
      'execute_command',
      'Execute shell commands in the workspace',
      {
        type: 'object',
        required: ['command'],
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute'
          },
          cwd: {
            type: 'string',
            description: 'Working directory (optional)'
          },
          timeout: {
            type: 'number',
            default: 30000,
            description: 'Command timeout in milliseconds'
          }
        }
      },
      {
        category: 'shell',
        requiresConfirmation: true
      }
    );
    this.workspaceContext = workspaceContext;
  }

  async shouldConfirmExecute(params, signal) {
    return {
      message: `Execute command: ${params.command}`,
      required: true,
      details: {
        command: params.command,
        cwd: params.cwd || this.workspaceContext.getPrimaryDirectory(),
        warning: 'This will execute a shell command on your system'
      }
    };
  }

  async execute(params, signal, updateOutput) {
    const { command, cwd, timeout = 30000 } = params;
    const workingDir = cwd || this.workspaceContext.getPrimaryDirectory();
    
    // Validate working directory
    if (cwd && !this.workspaceContext.isPathWithinWorkspace(cwd)) {
      return {
        content: `Error: Working directory ${cwd} is outside workspace`,
        display: `⚠️ Invalid working directory`,
        error: {
          type: 'SECURITY_ERROR',
          message: 'Working directory is outside workspace'
        }
      };
    }
    
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: workingDir,
        shell: true,
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (updateOutput) {
          updateOutput({ type: 'stdout', content: chunk });
        }
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (updateOutput) {
          updateOutput({ type: 'stderr', content: chunk });
        }
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            content: stdout,
            display: `✅ Command completed successfully\n${stdout}`,
            metadata: {
              command,
              exitCode: code,
              stdout,
              stderr
            }
          });
        } else {
          resolve({
            content: `Command failed with exit code ${code}\nStdout: ${stdout}\nStderr: ${stderr}`,
            display: `❌ Command failed (exit code ${code})\n${stderr}`,
            error: {
              type: 'COMMAND_FAILED',
              message: `Exit code ${code}`,
              exitCode: code,
              stdout,
              stderr
            }
          });
        }
      });
      
      child.on('error', (error) => {
        resolve({
          content: `Error executing command: ${error.message}`,
          display: `❌ Execution error: ${error.message}`,
          error: {
            type: 'EXECUTION_ERROR',
            message: error.message
          }
        });
      });
      
      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          child.kill();
          resolve({
            content: 'Command aborted by user',
            display: '⚠️ Command aborted',
            error: {
              type: 'ABORTED',
              message: 'Command aborted by user'
            }
          });
        });
      }
    });
  }
}

/**
 * Tool Registry manages all available tools
 */
class ToolRegistry {
  constructor(workspaceContext) {
    this.tools = new Map();
    this.workspaceContext = workspaceContext;
    this.executionLog = [];
    this.maxLogSize = 1000;
    
    // Register built-in tools
    this.registerBuiltInTools();
  }

  /**
   * Registers built-in tools
   * @private
   */
  registerBuiltInTools() {
    this.registerTool(new FileSystemTool(this.workspaceContext));
    this.registerTool(new ShellTool(this.workspaceContext));
  }

  /**
   * Registers a tool
   * @param {BaseTool} tool - The tool to register
   */
  registerTool(tool) {
    if (!(tool instanceof BaseTool)) {
      throw new Error('Tool must be an instance of BaseTool');
    }
    
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} already registered, overwriting`);
    }
    
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregisters a tool
   * @param {string} name - Tool name
   * @returns {boolean} True if unregistered
   */
  unregisterTool(name) {
    return this.tools.delete(name);
  }

  /**
   * Gets a tool by name
   * @param {string} name - Tool name
   * @returns {BaseTool|null} The tool or null
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Gets all registered tools
   * @returns {BaseTool[]} Array of tools
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * Gets tools by category
   * @param {string} category - Category name
   * @returns {BaseTool[]} Array of tools in that category
   */
  getToolsByCategory(category) {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * Gets enabled tools only
   * @returns {BaseTool[]} Array of enabled tools
   */
  getEnabledTools() {
    return this.getAllTools().filter(tool => tool.isEnabled);
  }

  /**
   * Converts all tools to OpenAI schema format
   * @returns {Object[]} Array of OpenAI tool schemas
   */
  toOpenAISchema() {
    return this.getEnabledTools().map(tool => tool.toOpenAISchema());
  }

  /**
   * Executes a tool
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} options - Execution options
   * @returns {Promise<ToolResult>} Tool execution result
   */
  async executeTool(name, params, options = {}) {
    const tool = this.getTool(name);
    
    if (!tool) {
      return {
        content: `Error: Tool ${name} not found`,
        display: `❌ Unknown tool: ${name}`,
        error: {
          type: 'TOOL_NOT_FOUND',
          message: `Tool ${name} not found`
        }
      };
    }
    
    if (!tool.isEnabled) {
      return {
        content: `Error: Tool ${name} is disabled`,
        display: `⚠️ Tool ${name} is disabled`,
        error: {
          type: 'TOOL_DISABLED',
          message: `Tool ${name} is disabled`
        }
      };
    }
    
    // Validate parameters
    const validation = tool.validateParams(params);
    if (!validation.valid) {
      return {
        content: `Error: Invalid parameters - ${validation.errors.join(', ')}`,
        display: `⚠️ Invalid parameters: ${validation.errors.join(', ')}`,
        error: {
          type: 'INVALID_PARAMS',
          message: validation.errors.join(', '),
          errors: validation.errors
        }
      };
    }
    
    // Check if confirmation needed
    if (options.requireConfirmation !== false) {
      const confirmation = await tool.shouldConfirmExecute(params, options.signal);
      if (confirmation && options.onConfirmationRequired) {
        const approved = await options.onConfirmationRequired(confirmation);
        if (!approved) {
          return {
            content: 'Execution cancelled by user',
            display: '⚠️ Execution cancelled',
            error: {
              type: 'CANCELLED',
              message: 'User cancelled execution'
            }
          };
        }
      }
    }
    
    // Execute tool
    const startTime = Date.now();
    try {
      const result = await tool.execute(params, options.signal, options.updateOutput);
      const executionTime = Date.now() - startTime;
      
      // Log execution
      this.logExecution({
        tool: name,
        params,
        result,
        executionTime,
        timestamp: new Date().toISOString(),
        success: !result.error
      });
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Log error
      this.logExecution({
        tool: name,
        params,
        error: error.message,
        executionTime,
        timestamp: new Date().toISOString(),
        success: false
      });
      
      return {
        content: `Error executing ${name}: ${error.message}`,
        display: `❌ ${name} failed: ${error.message}`,
        error: {
          type: 'EXECUTION_ERROR',
          message: error.message,
          stack: error.stack
        }
      };
    }
  }

  /**
   * Logs tool execution
   * @private
   * @param {Object} logEntry - Log entry
   */
  logExecution(logEntry) {
    this.executionLog.push(logEntry);
    
    // Trim log if too large
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Gets execution log
   * @param {Object} options - Filter options
   * @returns {Object[]} Log entries
   */
  getExecutionLog(options = {}) {
    let log = this.executionLog;
    
    if (options.tool) {
      log = log.filter(entry => entry.tool === options.tool);
    }
    
    if (options.success !== undefined) {
      log = log.filter(entry => entry.success === options.success);
    }
    
    if (options.limit) {
      log = log.slice(-options.limit);
    }
    
    return log;
  }

  /**
   * Gets tool execution statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const total = this.executionLog.length;
    const successful = this.executionLog.filter(e => e.success).length;
    const failed = total - successful;
    
    const toolCounts = {};
    for (const entry of this.executionLog) {
      toolCounts[entry.tool] = (toolCounts[entry.tool] || 0) + 1;
    }
    
    const avgExecutionTime = this.executionLog.length > 0
      ? this.executionLog.reduce((sum, e) => sum + e.executionTime, 0) / this.executionLog.length
      : 0;
    
    return {
      totalExecutions: total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : 'N/A',
      averageExecutionTime: Math.round(avgExecutionTime) + 'ms',
      toolCounts,
      registeredTools: this.tools.size
    };
  }

  /**
   * Clears execution log
   */
  clearLog() {
    this.executionLog = [];
  }
}

module.exports = {
  BaseTool,
  FileSystemTool,
  ShellTool,
  ToolRegistry
};
