/**
 * Token counting utilities for different content types
 */
import { Anthropic } from "@anthropic-ai/sdk"

export interface TokenCountResult {
	totalTokens: number
	textTokens: number
	imageTokens: number
}

/**
 * Count tokens in content blocks using a simple estimation
 * This is a fallback when native APIs are not available
 */
export function estimateTokenCount(content: Array<Anthropic.Messages.MessageParam['content']>): number {
	if (!content) return 0

	let totalTokens = 0

	for (const item of content) {
		if (typeof item === 'string') {
			// Simple estimation: ~4 characters per token
			totalTokens += Math.ceil(item.length / 4)
		} else if (Array.isArray(item)) {
			// Handle array of content blocks
			for (const block of item) {
				if (typeof block === 'object' && block !== null) {
					if ('type' in block && 'text' in block && block.type === 'text') {
						totalTokens += Math.ceil((block.text as string).length / 4)
					} else if ('type' in block && block.type === 'image') {
						// Fixed cost for images (rough estimate)
						totalTokens += 1024
					}
				}
			}
		}
	}

	return totalTokens
}

/**
 * Count tokens using tiktoken encoding (basic implementation)
 */
export function countTokensTiktoken(text: string): number {
	// Simple fallback estimation when tiktoken is not available
	return Math.ceil(text.length / 4)
}