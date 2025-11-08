#!/usr/bin/env node

/**
 * Message Parts - Rich message structure like OpenCode
 * Messages contain multiple typed parts with state tracking
 */

const crypto = require('crypto');

class MessageParts {
  /**
   * Create a text part
   */
  static createText(content, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'text',
      text: content,
      synthetic: options.synthetic || false,
      time: {
        start: Date.now(),
        end: options.end || null
      },
      metadata: options.metadata || {}
    };
  }

  /**
   * Create a tool part (for tool calls)
   */
  static createTool(toolName, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'tool',
      callID: options.callID || this.generateId('call'),
      tool: toolName,
      state: {
        status: 'pending'
      },
      metadata: options.metadata || {}
    };
  }

  /**
   * Update tool part to running state
   */
  static setToolRunning(toolPart, input) {
    toolPart.state = {
      status: 'running',
      input: input,
      title: this.generateToolTitle(toolPart.tool, input),
      metadata: toolPart.state.metadata || {},
      time: {
        start: Date.now()
      }
    };
    return toolPart;
  }

  /**
   * Update tool part to completed state
   */
  static setToolCompleted(toolPart, output) {
    toolPart.state = {
      status: 'completed',
      input: toolPart.state.input || {},
      output: output,
      title: toolPart.state.title || this.generateToolTitle(toolPart.tool, toolPart.state.input),
      metadata: toolPart.state.metadata || {},
      time: {
        start: toolPart.state.time?.start || Date.now(),
        end: Date.now(),
        compacted: null
      }
    };
    return toolPart;
  }

  /**
   * Update tool part to error state
   */
  static setToolError(toolPart, error) {
    toolPart.state = {
      status: 'error',
      input: toolPart.state.input || {},
      error: error.message || error.toString(),
      metadata: toolPart.state.metadata || {},
      time: {
        start: toolPart.state.time?.start || Date.now(),
        end: Date.now()
      }
    };
    return toolPart;
  }

  /**
   * Create a snapshot part (for file system snapshots)
   */
  static createSnapshot(files, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'snapshot',
      snapshot: JSON.stringify(files),
      time: Date.now(),
      metadata: options.metadata || {}
    };
  }

  /**
   * Create a patch part (for file changes)
   */
  static createPatch(files, hash, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'patch',
      hash: hash,
      files: files,
      time: Date.now(),
      metadata: options.metadata || {}
    };
  }

  /**
   * Create a reasoning part (for AI reasoning steps)
   */
  static createReasoning(content, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'reasoning',
      text: content,
      metadata: options.metadata || {},
      time: {
        start: Date.now(),
        end: null
      }
    };
  }

  /**
   * Generate tool title from tool name and input
   */
  static generateToolTitle(toolName, input) {
    switch (toolName) {
      case 'str_replace_editor':
        if (input.command === 'create') {
          return `Create ${input.path}`;
        } else if (input.command === 'str_replace') {
          return `Edit ${input.path}`;
        } else if (input.command === 'view') {
          return `View ${input.path}`;
        }
        return `File operation: ${input.path}`;
      
      case 'bash':
        return `Execute: ${input.command?.substring(0, 50) || 'command'}`;
      
      case 'codebase_search':
        return `Search: ${input.query}`;
      
      case 'web_fetch':
        return `Fetch: ${input.url}`;
      
      default:
        return `${toolName}`;
    }
  }

  /**
   * Generate unique ID
   */
  static generateId(prefix = 'id') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Create a complete message with parts
   */
  static createMessage(role, options = {}) {
    const message = {
      id: options.id || this.generateId('msg'),
      role: role, // 'user' or 'assistant'
      parts: options.parts || [],
      time: {
        created: Date.now(),
        updated: Date.now()
      },
      metadata: options.metadata || {}
    };

    // Add additional assistant-specific fields
    if (role === 'assistant') {
      message.tokens = options.tokens || {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
        reasoning: 0
      };
      message.cost = options.cost || 0;
      message.model = options.model || null;
      message.providerID = options.providerID || null;
      message.summary = options.summary || false;
    }

    return message;
  }

  /**
   * Add part to message
   */
  static addPart(message, part) {
    message.parts.push(part);
    message.time.updated = Date.now();
    return message;
  }

  /**
   * Get parts by type
   */
  static getPartsByType(message, type) {
    return message.parts.filter(part => part.type === type);
  }

  /**
   * Get tool parts
   */
  static getToolParts(message) {
    return this.getPartsByType(message, 'tool');
  }

  /**
   * Get text parts
   */
  static getTextParts(message) {
    return this.getPartsByType(message, 'text');
  }

  /**
   * Check if message has pending tools
   */
  static hasPendingTools(message) {
    const toolParts = this.getToolParts(message);
    return toolParts.some(part => part.state.status === 'pending' || part.state.status === 'running');
  }

  /**
   * Get message summary
   */
  static getSummary(message) {
    const textParts = this.getTextParts(message);
    const toolParts = this.getToolParts(message);
    
    const completedTools = toolParts.filter(p => p.state.status === 'completed').length;
    const failedTools = toolParts.filter(p => p.state.status === 'error').length;
    
    return {
      id: message.id,
      role: message.role,
      totalParts: message.parts.length,
      textParts: textParts.length,
      toolParts: toolParts.length,
      completedTools,
      failedTools,
      tokens: message.tokens || null,
      created: message.time.created
    };
  }

  /**
   * Convert message to simple format (for API calls)
   */
  static toSimpleMessage(message) {
    const textParts = this.getTextParts(message);
    const content = textParts.map(part => part.text).join('\n\n');
    
    return {
      role: message.role,
      content: content
    };
  }

  /**
   * Convert array of messages to simple format
   */
  static toSimpleMessages(messages) {
    return messages.map(msg => this.toSimpleMessage(msg));
  }

  /**
   * Mark tool output as compacted (to reduce context size)
   */
  static compactToolOutput(toolPart) {
    if (toolPart.state.status === 'completed') {
      toolPart.state.time.compacted = Date.now();
      // Optionally truncate output
      if (toolPart.state.output && toolPart.state.output.length > 1000) {
        toolPart.state.output = toolPart.state.output.substring(0, 1000) + '\n... (output truncated)';
      }
    }
    return toolPart;
  }

  /**
   * Calculate total time for message
   */
  static calculateDuration(message) {
    if (!message.time.created || !message.time.updated) return 0;
    return message.time.updated - message.time.created;
  }

  /**
   * Export message as JSON
   */
  static export(message) {
    return JSON.parse(JSON.stringify(message));
  }

  // Convenience aliases for test compatibility
  static text(content, options) {
    return this.createText(content, options);
  }

  static code(content, language, options = {}) {
    return {
      ...this.createText(content, options),
      type: 'code',
      language: language || 'plaintext'
    };
  }

  static fileReference(name, path, options = {}) {
    return {
      id: options.id || this.generateId('part'),
      type: 'file_reference',
      name: name,
      path: path,
      time: Date.now(),
      metadata: options.metadata || {}
    };
  }

  static thinking(content, options = {}) {
    return {
      ...this.createReasoning(content, options),
      type: 'thinking'  // Override to match test expectations
    };
  }

  static error(message, details = {}) {
    return {
      id: this.generateId('part'),
      type: 'error',
      message: message,
      details: details,
      time: Date.now()
    };
  }
}

module.exports = MessageParts;
