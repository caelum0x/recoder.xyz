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

    // Handle arrays
    if (Array.isArray(value)) {
      return { items: value }
    }

    // Handle primitive types
    if (typeof value === "number" || typeof value === "boolean") {
      return { value }
    }

    // Handle objects
    if (typeof value === "object") {
      return value
    }

    // Fallback for unknown types
    return { value: String(value) }
  } catch (error) {
    // If JSON parsing fails, return the string wrapped in an object
    return { rawValue: value }
  }
}

/**
 * Browser stub for VS Code LM message conversion
 * @param messages Anthropic messages 
 * @returns Empty array since VS Code LM is not available in browser
 */
export function convertToVsCodeLmMessages(
  messages: Anthropic.Messages.MessageParam[]
): any[] {
  // In browser environment, VS Code LM is not available
  // Return empty array to prevent errors
  return []
}

/**
 * Browser stub for Anthropic role conversion
 * @param role VS Code LM role
 * @returns Default assistant role
 */
export function convertToAnthropicRole(role: any): "user" | "assistant" {
  // Default to assistant since VS Code LM roles don't apply in browser
  return "assistant"
}
