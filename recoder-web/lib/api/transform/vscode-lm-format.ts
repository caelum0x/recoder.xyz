import { Anthropic } from "@anthropic-ai/sdk"

// Browser stub for VS Code LM format conversion
// This module is VS Code-specific and should not be used in browser builds

// Mock types for browser compatibility
type MockVsCodeLmMessage = any
type MockVsCodeLmMessageRole = any

/**
 * Browser stub: VS Code LM message conversion is not available in browser builds
 */
export function convertToVsCodeLmMessages(
	anthropicMessages: Anthropic.Messages.MessageParam[],
): MockVsCodeLmMessage[] {
	throw new Error("VS Code LM format conversion is not available in browser builds. This functionality is only available in VS Code extensions.")
}

/**
 * Browser stub: VS Code role conversion is not available in browser builds
 */
export function convertToAnthropicRole(vsCodeLmMessageRole: MockVsCodeLmMessageRole): string | null {
	throw new Error("VS Code role conversion is not available in browser builds. This functionality is only available in VS Code extensions.")
}
