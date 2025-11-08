#!/usr/bin/env node

/**
 * Turn and TurnManager - Qwen Code Architecture
 * 
 * Manages conversation turns with proper state tracking, tool call management,
 * and conversation compression.
 * 
 * A "turn" represents one complete interaction cycle:
 * 1. User input
 * 2. Model response (potentially multiple chunks)
 * 3. Tool calls (if any)
 * 4. Tool results
 * 5. Final model response
 * 
 * Adapted from Qwen Code (Google Gemini Code) for Recoder Code
 * Original: packages/core/src/core/turn.ts
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Represents a single tool call within a turn
 */
class ToolCall {
  constructor(callId, name, args) {
    this.callId = callId || crypto.randomUUID();
    this.name = name;
    this.args = args || {};
    this.result = null;
    this.error = null;
    this.executionTime = 0;
    this.confirmed = false;
    this.timestamp = Date.now();
  }

  /**
   * Sets the tool call result
   * @param {Object} result - The tool execution result
   */
  setResult(result) {
    this.result = result;
    this.executionTime = Date.now() - this.timestamp;
  }

  /**
   * Sets an error for the tool call
   * @param {Error} error - The error that occurred
   */
  setError(error) {
    this.error = error;
    this.executionTime = Date.now() - this.timestamp;
  }

  /**
   * Marks the tool call as confirmed by user
   */
  confirm() {
    this.confirmed = true;
  }

  /**
   * Checks if the tool call was successful
   * @returns {boolean} True if successful
   */
  isSuccessful() {
    return this.result !== null && this.error === null;
  }

  /**
   * Converts to JSON for serialization
   */
  toJSON() {
    return {
      callId: this.callId,
      name: this.name,
      args: this.args,
      result: this.result,
      error: this.error ? {
        message: this.error.message,
        stack: this.error.stack,
        type: this.error.type
      } : null,
      executionTime: this.executionTime,
      confirmed: this.confirmed,
      timestamp: this.timestamp
    };
  }
}

/**
 * Represents a single turn in the conversation
 */
class Turn {
  constructor(userInput, options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.userInput = userInput;
    this.modelResponses = []; // Array of response chunks
    this.toolCalls = []; // Array of ToolCall objects
    this.context = options.context || {};
    this.metadata = options.metadata || {};
    this.timestamp = Date.now();
    this.completed = false;
    this.compressed = false;
    this.tokenCount = 0;
    this.finishReason = null;
    this.error = null;
  }

  /**
   * Adds a model response chunk
   * @param {string} content - The response content
   */
  addModelResponse(content) {
    this.modelResponses.push({
      content,
      timestamp: Date.now()
    });
  }

  /**
   * Gets the full model response text
   * @returns {string} The complete response
   */
  getFullResponse() {
    return this.modelResponses.map(r => r.content).join('');
  }

  /**
   * Adds a tool call to this turn
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {ToolCall} The created tool call
   */
  addToolCall(name, args) {
    const toolCall = new ToolCall(null, name, args);
    this.toolCalls.push(toolCall);
    return toolCall;
  }

  /**
   * Gets a tool call by its ID
   * @param {string} callId - The call ID
   * @returns {ToolCall|null} The tool call or null
   */
  getToolCall(callId) {
    return this.toolCalls.find(tc => tc.callId === callId) || null;
  }

  /**
   * Marks the turn as completed
   * @param {string} finishReason - The reason for completion
   */
  complete(finishReason = 'stop') {
    this.completed = true;
    this.finishReason = finishReason;
  }

  /**
   * Sets an error for this turn
   * @param {Error} error - The error
   */
  setError(error) {
    this.error = error;
    this.completed = true;
    this.finishReason = 'error';
  }

  /**
   * Compresses the turn to save tokens
   * @returns {boolean} True if compressed
   */
  compress() {
    if (this.compressed) {
      return false;
    }

    // Compress long tool results
    for (const toolCall of this.toolCalls) {
      if (toolCall.result && typeof toolCall.result === 'object') {
        const resultStr = JSON.stringify(toolCall.result);
        if (resultStr.length > 1000) {
          toolCall.result = {
            __compressed: true,
            summary: resultStr.substring(0, 500) + '... [truncated]',
            length: resultStr.length
          };
        }
      }
    }

    // Compress long model responses
    const fullResponse = this.getFullResponse();
    if (fullResponse.length > 2000) {
      this.modelResponses = [{
        content: fullResponse.substring(0, 1000) + '... [compressed] ...' + fullResponse.substring(fullResponse.length - 500),
        timestamp: this.timestamp,
        __compressed: true
      }];
    }

    this.compressed = true;
    return true;
  }

  /**
   * Converts the turn to a format suitable for API calls
   * @returns {Object[]} Array of message objects
   */
  toMessages() {
    const messages = [];

    // User message
    messages.push({
      role: 'user',
      content: this.userInput
    });

    // Model responses
    if (this.modelResponses.length > 0) {
      messages.push({
        role: 'assistant',
        content: this.getFullResponse()
      });
    }

    // Tool calls and results
    for (const toolCall of this.toolCalls) {
      if (toolCall.isSuccessful()) {
        messages.push({
          role: 'tool',
          name: toolCall.name,
          content: JSON.stringify(toolCall.result)
        });
      } else if (toolCall.error) {
        messages.push({
          role: 'tool',
          name: toolCall.name,
          content: `Error: ${toolCall.error.message}`
        });
      }
    }

    return messages;
  }

  /**
   * Converts to JSON for serialization
   */
  toJSON() {
    return {
      id: this.id,
      userInput: this.userInput,
      modelResponses: this.modelResponses,
      toolCalls: this.toolCalls.map(tc => tc.toJSON()),
      context: this.context,
      metadata: this.metadata,
      timestamp: this.timestamp,
      completed: this.completed,
      compressed: this.compressed,
      tokenCount: this.tokenCount,
      finishReason: this.finishReason,
      error: this.error ? {
        message: this.error.message,
        stack: this.error.stack
      } : null
    };
  }

  /**
   * Creates a Turn from JSON
   * @param {Object} json - The JSON object
   * @returns {Turn} The reconstructed turn
   */
  static fromJSON(json) {
    const turn = new Turn(json.userInput, {
      id: json.id,
      context: json.context,
      metadata: json.metadata
    });
    
    turn.modelResponses = json.modelResponses || [];
    turn.toolCalls = (json.toolCalls || []).map(tc => {
      const toolCall = new ToolCall(tc.callId, tc.name, tc.args);
      toolCall.result = tc.result;
      toolCall.error = tc.error;
      toolCall.executionTime = tc.executionTime;
      toolCall.confirmed = tc.confirmed;
      toolCall.timestamp = tc.timestamp;
      return toolCall;
    });
    
    turn.timestamp = json.timestamp;
    turn.completed = json.completed;
    turn.compressed = json.compressed;
    turn.tokenCount = json.tokenCount;
    turn.finishReason = json.finishReason;
    
    if (json.error) {
      turn.error = new Error(json.error.message);
      turn.error.stack = json.error.stack;
    }
    
    return turn;
  }
}

/**
 * Manages the conversation history as a series of turns
 */
class TurnManager {
  constructor(options = {}) {
    this.turns = [];
    this.currentTurn = null;
    this.maxTurns = options.maxTurns || 100;
    this.maxTokens = options.maxTokens || 100000;
    this.compressionThreshold = options.compressionThreshold || 0.8; // Compress when 80% full
    this.autoCompress = options.autoCompress !== false;
    this.sessionId = options.sessionId || crypto.randomUUID();
    this.metadata = options.metadata || {};
  }

  /**
   * Starts a new turn
   * @param {string} userInput - The user's input
   * @param {Object} context - Additional context for this turn
   * @returns {Turn} The new turn
   */
  startTurn(userInput, context = {}) {
    // Complete previous turn if not already completed
    if (this.currentTurn && !this.currentTurn.completed) {
      this.currentTurn.complete('new_turn');
    }

    // Auto-compress if needed
    if (this.autoCompress && this.shouldCompress()) {
      this.compressOldTurns();
    }

    // Create new turn
    this.currentTurn = new Turn(userInput, { context });
    this.turns.push(this.currentTurn);

    // Enforce max turns limit
    if (this.turns.length > this.maxTurns) {
      this.turns = this.turns.slice(-this.maxTurns);
    }

    return this.currentTurn;
  }

  /**
   * Gets the current turn
   * @returns {Turn|null} The current turn or null
   */
  getCurrentTurn() {
    return this.currentTurn;
  }

  /**
   * Completes the current turn
   * @param {string} finishReason - The reason for completion
   */
  completeTurn(finishReason = 'stop') {
    if (this.currentTurn) {
      this.currentTurn.complete(finishReason);
    }
  }

  /**
   * Gets all turns
   * @returns {Turn[]} Array of all turns
   */
  getTurns() {
    return this.turns;
  }

  /**
   * Gets turns within a range
   * @param {number} start - Start index
   * @param {number} end - End index
   * @returns {Turn[]} Array of turns
   */
  getTurnsRange(start, end) {
    return this.turns.slice(start, end);
  }

  /**
   * Gets the last N turns
   * @param {number} n - Number of turns to get
   * @returns {Turn[]} Array of last N turns
   */
  getLastTurns(n) {
    return this.turns.slice(-n);
  }

  /**
   * Converts all turns to messages for API calls
   * @param {Object} options - Options for conversion
   * @returns {Object[]} Array of message objects
   */
  toMessages(options = {}) {
    const maxTurns = options.maxTurns || this.turns.length;
    const turnsToInclude = this.getLastTurns(maxTurns);
    
    const messages = [];
    for (const turn of turnsToInclude) {
      messages.push(...turn.toMessages());
    }
    
    return messages;
  }

  /**
   * Calculates total token count (rough estimate)
   * @returns {number} Estimated token count
   */
  estimateTokenCount() {
    let total = 0;
    for (const turn of this.turns) {
      // Rough estimate: 4 characters per token
      const userTokens = Math.ceil(turn.userInput.length / 4);
      const responseTokens = Math.ceil(turn.getFullResponse().length / 4);
      const toolTokens = turn.toolCalls.reduce((sum, tc) => {
        return sum + Math.ceil(JSON.stringify(tc.toJSON()).length / 4);
      }, 0);
      
      turn.tokenCount = userTokens + responseTokens + toolTokens;
      total += turn.tokenCount;
    }
    return total;
  }

  /**
   * Checks if compression should be triggered
   * @returns {boolean} True if should compress
   */
  shouldCompress() {
    const currentTokens = this.estimateTokenCount();
    return currentTokens > (this.maxTokens * this.compressionThreshold);
  }

  /**
   * Compresses old turns to save tokens
   * @param {number} keepRecent - Number of recent turns to keep uncompressed
   * @returns {number} Number of turns compressed
   */
  compressOldTurns(keepRecent = 5) {
    let compressed = 0;
    const turnsToCompress = this.turns.slice(0, -keepRecent);
    
    for (const turn of turnsToCompress) {
      if (turn.compress()) {
        compressed++;
      }
    }
    
    return compressed;
  }

  /**
   * Removes old turns to free up space
   * @param {number} keep - Number of turns to keep
   * @returns {number} Number of turns removed
   */
  pruneOldTurns(keep = 50) {
    const toRemove = this.turns.length - keep;
    if (toRemove > 0) {
      this.turns = this.turns.slice(-keep);
      return toRemove;
    }
    return 0;
  }

  /**
   * Clears all turns
   */
  clear() {
    this.turns = [];
    this.currentTurn = null;
  }

  /**
   * Gets statistics about the turn history
   * @returns {Object} Statistics object
   */
  getStats() {
    const totalTurns = this.turns.length;
    const completedTurns = this.turns.filter(t => t.completed).length;
    const compressedTurns = this.turns.filter(t => t.compressed).length;
    const totalToolCalls = this.turns.reduce((sum, t) => sum + t.toolCalls.length, 0);
    const successfulToolCalls = this.turns.reduce(
      (sum, t) => sum + t.toolCalls.filter(tc => tc.isSuccessful()).length,
      0
    );
    const estimatedTokens = this.estimateTokenCount();

    return {
      totalTurns,
      completedTurns,
      compressedTurns,
      totalToolCalls,
      successfulToolCalls,
      estimatedTokens,
      tokenUsagePercent: (estimatedTokens / this.maxTokens * 100).toFixed(2),
      averageTokensPerTurn: totalTurns > 0 ? Math.round(estimatedTokens / totalTurns) : 0
    };
  }

  /**
   * Saves turn history to a file
   * @param {string} filePath - Path to save to
   */
  async saveToFile(filePath) {
    const data = {
      sessionId: this.sessionId,
      metadata: this.metadata,
      turns: this.turns.map(t => t.toJSON()),
      stats: this.getStats(),
      savedAt: new Date().toISOString()
    };
    
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Loads turn history from a file
   * @param {string} filePath - Path to load from
   * @returns {TurnManager} New TurnManager instance
   */
  static async loadFromFile(filePath) {
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    
    const manager = new TurnManager({
      sessionId: data.sessionId,
      metadata: data.metadata
    });
    
    manager.turns = data.turns.map(t => Turn.fromJSON(t));
    
    return manager;
  }

  /**
   * Converts to JSON for serialization
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      metadata: this.metadata,
      turns: this.turns.map(t => t.toJSON()),
      currentTurnId: this.currentTurn ? this.currentTurn.id : null,
      maxTurns: this.maxTurns,
      maxTokens: this.maxTokens,
      stats: this.getStats()
    };
  }

  /**
   * Creates a TurnManager from JSON
   * @param {Object} json - The JSON object
   * @returns {TurnManager} The reconstructed manager
   */
  static fromJSON(json) {
    const manager = new TurnManager({
      sessionId: json.sessionId,
      metadata: json.metadata,
      maxTurns: json.maxTurns,
      maxTokens: json.maxTokens
    });
    
    manager.turns = (json.turns || []).map(t => Turn.fromJSON(t));
    
    if (json.currentTurnId) {
      manager.currentTurn = manager.turns.find(t => t.id === json.currentTurnId) || null;
    }
    
    return manager;
  }
}

module.exports = {
  Turn,
  ToolCall,
  TurnManager
};
