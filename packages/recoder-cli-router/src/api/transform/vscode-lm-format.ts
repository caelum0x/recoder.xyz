import { Anthropic } from "@anthropic-ai/sdk"
import * as vscodeModule from "vscode"

// Local type declarations for the VS Code Language Model API. The installed
// "vscode" npm package ships pre-LM-API typings, so the shapes used here are
// declared locally and the runtime module is cast to them.
declare namespace vscodeTypes {
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

// This module is only loaded from the VS Code LM provider (never on the CLI
// path — `buildApiHandler` rejects "vscode-lm" outside VS Code), so a static
// import is safe and lets tests mock the "vscode" module normally.
const vscode = vscodeModule as unknown as typeof vscodeTypes

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
): vscodeTypes.LanguageModelChatMessage[] {
	const vsCodeLmMessages: vscodeTypes.LanguageModelChatMessage[] = []

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
						const toolContentParts: vscodeTypes.LanguageModelTextPart[] =
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

export function convertToAnthropicRole(vsCodeLmMessageRole: vscodeTypes.LanguageModelChatMessageRole): string | null {
	switch (vsCodeLmMessageRole) {
		case vscode.LanguageModelChatMessageRole.Assistant:
			return "assistant"
		case vscode.LanguageModelChatMessageRole.User:
			return "user"
		default:
			return null
	}
}
