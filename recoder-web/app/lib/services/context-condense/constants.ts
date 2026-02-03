/**
 * Context Condense Constants
 * Configuration values and model context windows
 */

import type { CondenseConfig, ModelConfig } from './types';

// Default configuration
export const DEFAULT_CONFIG: CondenseConfig = {
  messagesToKeep: 4,
  minMessagesRequired: 6,
  thresholdPercent: 80,
  useNativeTools: false,
};

// Minimum and maximum threshold percentages
export const MIN_CONDENSE_THRESHOLD = 50;
export const MAX_CONDENSE_THRESHOLD = 95;

// Token estimation ratio (characters per token, approximate)
export const CHARS_PER_TOKEN = 4;

/**
 * Model context windows and configurations
 * Maps model identifiers to their context window sizes
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Anthropic Claude models
  'claude-sonnet-4-5-20250929': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'claude-3-5-sonnet-20241022': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'claude-3-opus-20240229': {
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },
  'claude-3-haiku-20240307': {
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },

  // OpenRouter Anthropic
  'anthropic/claude-sonnet-4': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'anthropic/claude-3.5-sonnet': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'anthropic/claude-3-opus': {
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },
  'anthropic/claude-3-haiku': {
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },

  // OpenAI models
  'gpt-4-turbo': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },
  'gpt-4-turbo-preview': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'gpt-4': {
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'gpt-4o': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsImages: true,
    supportsTools: true,
  },
  'gpt-4o-mini': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsImages: true,
    supportsTools: true,
  },

  // OpenRouter OpenAI
  'openai/gpt-4-turbo': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsImages: true,
    supportsTools: true,
  },
  'openai/gpt-4': {
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'openai/gpt-4o': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsImages: true,
    supportsTools: true,
  },
  'openai/gpt-4o-mini': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsImages: true,
    supportsTools: true,
  },

  // Google models
  'google/gemini-pro-1.5': {
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'google/gemini-flash-1.5': {
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'gemini-1.5-pro': {
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },
  'gemini-1.5-flash': {
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsImages: true,
    supportsTools: true,
  },

  // X.AI / Grok models
  'x-ai/grok-beta': {
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'x-ai/grok-code-fast-1': {
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },

  // Meta Llama models
  'meta-llama/llama-3.1-405b-instruct': {
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'meta-llama/llama-3.1-70b-instruct': {
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },

  // Mistral models
  'mistralai/mistral-large': {
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsImages: false,
    supportsTools: true,
  },

  // DeepSeek models
  'deepseek/deepseek-chat': {
    contextWindow: 64000,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'deepseek/deepseek-coder': {
    contextWindow: 64000,
    maxOutputTokens: 4096,
    supportsImages: false,
    supportsTools: true,
  },
  'deepseek-reasoner': {
    contextWindow: 64000,
    maxOutputTokens: 8192,
    supportsImages: false,
    supportsTools: true,
  },
};

// Default model config for unknown models
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  contextWindow: 100000,
  maxOutputTokens: 4096,
  supportsImages: false,
  supportsTools: true,
};

/**
 * Summary prompt for condensation
 * Instructs the LLM to create a detailed summary preserving critical context
 */
export const SUMMARY_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing with the conversation and supporting any continuing tasks.

Your summary should be structured as follows:
Context: The context to continue the conversation with. If applicable based on the current task, this should include:
  1. Previous Conversation: High level details about what was discussed throughout the entire conversation with the user. This should be written to allow someone to be able to follow the general overarching conversation flow.
  2. Current Work: Describe in detail what was being worked on prior to this request to summarize the conversation. Pay special attention to the more recent messages in the conversation.
  3. Key Technical Concepts: List all important technical concepts, technologies, coding conventions, and frameworks discussed, which might be relevant for continuing with this work.
  4. Relevant Files and Code: If applicable, enumerate specific files and code sections examined, modified, or created for the task continuation. Pay special attention to the most recent messages and changes.
  5. Problem Solving: Document problems solved thus far and any ongoing troubleshooting efforts.
  6. Pending Tasks and Next Steps: Outline all pending tasks that you have explicitly been asked to work on, as well as list the next steps you will take for all outstanding work, if applicable. Include code snippets where they add clarity. For any next steps, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no information loss in context between tasks.

Example summary structure:
1. Previous Conversation:
  [Detailed description]
2. Current Work:
  [Detailed description]
3. Key Technical Concepts:
  - [Concept 1]
  - [Concept 2]
  - [...]
4. Relevant Files and Code:
  - [File Name 1]
    - [Summary of why this file is important]
    - [Summary of the changes made to this file, if any]
    - [Important Code Snippet]
  - [File Name 2]
    - [Important Code Snippet]
  - [...]
5. Problem Solving:
  [Detailed description]
6. Pending Tasks and Next Steps:
  - [Task 1 details & next steps]
  - [Task 2 details & next steps]
  - [...]

Output only the summary of the conversation so far, without any additional commentary or explanation.`;

/**
 * Quick summary template for non-LLM condensation
 */
export const QUICK_SUMMARY_TEMPLATE = {
  header: '## Conversation Summary',
  sections: {
    userRequests: '### User Requests',
    filesModified: '### Files Modified/Created',
    actionDetails: '### Action Details',
    recentContext: '### Recent Assistant Context',
    pendingTasks: '### Pending Tasks',
  },
};
