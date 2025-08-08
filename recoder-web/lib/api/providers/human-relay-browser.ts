/**
 * Browser-safe stub for HumanRelayHandler
 * This provider requires VS Code APIs and is not available in browser environments
 */

import type { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared"
import type { ApiStream } from "../transform/stream"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { BaseProvider } from "./base-provider"

export class HumanRelayHandler extends BaseProvider implements SingleCompletionHandler {
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
    throw new Error('HumanRelayHandler is not available in browser environments. This provider requires VS Code APIs.')
  }

  getModel(): { id: string; info: ModelInfo } {
    throw new Error('HumanRelayHandler is not available in browser environments. This provider requires VS Code APIs.')
  }

  async completePrompt(prompt: string): Promise<string> {
    throw new Error('HumanRelayHandler is not available in browser environments. This provider requires VS Code APIs.')
  }
}