/**
 * Claude Code message filtering utilities for backend
 */

export interface MessageFilter {
  apply(message: string): string
  shouldFilter(message: string): boolean
}

export class ClaudeCodeMessageFilter implements MessageFilter {
  private readonly maxMessageLength = 100000; // 100k chars limit
  private readonly sensitivePatterns = [
    /\b(?:password|secret|key|token)\b/gi,
    /\b[A-Za-z0-9+/]{40,}\b/g, // Base64-like strings
    /\b[0-9a-f]{32,}\b/gi, // Hex strings that might be hashes/keys
  ];

  apply(message: string): string {
    let filtered = message;
    
    // Truncate if too long
    if (filtered.length > this.maxMessageLength) {
      filtered = filtered.substring(0, this.maxMessageLength) + '\n... (truncated)';
    }
    
    // Remove potentially sensitive information
    this.sensitivePatterns.forEach(pattern => {
      filtered = filtered.replace(pattern, '[REDACTED]');
    });
    
    // Clean up excessive whitespace
    filtered = filtered.replace(/\n{3,}/g, '\n\n');
    filtered = filtered.replace(/\s{3,}/g, ' ');
    
    return filtered;
  }

  shouldFilter(message: string): boolean {
    // Check if message contains potentially sensitive content
    return this.sensitivePatterns.some(pattern => pattern.test(message)) ||
           message.length > this.maxMessageLength;
  }
}

export function createClaudeCodeMessageFilter(): MessageFilter {
  return new ClaudeCodeMessageFilter();
}

export const defaultMessageFilter = createClaudeCodeMessageFilter();

// Function to filter messages for Claude Code compatibility
export function filterMessagesForClaudeCode(messages: any[]): any[] {
  const filter = defaultMessageFilter;
  
  return messages.map(message => {
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: filter.apply(message.content)
      };
    }
    
    if (Array.isArray(message.content)) {
      // Filter out image blocks and other unsupported content, keep only text
      const filteredContent = message.content
        .filter(block => 
          block.type === 'text' || 
          (typeof block === 'string') ||
          block.type === 'tool_result' // Keep tool results as they might contain text
        )
        .map(block => {
          if (typeof block === 'string') {
            return filter.apply(block);
          }
          
          if (block.type === 'text' && block.text) {
            return {
              ...block,
              text: filter.apply(block.text)
            };
          }
          
          if (block.type === 'tool_result' && block.content) {
            return {
              ...block,
              content: typeof block.content === 'string' 
                ? filter.apply(block.content)
                : block.content
            };
          }
          
          return block;
        });
      
      // If only one text block remains, simplify to string
      if (filteredContent.length === 1 && 
          typeof filteredContent[0] === 'object' && 
          filteredContent[0].type === 'text') {
        return {
          ...message,
          content: filteredContent[0].text
        };
      }
      
      return {
        ...message,
        content: filteredContent
      };
    }
    
    return message;
  });
}

// Advanced filtering for specific Claude Code features
export function prepareMessagesForClaudeCode(messages: any[], options: {
  includeSystemContext?: boolean;
  maxContextLength?: number;
  preserveCodeBlocks?: boolean;
} = {}): any[] {
  const {
    includeSystemContext = true,
    maxContextLength = 50000,
    preserveCodeBlocks = true
  } = options;

  let filtered = filterMessagesForClaudeCode(messages);
  
  // Add system context if requested
  if (includeSystemContext && filtered.length > 0 && filtered[0].role !== 'system') {
    filtered.unshift({
      role: 'system',
      content: 'You are Claude Code, an AI assistant specialized in code analysis, generation, and debugging. Provide clear, accurate, and helpful responses.'
    });
  }
  
  // Preserve code blocks if requested
  if (preserveCodeBlocks) {
    filtered = filtered.map(message => ({
      ...message,
      content: typeof message.content === 'string' 
        ? preserveCodeBlocksInText(message.content)
        : message.content
    }));
  }
  
  // Trim context if too long
  let totalLength = JSON.stringify(filtered).length;
  while (totalLength > maxContextLength && filtered.length > 1) {
    // Remove oldest non-system messages
    const systemIndex = filtered.findIndex(m => m.role === 'system');
    const toRemove = systemIndex >= 0 && filtered.length > systemIndex + 1 
      ? systemIndex + 1 
      : 0;
    
    if (toRemove < filtered.length - 1) {
      filtered.splice(toRemove, 1);
      totalLength = JSON.stringify(filtered).length;
    } else {
      break;
    }
  }
  
  return filtered;
}

function preserveCodeBlocksInText(text: string): string {
  // Protect code blocks from aggressive filtering
  return text.replace(/```[\s\S]*?```/g, (match) => {
    // Preserve code blocks as-is, but limit their size
    if (match.length > 5000) {
      const lines = match.split('\n');
      const header = lines[0];
      const footer = lines[lines.length - 1];
      const codeLines = lines.slice(1, -1);
      
      if (codeLines.length > 100) {
        const truncated = [
          ...codeLines.slice(0, 50),
          '// ... (truncated) ...',
          ...codeLines.slice(-50)
        ];
        
        return [header, ...truncated, footer].join('\n');
      }
    }
    return match;
  });
}
