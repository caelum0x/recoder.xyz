/**
 * Browser-safe version of vscode-lm-format
 * This version doesn't import VS Code APIs and provides stub implementations
 */

import { Anthropic } from "@anthropic-ai/sdk"

/**
 * Safely converts a value into a plain object.
 */
function asObjectSafe(value: any): object {
  // Handle null/undefined
  if (!value) {
    return {}
  }

  try {
    // Handle strings that might be JSON
    if (typeof value === "string") {
      return JSON.parse(value)
    }

    // Handle pre-existing objects
    if (typeof value === "object") {
      return { ...value }
    }

    return {}
  } catch (error) {
    console.warn("Browser VS Code LM Format: Failed to parse object:", error)
    return {}
  }
}

/**
 * Convert Anthropic messages to VS Code LM format (browser stub)
 */
export function convertToVsCodeLmMessages(messages: Anthropic.Messages.MessageParam[]): any[] {
  // Browser stub implementation
  return messages.map(message => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
  }));
}

/**
 * Convert VS Code LM response to Anthropic format (browser stub)
 */
export function convertFromVsCodeLmResponse(response: any): string {
  // Browser stub implementation
  if (typeof response === 'string') {
    return response;
  }
  
  if (response && response.content) {
    return response.content;
  }
  
  return JSON.stringify(response);
}

// Browser stubs for VS Code LM types
export interface VsCodeLmMessage {
  role: string;
  content: string;
}

export interface VsCodeLmRequest {
  messages: VsCodeLmMessage[];
  model?: string;
}

export interface VsCodeLmResponse {
  content: string;
}