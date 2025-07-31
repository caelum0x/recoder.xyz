/**
 * Bedrock types and constants for recoder.xyz
 * Replaces @roo-code/types imports
 */

// Bedrock Model IDs
export type BedrockModelId = 
  | "anthropic.claude-3-5-sonnet-20241022-v2:0"
  | "anthropic.claude-3-5-sonnet-20240620-v1:0"
  | "anthropic.claude-3-5-haiku-20241022-v1:0"
  | "anthropic.claude-3-opus-20240229-v1:0"
  | "anthropic.claude-3-sonnet-20240229-v1:0"
  | "anthropic.claude-3-haiku-20240307-v1:0"
  | "amazon.titan-text-premier-v1:0"
  | "amazon.titan-text-express-v1"
  | "meta.llama3-2-90b-instruct-v1:0"
  | "meta.llama3-2-11b-instruct-v1:0"
  | "meta.llama3-2-3b-instruct-v1:0"
  | "meta.llama3-2-1b-instruct-v1:0"
  | "meta.llama3-1-405b-instruct-v1:0"
  | "meta.llama3-1-70b-instruct-v1:0"
  | "meta.llama3-1-8b-instruct-v1:0"
  | "mistral.mistral-large-2407-v1:0"
  | "mistral.mistral-small-2402-v1:0";

// Default model configurations
export const bedrockDefaultModelId: BedrockModelId = "anthropic.claude-3-5-sonnet-20241022-v2:0";
export const bedrockDefaultPromptRouterModelId: BedrockModelId = "anthropic.claude-3-5-sonnet-20241022-v2:0";

// Bedrock constants
export const BEDROCK_DEFAULT_TEMPERATURE = 0.7;
export const BEDROCK_MAX_TOKENS = 4096;
export const BEDROCK_DEFAULT_CONTEXT = 200000;

// AWS Inference Profile Mapping
export const AWS_INFERENCE_PROFILE_MAPPING: Record<string, BedrockModelId> = {
  "us.anthropic.claude-3-5-sonnet-20241022-v2:0": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "us.anthropic.claude-3-5-sonnet-20240620-v1:0": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "us.anthropic.claude-3-5-haiku-20241022-v1:0": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "us.anthropic.claude-3-opus-20240229-v1:0": "anthropic.claude-3-opus-20240229-v1:0",
  "us.anthropic.claude-3-sonnet-20240229-v1:0": "anthropic.claude-3-sonnet-20240229-v1:0",
  "us.anthropic.claude-3-haiku-20240307-v1:0": "anthropic.claude-3-haiku-20240307-v1:0",
};

// Bedrock model definitions with pricing and capabilities
export const bedrockModels: Record<BedrockModelId, ModelInfo> = {
  "anthropic.claude-3-5-sonnet-20241022-v2:0": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet v2 - Most capable Claude model"
  },
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet v1"
  },
  "anthropic.claude-3-5-haiku-20241022-v1:0": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3.5 Haiku - Fast and efficient"
  },
  "anthropic.claude-3-opus-20240229-v1:0": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    description: "Claude 3 Opus - Most powerful Claude model"
  },
  "anthropic.claude-3-sonnet-20240229-v1:0": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3 Sonnet - Balanced performance"
  },
  "anthropic.claude-3-haiku-20240307-v1:0": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3 Haiku - Fast and cost-effective"
  },
  "amazon.titan-text-premier-v1:0": {
    maxTokens: 3000,
    contextWindow: 32000,
    supportsImages: false,
    supportsTools: false,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 1.50,
    description: "Amazon Titan Text Premier"
  },
  "amazon.titan-text-express-v1": {
    maxTokens: 8000,
    contextWindow: 8000,
    supportsImages: false,
    supportsTools: false,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.20,
    outputPricePerMillion: 0.60,
    description: "Amazon Titan Text Express"
  },
  "meta.llama3-2-90b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 2.65,
    outputPricePerMillion: 3.50,
    description: "Meta Llama 3.2 90B Instruct"
  },
  "meta.llama3-2-11b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.35,
    outputPricePerMillion: 1.40,
    description: "Meta Llama 3.2 11B Instruct"
  },
  "meta.llama3-2-3b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    description: "Meta Llama 3.2 3B Instruct"
  },
  "meta.llama3-2-1b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
    description: "Meta Llama 3.2 1B Instruct"
  },
  "meta.llama3-1-405b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 32768,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 5.32,
    outputPricePerMillion: 16.00,
    description: "Meta Llama 3.1 405B Instruct"
  },
  "meta.llama3-1-70b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.99,
    outputPricePerMillion: 2.99,
    description: "Meta Llama 3.1 70B Instruct"
  },
  "meta.llama3-1-8b-instruct-v1:0": {
    maxTokens: 2048,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.22,
    outputPricePerMillion: 0.22,
    description: "Meta Llama 3.1 8B Instruct"
  },
  "mistral.mistral-large-2407-v1:0": {
    maxTokens: 8192,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 9.00,
    description: "Mistral Large 2"
  },
  "mistral.mistral-small-2402-v1:0": {
    maxTokens: 8192,
    contextWindow: 32000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 3.00,
    description: "Mistral Small"
  }
};

// Provider Settings interface
export interface ProviderSettings {
  apiModelId?: string;
  modelTemperature?: number;
  maxTokens?: number;
  anthropicApiKey?: string;
  awsRegion?: string;
  awsCredentialsProfile?: string;
  awsCustomArn?: string;
  [key: string]: any;
}

// Re-export ModelInfo from api.ts to avoid circular dependencies
import type { ModelInfo } from './api';