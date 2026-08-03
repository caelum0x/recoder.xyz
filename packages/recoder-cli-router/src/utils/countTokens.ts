import { Anthropic } from "@anthropic-ai/sdk"

import { tiktoken } from "./tiktoken"

export type CountTokensOptions = {
	useWorker?: boolean
}

/**
 * Counts tokens for Anthropic-format content blocks.
 *
 * The upstream implementation optionally offloads to a workerpool; this
 * vendored router build always counts in-process via tiktoken (the `useWorker`
 * option is accepted for signature compatibility).
 */
export async function countTokens(
	content: Anthropic.Messages.ContentBlockParam[],
	_options: CountTokensOptions = {},
): Promise<number> {
	return tiktoken(content)
}
