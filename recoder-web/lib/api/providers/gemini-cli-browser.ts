/**
 * Browser-safe stub for GeminiCliHandler
 * This provider requires server-side file system access and is not available in browser environments
 */

import type { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared"
import type { ApiStream } from "../transform/stream"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { BaseProvider } from "./base-provider"

export class GeminiCliHandler extends BaseProvider implements SingleCompletionHandler {
  protected options: ApiHandlerOptions

  constructor(options: ApiHandlerOptions) {
    super()
    this.options = options
  }

  async *createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: ApiHandlerCreateMessageMetadata,
  ): ApiStream {
    throw new Error('GeminiCliHandler is not available in browser environments. This provider requires server-side file system access for OAuth credential management.')
  }

  getModel(): { id: string; info: ModelInfo } {
    throw new Error('GeminiCliHandler is not available in browser environments. This provider requires server-side file system access for OAuth credential management.')
  }

  async completePrompt(prompt: string): Promise<string> {
    throw new Error('GeminiCliHandler is not available in browser environments. This provider requires server-side file system access for OAuth credential management.')
  }
}