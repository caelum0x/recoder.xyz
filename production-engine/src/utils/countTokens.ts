/**
 * Token counting utilities for production engine
 */

import { Anthropic } from "@anthropic-ai/sdk"

export function countTokens(
  content: Anthropic.ContentBlockParam[], 
  options?: { useWorker?: boolean }
): Promise<number> {
  // Simple token counting approximation (1 token ≈ 4 characters)
  let totalTokens = 0;
  
  for (const block of content) {
    if (block.type === 'text') {
      totalTokens += Math.ceil(block.text.length / 4);
    } else if (block.type === 'image') {
      // Approximate tokens for image blocks
      totalTokens += 170; // Standard image token count
    }
  }
  
  return Promise.resolve(totalTokens);
}

export function countTokensInText(text: string): number {
  // Simple token counting approximation (1 token ≈ 4 characters)
  return Math.ceil(text.length / 4);
}

export function countTokensInMessages(messages: any[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    if (message.content) {
      totalTokens += countTokensInText(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
    }
  }
  return totalTokens;
}