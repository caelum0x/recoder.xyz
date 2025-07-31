import { Anthropic } from "@anthropic-ai/sdk"

// Conditionally import vscode only when available (VS Code extension context)
let vscode: any;
try {
	vscode = require("vscode");
} catch {
	// vscode not available in CLI mode, use comprehensive stub with all required classes
	const LanguageModelTextPart = class {
		constructor(public value: string) {}
	};
	
	const LanguageModelToolResultPart = class {
		constructor(public callId: string, public content: any[]) {}
	};
	
	const LanguageModelToolCallPart = class {
		constructor(public callId: string, public name: string, public input: any) {}
	};
	
	vscode = {
		LanguageModelTextPart,
		LanguageModelToolResultPart,
		LanguageModelToolCallPart,
		LanguageModelChatMessage: {
			User: (content: any) => ({ role: 1, content }),
			Assistant: (content: any) => ({ role: 2, content }),
		},
		LanguageModelChatMessageRole: {
			User: 1,
			Assistant: 2,
		},
	};
}

// Type aliases to avoid namespace issues
type VSCodeLmChatMessage = any;
type VSCodeLmTextPart = any;
type VSCodeLmMessageRole = any;

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
		console.warn("Kilo Code <Language Model API>: Failed to parse object:", error)
		return {}
	}
}

export function convertToVsCodeLmMessages(
	anthropicMessages: Anthropic.Messages.MessageParam[],
): VSCodeLmChatMessage[] {
	const vsCodeLmMessages: VSCodeLmChatMessage[] = []

	for (const anthropicMessage of anthropicMessages) {
		// Handle simple string messages
		if (typeof anthropicMessage.content === "string") {
			vsCodeLmMessages.push(
				anthropicMessage.role === "assistant"
					? vscode.LanguageModelChatMessage.Assistant(anthropicMessage.content)
					: vscode.LanguageModelChatMessage.User(anthropicMessage.content),
			)
			continue
		}

		// Handle complex message structures
		switch (anthropicMessage.role) {
			case "user": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
					toolMessages: Anthropic.ToolResultBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						}
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process tool messages first then non-tool messages
				const contentParts = [
					// Convert tool messages to ToolResultParts
					...toolMessages.map((toolMessage) => {
						// Process tool result content into TextParts
						const toolContentParts: VSCodeLmTextPart[] =
							typeof toolMessage.content === "string"
								? [new vscode.LanguageModelTextPart(toolMessage.content)]
								: (toolMessage.content?.map((part) => {
										if (part.type === "image") {
											return new vscode.LanguageModelTextPart(
												// kilocode_change begin support type==url
												`[Image (${part.source?.type || "Unknown source-type"}): ${part.source?.type === "url" ? "URL" : part.source?.media_type || "unknown media-type"} not supported by VSCode LM API]`,
												// kilocode_change end
											)
										}
										return new vscode.LanguageModelTextPart(part.text)
									}) ?? [new vscode.LanguageModelTextPart("")])

						return new vscode.LanguageModelToolResultPart(toolMessage.tool_use_id, toolContentParts)
					}),

					// Convert non-tool messages to TextParts after tool messages
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return new vscode.LanguageModelTextPart(
								// kilocode_change begin support type==url
								`[Image (${part.source?.type || "Unknown source-type"}): ${part.source?.type === "url" ? "URL" : part.source?.media_type || "unknown media-type"} not supported by VSCode LM API]`,
								// kilocode_change end
							)
						}
						return new vscode.LanguageModelTextPart(part.text)
					}),
				]

				// Add single user message with all content parts
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.User(contentParts))
				break
			}

			case "assistant": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
					toolMessages: Anthropic.ToolUseBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						}
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process tool messages first then non-tool messages
				const contentParts = [
					// Convert tool messages to ToolCallParts first
					...toolMessages.map(
						(toolMessage) =>
							new vscode.LanguageModelToolCallPart(
								toolMessage.id,
								toolMessage.name,
								asObjectSafe(toolMessage.input),
							),
					),

					// Convert non-tool messages to TextParts after tool messages
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return new vscode.LanguageModelTextPart("[Image generation not supported by VSCode LM API]")
						}
						return new vscode.LanguageModelTextPart(part.text)
					}),
				]

				// Add the assistant message to the list of messages
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.Assistant(contentParts))
				break
			}
		}
	}

	return vsCodeLmMessages
}

export function convertToAnthropicRole(vsCodeLmMessageRole: VSCodeLmMessageRole): string | null {
	switch (vsCodeLmMessageRole) {
		case 2: // Assistant role
			return "assistant"
		case 1: // User role
			return "user"
		default:
			return null
	}
}
