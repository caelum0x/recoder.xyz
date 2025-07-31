import { DEEP_SEEK_DEFAULT_TEMPERATURE, type ChutesModelId, chutesDefaultModelId, chutesModels } from "@recoder/shared"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "@recoder/shared"
import { XmlMatcher } from "../../utils/xml-matcher"
import { convertToR1Format } from "../transform/r1-format"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class ChutesHandler extends BaseOpenAiCompatibleProvider<ChutesModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Chutes",
			baseURL: "https://llm.chutes.ai/v1",
			apiKey: options.chutesApiKey,
			defaultProviderModelId: chutesDefaultModelId,
			providerModels: chutesModels,
			defaultTemperature: 0.5,
		})
	}

	private getCompletionParams(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		const {
			id: model,
			info: { maxTokens: max_tokens },
		} = this.getModel()

		const temperature = this.options.modelTemperature ?? this.getModel().info.temperature

		return {
			model,
			max_tokens,
			temperature,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		}
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const model = this.getModel()

		if (model.id.includes("DeepSeek-R1")) {
			const stream = await this.client.chat.completions.create({
				...this.getCompletionParams(systemPrompt, messages),
				messages: convertToR1Format([{ role: "user", content: systemPrompt }, ...messages]),
			})

			const matcher = new XmlMatcher();
			let buffer = '';

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta

				if (delta?.content) {
					buffer += delta.content;
					matcher.update(delta.content);
					
					// Simple processing - check if content contains thinking tags
					if (buffer.includes('<think>') && buffer.includes('</think>')) {
						const thinkingContent = XmlMatcher.extract(buffer, 'think');
						if (thinkingContent) {
							yield {
								type: "reasoning",
								text: thinkingContent,
							} as const;
						}
						// Extract non-thinking content
						const cleanContent = buffer.replace(/<think>.*?<\/think>/gs, '');
						if (cleanContent.trim()) {
							yield {
								type: "text",
								text: cleanContent,
							} as const;
						}
						buffer = '';
					} else {
						// Regular text content
						yield {
							type: "text",
							text: delta.content,
						} as const;
					}
				}

				if (chunk.usage) {
					yield {
						type: "usage",
						inputTokens: chunk.usage.prompt_tokens || 0,
						outputTokens: chunk.usage.completion_tokens || 0,
					}
				}
			}

			// Process any remaining content
			if (buffer.trim()) {
				yield {
					type: "text",
					text: buffer,
				} as const;
			}
		} else {
			yield* super.createMessage(systemPrompt, messages)
		}
	}

	override getModel() {
		const model = super.getModel()
		const isDeepSeekR1 = model.id.includes("DeepSeek-R1")
		return {
			...model,
			info: {
				...model.info,
				temperature: isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : this.defaultTemperature,
			},
		}
	}
}
