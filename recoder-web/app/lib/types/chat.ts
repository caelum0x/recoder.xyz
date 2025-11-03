/**
 * Shared types for chat functionality
 * These can be imported by both client and server code
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
}

export type Messages = Message[];
