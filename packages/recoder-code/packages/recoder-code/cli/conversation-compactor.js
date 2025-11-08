/**
 * Conversation Compactor
 * Automatically compresses old messages to save context window space
 */

class ConversationCompactor {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.compactionThreshold = options.compactionThreshold || 50;
    this.summarizationModel = options.summarizationModel || 'gpt-3.5-turbo';
    this.compactedSummaries = [];
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(messages) {
    return messages.length > this.compactionThreshold;
  }

  /**
   * Compact old messages into a summary
   */
  async compactMessages(messages, client) {
    if (!this.shouldCompact(messages)) {
      return messages;
    }

    const messagesToKeep = Math.floor(this.maxMessages * 0.6); // Keep 60% of max
    const messagesToCompact = messages.slice(0, messages.length - messagesToKeep);
    const recentMessages = messages.slice(messages.length - messagesToKeep);

    if (messagesToCompact.length === 0) {
      return messages;
    }

    console.log(`\n🔄 Compacting ${messagesToCompact.length} older messages...`);

    try {
      const summary = await this.createSummary(messagesToCompact, client);
      
      this.compactedSummaries.push({
        timestamp: Date.now(),
        messageCount: messagesToCompact.length,
        summary
      });

      // Create a system message with the summary
      const summaryMessage = {
        role: 'system',
        content: `[Compacted History Summary - ${messagesToCompact.length} messages]\n\n${summary}\n\n[End of Summary - Recent conversation continues below]`
      };

      return [summaryMessage, ...recentMessages];
    } catch (error) {
      console.error('Error compacting messages:', error.message);
      return messages; // Return original on error
    }
  }

  /**
   * Create a summary of messages
   */
  async createSummary(messages, client) {
    const conversationText = messages
      .map(m => `${m.role}: ${this.extractTextContent(m.content)}`)
      .join('\n\n');

    const truncatedText = conversationText.slice(0, 4000); // Limit input size

    try {
      const response = await client.chat.completions.create({
        model: this.summarizationModel,
        messages: [
          {
            role: 'system',
            content: 'Summarize the following conversation concisely, preserving key context, decisions, and important information. Focus on technical details, file changes, and conversation outcomes.'
          },
          {
            role: 'user',
            content: truncatedText
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error creating summary:', error.message);
      return 'Previous conversation context (summary unavailable)';
    }
  }

  /**
   * Extract text content from message content (handles string or array)
   */
  extractTextContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
    }
    return '';
  }

  /**
   * Get statistics about compaction
   */
  getStats() {
    return {
      totalCompactions: this.compactedSummaries.length,
      totalMessagesCompacted: this.compactedSummaries.reduce(
        (sum, s) => sum + s.messageCount,
        0
      ),
      lastCompaction: this.compactedSummaries.length > 0
        ? this.compactedSummaries[this.compactedSummaries.length - 1].timestamp
        : null
    };
  }

  /**
   * Manual compaction trigger
   */
  async forceCompaction(messages, client, keepCount = 20) {
    if (messages.length <= keepCount) {
      return messages;
    }

    const messagesToCompact = messages.slice(0, messages.length - keepCount);
    const recentMessages = messages.slice(messages.length - keepCount);

    const summary = await this.createSummary(messagesToCompact, client);
    
    this.compactedSummaries.push({
      timestamp: Date.now(),
      messageCount: messagesToCompact.length,
      summary,
      forced: true
    });

    const summaryMessage = {
      role: 'system',
      content: `[Manual Compaction - ${messagesToCompact.length} messages]\n\n${summary}\n\n[End of Summary]`
    };

    return [summaryMessage, ...recentMessages];
  }
}

module.exports = ConversationCompactor;
