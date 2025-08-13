/**
 * Claude Code message filtering utilities - Real implementation
 */

export interface MessageFilter {
  apply(message: string): string
  shouldFilter(message: string): boolean
}

export class ClaudeCodeMessageFilter implements MessageFilter {
  private readonly sensitivePatterns = [
    /password[s]?\s*[:=]\s*[^\s]+/gi,
    /api[_-]?key[s]?\s*[:=]\s*[^\s]+/gi,
    /secret[s]?\s*[:=]\s*[^\s]+/gi,
    /token[s]?\s*[:=]\s*[^\s]+/gi,
    /auth[_-]?token[s]?\s*[:=]\s*[^\s]+/gi
  ];

  private readonly codeBlockPattern = /```[\s\S]*?```/g;
  private readonly filePathPattern = /\/[^\s]+\.(ts|js|py|java|cpp|c|h|go|rs|rb|php|cs|swift|kt|scala|sh|bat|md|json|yaml|yml|xml|html|css|scss|less|sql)/gi;

  apply(message: string): string {
    let filtered = message;

    // Filter out sensitive information
    this.sensitivePatterns.forEach(pattern => {
      filtered = filtered.replace(pattern, (match) => {
        const parts = match.split(/[:=]/);
        return parts.length > 1 ? `${parts[0]}:***` : '***';
      });
    });

    // Preserve code blocks and file paths for Claude Code
    return filtered;
  }

  shouldFilter(message: string): boolean {
    // Filter if message contains only sensitive data or is empty after filtering
    const filtered = this.apply(message);
    return filtered.trim().length === 0 || filtered === '***';
  }
}

export function createClaudeCodeMessageFilter(): MessageFilter {
  return new ClaudeCodeMessageFilter()
}

export const defaultMessageFilter = createClaudeCodeMessageFilter()

// Function to filter messages for Claude Code compatibility
export function filterMessagesForClaudeCode(messages: any[]): any[] {
  const filter = defaultMessageFilter;
  
  return messages.map(message => {
    if (typeof message.content === 'string') {
      const filteredContent = filter.apply(message.content);
      return filter.shouldFilter(message.content) ? null : {
        ...message,
        content: filteredContent
      };
    }
    
    if (Array.isArray(message.content)) {
      // Filter out image blocks and unsupported content, keep text and code blocks
      const filteredContent = message.content
        .filter((block: any) => {
          if (typeof block === 'string') return true;
          if (block.type === 'text') return true;
          if (block.type === 'tool_use' || block.type === 'tool_result') return true;
          // Filter out images, audio, and other unsupported media
          return false;
        })
        .map((block: any) => {
          if (typeof block === 'string') {
            const filtered = filter.apply(block);
            return filter.shouldFilter(block) ? null : filtered;
          }
          if (block.type === 'text') {
            const filtered = filter.apply(block.text || '');
            return filter.shouldFilter(block.text || '') ? null : {
              ...block,
              text: filtered
            };
          }
          return block;
        })
        .filter((block: any) => block !== null);
      
      if (filteredContent.length === 0) return null;
      
      return {
        ...message,
        content: filteredContent.length === 1 && typeof filteredContent[0] === 'object' && filteredContent[0].text
          ? filteredContent[0].text 
          : filteredContent
      };
    }
    
    return message;
  });
}