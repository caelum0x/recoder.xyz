/**
 * API Messages types (stub implementation for router)
 */

export interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
  timestamp?: number;
}

export interface ApiMessages {
  messages: ApiMessage[];
  metadata?: any;
}

// Stub functions for API message handling
export function createApiMessage(role: string, content: any): ApiMessage {
  return {
    role: role as 'user' | 'assistant' | 'system',
    content,
    timestamp: Date.now()
  };
}

export function validateApiMessages(messages: any[]): boolean {
  // This is a stub implementation
  return Array.isArray(messages);
}

export function processApiMessages(messages: any[]): ApiMessages {
  // This is a stub implementation
  return {
    messages: messages || [],
    metadata: {}
  };
}