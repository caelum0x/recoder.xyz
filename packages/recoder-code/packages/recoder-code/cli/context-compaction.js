#!/usr/bin/env node

/**
 * Context Compaction - Smart token management like OpenCode
 * Handles context overflow, pruning, and summarization
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ContextCompaction {
  constructor(options = {}) {
    this.maxContextTokens = options.maxContextTokens || 100000;
    this.pruneThreshold = options.pruneThreshold || 80000; // Start pruning at 80k
    this.protectedTokens = options.protectedTokens || 40000; // Protect last 40k
    this.minimumPrune = options.minimumPrune || 20000; // Minimum to prune
    
    this.stats = {
      totalCompactions: 0,
      tokensSaved: 0,
      lastCompaction: null
    };
  }

  /**
   * Check if context needs compaction
   */
  needsCompaction(tokenCount) {
    return tokenCount > this.pruneThreshold;
  }

  /**
   * Estimate tokens (rough: 1 token ≈ 4 characters)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Compact messages by pruning old tool outputs
   */
  compactMessages(messages, options = {}) {
    const { keepRecent = 5, summarize = false } = options;
    
    console.log(chalk.blue('🔄 Compacting context...'));
    
    const startTokens = this.estimateTokens(JSON.stringify(messages));
    let totalRemoved = 0;
    let protectedCount = 0;
    
    // Work backwards through messages
    const compactedMessages = [...messages];
    
    // Keep most recent messages untouched
    const protectedIndex = Math.max(0, messages.length - keepRecent);
    
    for (let i = 0; i < protectedIndex; i++) {
      const message = compactedMessages[i];
      
      if (message.role === 'assistant') {
        // Check for tool_calls
        if (message.tool_calls && Array.isArray(message.tool_calls)) {
          for (const toolCall of message.tool_calls) {
            // Keep tool call but truncate large outputs
            if (toolCall.function && toolCall.function.arguments) {
              const args = toolCall.function.arguments;
              const argStr = typeof args === 'string' ? args : JSON.stringify(args);
              
              if (argStr.length > 1000) {
                const tokensBefore = this.estimateTokens(argStr);
                toolCall.function.arguments = argStr.substring(0, 1000) + '\n...(truncated)';
                const tokensAfter = this.estimateTokens(toolCall.function.arguments);
                totalRemoved += (tokensBefore - tokensAfter);
              }
            }
          }
        }
        
        // Truncate long assistant responses
        if (message.content && typeof message.content === 'string') {
          if (message.content.length > 2000) {
            const tokensBefore = this.estimateTokens(message.content);
            message.content = message.content.substring(0, 2000) + '\n...(response truncated to save context)';
            const tokensAfter = this.estimateTokens(message.content);
            totalRemoved += (tokensBefore - tokensAfter);
          }
        }
      }
      
      // Truncate very long user messages
      if (message.role === 'user' && message.content && typeof message.content === 'string') {
        if (message.content.length > 3000) {
          const tokensBefore = this.estimateTokens(message.content);
          message.content = message.content.substring(0, 3000) + '\n...(message truncated)';
          const tokensAfter = this.estimateTokens(message.content);
          totalRemoved += (tokensBefore - tokensAfter);
        }
      }
    }
    
    const endTokens = this.estimateTokens(JSON.stringify(compactedMessages));
    const savedTokens = startTokens - endTokens;
    
    // Update stats
    this.stats.totalCompactions++;
    this.stats.tokensSaved += savedTokens;
    this.stats.lastCompaction = Date.now();
    
    console.log(chalk.green(`✅ Compacted: ${startTokens} → ${endTokens} tokens (saved ${savedTokens})`));
    
    return {
      messages: compactedMessages,
      originalTokens: startTokens,
      compactedTokens: endTokens,
      tokensSaved: savedTokens,
      protected: keepRecent
    };
  }

  /**
   * Compact message parts (for Phase 1 message parts system)
   */
  compactMessageParts(messages, MessageParts) {
    console.log(chalk.blue('🔄 Compacting message parts...'));
    
    let totalCompacted = 0;
    
    for (const message of messages) {
      if (!message.parts || message.role !== 'assistant') continue;
      
      const toolParts = MessageParts.getToolParts(message);
      
      for (const toolPart of toolParts) {
        // Only compact completed tool calls that are old
        if (toolPart.state.status === 'completed' && !toolPart.state.time.compacted) {
          // Check if tool output is large
          if (toolPart.state.output && toolPart.state.output.length > 1000) {
            const originalSize = toolPart.state.output.length;
            
            // Compact the output
            MessageParts.compactToolOutput(toolPart);
            
            const newSize = toolPart.state.output.length;
            totalCompacted += (originalSize - newSize);
          }
        }
      }
    }
    
    const tokensSaved = Math.ceil(totalCompacted / 4);
    
    if (totalCompacted > 0) {
      console.log(chalk.green(`✅ Compacted tool outputs: saved ${tokensSaved} tokens`));
      this.stats.tokensSaved += tokensSaved;
    }
    
    return {
      compacted: totalCompacted > 0,
      charsSaved: totalCompacted,
      tokensSaved: tokensSaved
    };
  }

  /**
   * Smart context pruning - remove least important content
   */
  smartPrune(context, targetTokens) {
    console.log(chalk.blue('🎯 Smart pruning context...'));
    
    const sections = this.parseContextSections(context);
    const currentTokens = this.estimateTokens(context);
    const tokensToRemove = currentTokens - targetTokens;
    
    if (tokensToRemove <= 0) {
      return context;
    }
    
    // Priority order (lower = remove first)
    const priorities = {
      'Recent File Activity': 1,  // Most detailed, can be reduced
      'Project Files': 2,          // Stats can be summarized
      'Folder Hierarchy': 3,       // Important for structure
      'Git Status': 4,             // Important for changes
      'Session Context': 5         // Always keep
    };
    
    let tokensRemoved = 0;
    const prunedSections = { ...sections };
    
    // Remove/reduce sections by priority
    for (const [section, content] of Object.entries(sections).sort((a, b) => 
      (priorities[a[0]] || 10) - (priorities[b[0]] || 10)
    )) {
      if (tokensRemoved >= tokensToRemove) break;
      
      const sectionTokens = this.estimateTokens(content);
      
      if (section === 'Recent File Activity') {
        // Remove this section entirely if needed
        delete prunedSections[section];
        tokensRemoved += sectionTokens;
      } else if (section === 'Project Files') {
        // Just keep summary
        prunedSections[section] = this.summarizeFileStats(content);
        tokensRemoved += sectionTokens - this.estimateTokens(prunedSections[section]);
      } else if (section === 'Folder Hierarchy') {
        // Reduce depth
        prunedSections[section] = this.reduceHierarchyDepth(content);
        tokensRemoved += sectionTokens - this.estimateTokens(prunedSections[section]);
      }
    }
    
    const prunedContext = this.reassembleSections(prunedSections);
    const finalTokens = this.estimateTokens(prunedContext);
    
    console.log(chalk.green(`✅ Pruned: ${currentTokens} → ${finalTokens} tokens`));
    
    return prunedContext;
  }

  /**
   * Parse context into sections
   */
  parseContextSections(context) {
    const sections = {};
    const sectionRegex = /##\s+(.+?)\n([\s\S]*?)(?=\n##\s+|\n---|\n\n\*\*IMPORTANT|$)/g;
    
    let match;
    while ((match = sectionRegex.exec(context)) !== null) {
      sections[match[1].trim()] = match[2].trim();
    }
    
    return sections;
  }

  /**
   * Reassemble sections
   */
  reassembleSections(sections) {
    const parts = [];
    
    for (const [title, content] of Object.entries(sections)) {
      parts.push(`## ${title}\n\n${content}\n`);
    }
    
    return parts.join('\n');
  }

  /**
   * Summarize file statistics
   */
  summarizeFileStats(content) {
    // Extract just the key numbers
    const lines = content.split('\n');
    const summary = lines.filter(line => 
      line.includes('Total Files') || 
      line.includes('Total Directories') ||
      line.includes('File Types')
    ).slice(0, 3);
    
    return summary.join('\n');
  }

  /**
   * Reduce hierarchy depth
   */
  reduceHierarchyDepth(content) {
    // Keep only first 2 levels of hierarchy
    const lines = content.split('\n');
    const reduced = [];
    let depth = 0;
    
    for (const line of lines) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      
      if (indent <= 8) { // Roughly 2 levels
        reduced.push(line);
      } else if (reduced[reduced.length - 1] !== '  ...') {
        reduced.push('  ...');
      }
    }
    
    return reduced.join('\n');
  }

  /**
   * Auto-compact if needed
   */
  async autoCompact(context, messages, MessageParts = null) {
    const tokens = this.estimateTokens(context);
    
    if (!this.needsCompaction(tokens)) {
      return { context, messages, compacted: false };
    }
    
    console.log(chalk.yellow(`⚠️  Context size (${tokens} tokens) exceeds threshold (${this.pruneThreshold})`));
    
    let compactedMessages = messages;
    let compactedContext = context;
    
    // Step 1: Compact messages
    if (messages && messages.length > 0) {
      const messageResult = this.compactMessages(messages, { keepRecent: 5 });
      compactedMessages = messageResult.messages;
    }
    
    // Step 2: Compact message parts if available
    if (MessageParts && messages) {
      this.compactMessageParts(messages, MessageParts);
    }
    
    // Step 3: Prune context if still too large
    const currentTokens = this.estimateTokens(compactedContext);
    if (currentTokens > this.maxContextTokens) {
      compactedContext = this.smartPrune(compactedContext, this.maxContextTokens);
    }
    
    return {
      context: compactedContext,
      messages: compactedMessages,
      compacted: true,
      stats: {
        originalTokens: tokens,
        finalTokens: this.estimateTokens(compactedContext),
        saved: tokens - this.estimateTokens(compactedContext)
      }
    };
  }

  /**
   * Get compaction statistics
   */
  getStats() {
    return {
      ...this.stats,
      thresholds: {
        max: this.maxContextTokens,
        prune: this.pruneThreshold,
        protected: this.protectedTokens
      },
      totalCompactions: this.stats.totalCompactions
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCompactions: 0,
      tokensSaved: 0,
      lastCompaction: null
    };
  }

  /**
   * Main compact method - compacts a conversation
   */
  async compact(conversation) {
    if (!Array.isArray(conversation)) {
      return conversation;
    }

    const result = this.compactMessages(conversation, { keepRecent: 5 });
    return result.messages;
  }

  /**
   * Check if conversation should be compacted
   */
  shouldCompact(conversation) {
    if (!Array.isArray(conversation)) {
      return false;
    }

    const tokens = this.estimateTokens(JSON.stringify(conversation));
    return this.needsCompaction(tokens);
  }
}

module.exports = ContextCompaction;
