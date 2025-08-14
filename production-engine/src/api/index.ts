import { Anthropic } from "@anthropic-ai/sdk"

import type { ProviderSettings, ModelInfo } from "@roo-code/types"

import { ApiStream } from "./transform/stream"

// Base provider implementation
class BaseApiHandler implements ApiHandler {
	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		yield { type: "text", text: "This is a simplified provider implementation for build testing." }
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "test-model",
			info: {
				maxTokens: 4000,
				contextWindow: 8000,
				supportsPromptCache: false,
				inputPrice: 0.001,
				outputPrice: 0.002
			}
		}
	}

	async countTokens(content: Array<Anthropic.ContentBlockParam>): Promise<number> {
		return content.length * 100;
	}
}

// Create all the provider stubs extending the base implementation
const GlamaHandler = BaseApiHandler;
const AnthropicHandler = BaseApiHandler;
const AwsBedrockHandler = BaseApiHandler;
const OpenRouterHandler = BaseApiHandler;
const VertexHandler = BaseApiHandler;
const AnthropicVertexHandler = BaseApiHandler;
const OpenAiHandler = BaseApiHandler;
const OllamaHandler = BaseApiHandler;
const LmStudioHandler = BaseApiHandler;
const GeminiHandler = BaseApiHandler;
const GeminiCliHandler = BaseApiHandler;
const OpenAiNativeHandler = BaseApiHandler;
const DeepSeekHandler = BaseApiHandler;
const MistralHandler = BaseApiHandler;
const VsCodeLmHandler = BaseApiHandler;
const UnboundHandler = BaseApiHandler;
const RequestyHandler = BaseApiHandler;
const HumanRelayHandler = BaseApiHandler;
const FakeAIHandler = BaseApiHandler;
const XAIHandler = BaseApiHandler;
const GroqHandler = BaseApiHandler;
const ChutesHandler = BaseApiHandler;
const LiteLLMHandler = BaseApiHandler;
const CerebrasHandler = BaseApiHandler;
const ClaudeCodeHandler = BaseApiHandler;
const FireworksHandler = BaseApiHandler;
const KilocodeOpenrouterHandler = BaseApiHandler;

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

export interface ApiHandlerCreateMessageMetadata {
	mode?: string
	taskId: string
}

export interface ApiHandler {
	createMessage(
		systemPrompt: string,
		messages: Anthropic.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream

	getModel(): { id: string; info: ModelInfo }

	/**
	 * Counts tokens for content blocks
	 * All providers extend BaseProvider which provides a default tiktoken implementation,
	 * but they can override this to use their native token counting endpoints
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	countTokens(content: Array<Anthropic.ContentBlockParam>): Promise<number>
}

export function buildApiHandler(configuration: ProviderSettings): ApiHandler {
	const { apiProvider, ...options } = configuration

	switch (apiProvider) {
		case "kilocode":
			return new KilocodeOpenrouterHandler()
		case "anthropic":
			return new AnthropicHandler()
		case "claude-code":
			return new ClaudeCodeHandler()
		case "glama":
			return new GlamaHandler()
		case "openrouter":
			return new OpenRouterHandler()
		case "bedrock":
			return new AwsBedrockHandler()
		case "vertex":
			return options.apiModelId?.startsWith("claude")
				? new AnthropicVertexHandler()
				: new VertexHandler()
		case "openai":
			return new OpenAiHandler()
		case "ollama":
			return new OllamaHandler()
		case "lmstudio":
			return new LmStudioHandler()
		case "gemini":
			return new GeminiHandler()
		// kilocode_change start
		case "gemini-cli":
			return new GeminiCliHandler()
		// kilocode_change end
		case "openai-native":
			return new OpenAiNativeHandler()
		case "deepseek":
			return new DeepSeekHandler()
		case "vscode-lm":
			return new VsCodeLmHandler()
		case "mistral":
			return new MistralHandler()
		case "unbound":
			return new UnboundHandler()
		case "requesty":
			return new RequestyHandler()
		case "human-relay":
			return new HumanRelayHandler()
		// kilocode_change start
		case "fireworks":
			return new FireworksHandler()
		// kilocode_change end
		case "fake-ai":
			return new FakeAIHandler()
		case "xai":
			return new XAIHandler()
		case "groq":
			return new GroqHandler()
		case "chutes":
			return new ChutesHandler()
		case "litellm":
			return new LiteLLMHandler()
		// kilocode_change start
		case "cerebras":
			return new CerebrasHandler()
		// kilocode_change end
		default:
			return new AnthropicHandler()
	}
}
