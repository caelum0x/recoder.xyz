/**
 * Token counting utilities for production engine
 */

export function countTokens(text: string): number {
  // Simple token counting approximation (1 token ≈ 4 characters)
  return Math.ceil(text.length / 4);
}

export function countTokensInMessages(messages: any[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    if (message.content) {
      totalTokens += countTokens(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
    }
  }
  return totalTokens;
}