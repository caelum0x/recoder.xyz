export type MessagePart =
  | { kind: 'text'; text: string; metadata?: Record<string, unknown> }
  | { kind: 'json'; data: Record<string, unknown>; metadata?: Record<string, unknown> }
  | { kind: 'file'; uri: string; mimeType: string; name?: string; metadata?: Record<string, unknown> }
  | { kind: 'artifact'; artifactId: string; metadata?: Record<string, unknown> };

export type A2AMessage = {
  messageId: string;
  role: 'user' | 'agent' | 'tool' | 'system';
  parts: MessagePart[];
  createdAt: string;
  metadata?: Record<string, unknown>;
};
