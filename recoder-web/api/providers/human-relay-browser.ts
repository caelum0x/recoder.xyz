/**
 * Browser-safe stub for HumanRelayHandler
 * This provider requires VS Code APIs and is not available in browser environments
 */

import type { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../lib/shared"
import type { ApiStream } from "../transform/stream"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata, ApiHandler } from "../index"

/**
 * Browser-safe stub for human relay functionality
 * This handler is not functional in browser environments
 */
export class HumanRelayHandler implements ApiHandler {
	private options: ApiHandlerOptions

	constructor(options: ApiHandlerOptions) {
		this.options = options
	}

	createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		return (async function* () {
			throw new Error("Human relay is not supported in browser environments")
		})()
	}

	async completePrompt(prompt: string): Promise<string> {
		throw new Error("Human relay is not supported in browser environments")
	}

	async countTokens(content: Array<any>): Promise<number> {
		// Return a default token count for browser environments
		const text = content.map(block => 
			typeof block === 'string' ? block : 
			block.text || JSON.stringify(block)
		).join(' ')
		// Rough approximation: 1 token per 4 characters
		return Math.ceil(text.length / 4)
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "human-relay",
			info: {
				maxTokens: 0,
				contextWindow: 0,
				supportsImages: false,
				supportsPromptCache: false,
			},
		}
	}
}
