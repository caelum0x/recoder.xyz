/**
 * API Messages types (browser stub implementation)
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

// Stub functions for API message handling in browser environment
export function createApiMessage(role: string, content: any): ApiMessage {
  return {
    role: role as 'user' | 'assistant' | 'system',
    content,
    timestamp: Date.now(),
  };
}

export function createApiMessages(messages: ApiMessage[]): ApiMessages {
  return {
    messages,
    metadata: {},
  };
}
