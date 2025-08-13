import { Anthropic } from "@anthropic-ai/sdk"
import { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage"
import { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage"
import { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage"
import { UserMessage } from "@mistralai/mistralai/models/components/usermessage"

// Define types compatible with Anthropic SDK
type AnthropicMessageParam = {
	role: 'user' | 'assistant' | 'system';
	content: string | Array<AnthropicTextBlock | AnthropicImageBlock | AnthropicToolUseBlock | AnthropicToolResultBlock>;
};
type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicImageBlock = { type: 'image'; source: { type: 'base64' | 'url'; media_type: string; data?: string; url?: string } };
type AnthropicToolUseBlock = { type: 'tool_use'; id: string; name: string; input: any };
type AnthropicToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string | any[] };

export type MistralMessage =
	| (SystemMessage & { role: "system" })
	| (UserMessage & { role: "user" })
	| (AssistantMessage & { role: "assistant" })
	| (ToolMessage & { role: "tool" })

export function convertToMistralMessages(anthropicMessages: AnthropicMessageParam[]): MistralMessage[] {
	const mistralMessages: MistralMessage[] = []

	for (const anthropicMessage of anthropicMessages) {
		if (typeof anthropicMessage.content === "string") {
			mistralMessages.push({
				role: anthropicMessage.role,
				content: anthropicMessage.content,
			})
		} else {
			if (anthropicMessage.role === "user") {
				const { nonToolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (AnthropicTextBlock | AnthropicImageBlock)[]
					toolMessages: AnthropicToolResultBlock[]
				}>(
					(acc: { nonToolMessages: (AnthropicTextBlock | AnthropicImageBlock)[]; toolMessages: AnthropicToolResultBlock[] }, part: any) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						} // user cannot send tool_use messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				if (nonToolMessages.length > 0) {
					mistralMessages.push({
						role: "user",
						content: nonToolMessages.map((part: AnthropicTextBlock | AnthropicImageBlock) => {
							if (part.type === "image") {
								return {
									type: "image_url",
									imageUrl: {
										// kilocode_change begin support type==url
										url:
											part.source.type === "url"
												? part.source.url || ""
												: `data:${part.source.media_type};base64,${part.source.data || ""}`,
										// kilocode_change end
									},
								} as any
							}
							return { type: "text", text: part.text } as any
						}) as any,
					})
				}
			} else if (anthropicMessage.role === "assistant") {
				const { nonToolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (AnthropicTextBlock | AnthropicImageBlock)[]
					toolMessages: AnthropicToolUseBlock[]
				}>(
					(acc: { nonToolMessages: (AnthropicTextBlock | AnthropicImageBlock)[]; toolMessages: AnthropicToolUseBlock[] }, part: any) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						} // assistant cannot send tool_result messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				let content: string | undefined
				if (nonToolMessages.length > 0) {
					content = nonToolMessages
						.map((part: AnthropicTextBlock | AnthropicImageBlock) => {
							if (part.type === "image") {
								return "" // impossible as the assistant cannot send images
							}
							return part.text
						})
						.join("\n")
				}

				mistralMessages.push({
					role: "assistant",
					content,
				})
			}
		}
	}

	return mistralMessages
}
