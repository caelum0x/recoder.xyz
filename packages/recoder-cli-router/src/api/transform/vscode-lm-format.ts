import { Anthropic } from "@anthropic-ai/sdk"
// Conditional import for VS Code - fallback for CLI context
declare namespace vscode {
	export class LanguageModelChatMessage {
		role: LanguageModelChatMessageRole;
		content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart)[];
		name: string | undefined;
		constructor(role: any, content: any);
		static Assistant(content: any): LanguageModelChatMessage;
		static User(content: any): LanguageModelChatMessage;
		static System(content: any): LanguageModelChatMessage;
	}
	export class LanguageModelTextPart {
		constructor(text: string);
	}
	export class LanguageModelToolResultPart {
		constructor(callId: string, content: any[]);
	}
	export class LanguageModelToolCallPart {
		constructor(id: string, name: string, parameters: any);
	}
	export enum LanguageModelChatMessageRole {
		Assistant = 1,
		User = 2
	}
}

let vsCodeModule: any = null;
try {
	vsCodeModule = require("vscode");
	// Use the real vscode module if available
	(globalThis as any).vscode = vsCodeModule;
} catch (error) {
	// Fallback implementations for CLI context
	const LanguageModelChatMessage = class {
		constructor(public role: any, public content: any) {}
		static Assistant(content: any) { return new LanguageModelChatMessage(1, content); }
		static User(content: any) { return new LanguageModelChatMessage(2, content); }
		static System(content: any) { return new LanguageModelChatMessage(0, content); }
	};
	
	const LanguageModelTextPart = class {
		constructor(public text: string) {}
	};
	
	const LanguageModelToolResultPart = class {
		constructor(public callId: string, public content: any[]) {}
	};
	
	const LanguageModelToolCallPart = class {
		constructor(public id: string, public name: string, public parameters: any) {}
	};
	
	const LanguageModelChatMessageRole = {
		Assistant: 1,
		User: 2
	};
	
	(globalThis as any).vscode = {
		LanguageModelChatMessage,
		LanguageModelTextPart,
		LanguageModelToolResultPart,
		LanguageModelToolCallPart,
		LanguageModelChatMessageRole
	};
}

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
): vscode.LanguageModelChatMessage[] {
	const vsCodeLmMessages: vscode.LanguageModelChatMessage[] = []

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
						const toolContentParts: vscode.LanguageModelTextPart[] =
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

export function convertToAnthropicRole(vsCodeLmMessageRole: vscode.LanguageModelChatMessageRole): string | null {
	switch (vsCodeLmMessageRole) {
		case vscode.LanguageModelChatMessageRole.Assistant:
			return "assistant"
		case vscode.LanguageModelChatMessageRole.User:
			return "user"
		default:
			return null
	}
}
