/**
 * Claude Code message filtering utilities (stub implementation)
 */

export interface MessageFilter {
  apply(message: string): string
  shouldFilter(message: string): boolean
}

export class ClaudeCodeMessageFilter implements MessageFilter {
  apply(message: string): string {
    // This is a stub implementation
    // The actual message filtering logic would be implemented here
    return message
  }

  shouldFilter(message: string): boolean {
    // This is a stub implementation
    return false
  }
}

export function createClaudeCodeMessageFilter(): MessageFilter {
  return new ClaudeCodeMessageFilter()
}

export const defaultMessageFilter = createClaudeCodeMessageFilter()

// Function to filter messages for Claude Code compatibility
export function filterMessagesForClaudeCode(messages: any[]): any[] {
  // Stub implementation - filters out image blocks and other unsupported content
  return messages.map(message => {
    if (typeof message.content === 'string') {
      return message;
    }
    
    if (Array.isArray(message.content)) {
      // Filter out image blocks, keep only text blocks
      const filteredContent = message.content.filter(block => 
        block.type === 'text' || (typeof block === 'string')
      );
      
      return {
        ...message,
        content: filteredContent.length === 1 && typeof filteredContent[0] === 'object' 
          ? filteredContent[0].text 
          : filteredContent
      };
    }
    
    return message;
  });
}