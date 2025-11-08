/**
 * TurnManager - Manages conversation turns and tool execution flow
 * Based on qwen-code's turn.ts pattern
 * A "turn" represents one complete user-assistant interaction including all tool calls
 */

const chalk = require('chalk');

class Turn {
  constructor(userMessage, metadata = {}) {
    this.id = Date.now() + Math.random().toString(36).substring(7);
    this.userMessage = userMessage;
    this.toolCalls = [];
    this.assistantResponses = [];
    this.metadata = metadata;
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'pending'; // pending, in_progress, completed, failed
  }

  /**
   * Add a tool call to this turn
   * @param {Object} toolCall - Tool call details
   * @param {string} result - Tool execution result
   */
  addToolCall(toolCall, result) {
    this.toolCalls.push({
      id: toolCall.id || `tool_${this.toolCalls.length}`,
      name: toolCall.function?.name || toolCall.name,
      arguments: toolCall.function?.arguments || toolCall.arguments,
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Add an assistant response
   * @param {string} response - Assistant's response text
   */
  addAssistantResponse(response) {
    this.assistantResponses.push({
      text: response,
      timestamp: Date.now()
    });
  }

  /**
   * Mark turn as completed
   */
  complete() {
    this.status = 'completed';
    this.endTime = Date.now();
  }

  /**
   * Mark turn as failed
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.metadata.error = error.message;
  }

  /**
   * Get turn duration in milliseconds
   * @returns {number} Duration
   */
  getDuration() {
    return (this.endTime || Date.now()) - this.startTime;
  }

  /**
   * Get a summary of this turn
   * @returns {Object} Turn summary
   */
  getSummary() {
    return {
      id: this.id,
      userMessage: this.userMessage.substring(0, 100) + (this.userMessage.length > 100 ? '...' : ''),
      toolCallCount: this.toolCalls.length,
      responseCount: this.assistantResponses.length,
      duration: this.getDuration(),
      status: this.status
    };
  }

  /**
   * Convert turn to conversation history format
   * @returns {Array} Array of messages for OpenAI API
   */
  toMessages() {
    const messages = [];

    // User message
    messages.push({
      role: 'user',
      content: this.userMessage
    });

    // Assistant responses and tool calls
    for (let i = 0; i < this.assistantResponses.length; i++) {
      const response = this.assistantResponses[i];
      
      // If there are tool calls for this response, include them
      const relevantToolCalls = this.toolCalls.filter((tc, idx) => 
        idx >= i * 10 && idx < (i + 1) * 10 // Rough grouping
      );

      if (relevantToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: relevantToolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
          }))
        });

        // Add tool results
        for (const tc of relevantToolCalls) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: tc.result
          });
        }
      }

      // Assistant text response
      if (response.text) {
        messages.push({
          role: 'assistant',
          content: response.text
        });
      }
    }

    return messages;
  }
}

class TurnManager {
  constructor(maxTurns = 50) {
    this.turns = [];
    this.currentTurn = null;
    this.maxTurns = maxTurns;
  }

  /**
   * Start a new turn
   * @param {string} userMessage - User's message
   * @param {Object} metadata - Optional metadata
   * @returns {Turn} The new turn
   */
  startTurn(userMessage, metadata = {}) {
    const turn = new Turn(userMessage, metadata);
    turn.status = 'in_progress';
    this.currentTurn = turn;
    this.turns.push(turn);

    // Keep turn history manageable
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }

    return turn;
  }

  /**
   * Get the current active turn
   * @returns {Turn|null} Current turn
   */
  getCurrentTurn() {
    return this.currentTurn;
  }

  /**
   * Complete the current turn
   */
  completeTurn() {
    if (this.currentTurn) {
      this.currentTurn.complete();
      this.currentTurn = null;
    }
  }

  /**
   * Fail the current turn
   * @param {Error} error - Error that caused failure
   */
  failTurn(error) {
    if (this.currentTurn) {
      this.currentTurn.fail(error);
      this.currentTurn = null;
    }
  }

  /**
   * Get all turns
   * @returns {Array<Turn>} All turns
   */
  getAllTurns() {
    return this.turns;
  }

  /**
   * Get recent turns
   * @param {number} limit - Number of recent turns
   * @returns {Array<Turn>} Recent turns
   */
  getRecentTurns(limit = 10) {
    return this.turns.slice(-limit);
  }

  /**
   * Build conversation history for API
   * Includes all turns with smart context management
   * @param {number} maxTurns - Maximum number of turns to include
   * @returns {Array} Messages array for OpenAI API
   */
  buildConversationHistory(maxTurns = 10) {
    const recentTurns = this.getRecentTurns(maxTurns);
    const messages = [];

    for (const turn of recentTurns) {
      messages.push(...turn.toMessages());
    }

    return messages;
  }

  /**
   * Get statistics about turns
   * @returns {Object} Statistics
   */
  getStats() {
    const totalTurns = this.turns.length;
    const completedTurns = this.turns.filter(t => t.status === 'completed').length;
    const failedTurns = this.turns.filter(t => t.status === 'failed').length;
    const totalToolCalls = this.turns.reduce((sum, t) => sum + t.toolCalls.length, 0);
    const totalDuration = this.turns.reduce((sum, t) => sum + t.getDuration(), 0);

    return {
      totalTurns,
      completedTurns,
      failedTurns,
      pendingTurns: totalTurns - completedTurns - failedTurns,
      totalToolCalls,
      averageToolCallsPerTurn: totalToolCalls / totalTurns || 0,
      averageTurnDuration: totalDuration / totalTurns || 0,
      totalDuration
    };
  }

  /**
   * Display turn statistics in a nice format
   */
  displayStats() {
    const stats = this.getStats();
    
    console.log(chalk.cyan('\n📊 Turn Statistics:'));
    console.log(chalk.gray('═══════════════════════════════════════'));
    console.log(chalk.white(`  Total turns: ${stats.totalTurns}`));
    console.log(chalk.green(`  ✓ Completed: ${stats.completedTurns}`));
    console.log(chalk.red(`  ✗ Failed: ${stats.failedTurns}`));
    console.log(chalk.yellow(`  ⏳ Pending: ${stats.pendingTurns}`));
    console.log(chalk.blue(`  🔧 Total tool calls: ${stats.totalToolCalls}`));
    console.log(chalk.gray(`  ⌀ Avg tools/turn: ${stats.averageToolCallsPerTurn.toFixed(2)}`));
    console.log(chalk.gray(`  ⌀ Avg duration: ${(stats.averageTurnDuration / 1000).toFixed(2)}s`));
    console.log(chalk.gray('═══════════════════════════════════════\n'));
  }

  /**
   * Display recent turns
   * @param {number} limit - Number of recent turns to display
   */
  displayRecentTurns(limit = 5) {
    const recent = this.getRecentTurns(limit);
    
    console.log(chalk.cyan('\n📝 Recent Turns:'));
    console.log(chalk.gray('═══════════════════════════════════════'));
    
    for (const turn of recent) {
      const summary = turn.getSummary();
      const statusIcon = turn.status === 'completed' ? '✓' : 
                        turn.status === 'failed' ? '✗' : '⏳';
      const statusColor = turn.status === 'completed' ? chalk.green : 
                         turn.status === 'failed' ? chalk.red : chalk.yellow;
      
      console.log(statusColor(`  ${statusIcon} ${summary.userMessage}`));
      console.log(chalk.gray(`     Tools: ${summary.toolCallCount} | Duration: ${(summary.duration / 1000).toFixed(2)}s`));
    }
    
    console.log(chalk.gray('═══════════════════════════════════════\n'));
  }

  /**
   * Clear all turns (useful for starting fresh)
   */
  clear() {
    this.turns = [];
    this.currentTurn = null;
  }

  /**
   * Export turns to JSON for persistence
   * @returns {string} JSON string
   */
  export() {
    return JSON.stringify({
      turns: this.turns.map(t => ({
        id: t.id,
        userMessage: t.userMessage,
        toolCalls: t.toolCalls,
        assistantResponses: t.assistantResponses,
        metadata: t.metadata,
        startTime: t.startTime,
        endTime: t.endTime,
        status: t.status
      })),
      maxTurns: this.maxTurns
    }, null, 2);
  }

  /**
   * Import turns from JSON
   * @param {string} json - JSON string
   */
  import(json) {
    try {
      const data = JSON.parse(json);
      this.maxTurns = data.maxTurns || this.maxTurns;
      
      this.turns = data.turns.map(t => {
        const turn = new Turn(t.userMessage, t.metadata);
        turn.id = t.id;
        turn.toolCalls = t.toolCalls || [];
        turn.assistantResponses = t.assistantResponses || [];
        turn.startTime = t.startTime;
        turn.endTime = t.endTime;
        turn.status = t.status;
        return turn;
      });
      
      return true;
    } catch (error) {
      console.error('Failed to import turns:', error.message);
      return false;
    }
  }
}

module.exports = { Turn, TurnManager };
