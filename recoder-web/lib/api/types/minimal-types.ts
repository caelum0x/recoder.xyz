// Minimal types for core AI providers - just what we need for production
export interface ModelInfo {
  maxTokens?: number
  contextWindow?: number
  supportsImages?: boolean
  supportsPromptCache?: boolean
  inputPrice?: number
  outputPrice?: number
  supportsComputerUse?: boolean
  supportsStreaming?: boolean
}

export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096

// Anthropic types
export type AnthropicModelId = 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022' | 'claude-3-opus-20240229'
export const anthropicDefaultModelId: AnthropicModelId = 'claude-3-5-sonnet-20241022'
export const anthropicModels: Record<AnthropicModelId, ModelInfo> = {
  'claude-3-5-sonnet-20241022': {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsPromptCache: true,
    inputPrice: 0.003,
    outputPrice: 0.015,
    supportsComputerUse: true,
    supportsStreaming: true
  },
  'claude-3-5-haiku-20241022': {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsPromptCache: true,
    inputPrice: 0.0008,
    outputPrice: 0.004,
    supportsComputerUse: false,
    supportsStreaming: true
  },
  'claude-3-opus-20240229': {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsPromptCache: true,
    inputPrice: 0.015,
    outputPrice: 0.075,
    supportsComputerUse: false,
    supportsStreaming: true
  }
}

// Vertex AI types
export type VertexModelId = 'claude-3-5-sonnet-v2@20241022' | 'claude-3-5-haiku@20241022' | 'claude-3-opus@20240229'
export const vertexDefaultModelId: VertexModelId = 'claude-3-5-sonnet-v2@20241022'
export const vertexModels: Record<VertexModelId, ModelInfo> = {
  'claude-3-5-sonnet-v2@20241022': anthropicModels['claude-3-5-sonnet-20241022'],
  'claude-3-5-haiku@20241022': anthropicModels['claude-3-5-haiku-20241022'],
  'claude-3-opus@20240229': anthropicModels['claude-3-opus-20240229']
}

// Provider Settings interface
export interface ProviderSettings {
  apiKey?: string
  baseURL?: string
  apiModelId?: string
  temperature?: number
  maxTokens?: number
  reasoning?: boolean
  vertexProjectId?: string
  vertexRegion?: string
  vertexJsonCredentials?: string
  vertexKeyFile?: string
}

// Claude Code types (minimal)
export type ClaudeCodeModelId = 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022'
export const claudeCodeDefaultModelId: ClaudeCodeModelId = 'claude-3-5-sonnet-20241022'
export const claudeCodeModels: Record<ClaudeCodeModelId, ModelInfo> = {
  'claude-3-5-sonnet-20241022': anthropicModels['claude-3-5-sonnet-20241022'],
  'claude-3-5-haiku-20241022': anthropicModels['claude-3-5-haiku-20241022']
}

export function getClaudeCodeModelId(modelId: ClaudeCodeModelId, useVertex?: boolean): string {
  if (useVertex) {
    const vertexMap: Record<ClaudeCodeModelId, string> = {
      'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-v2@20241022',
      'claude-3-5-haiku-20241022': 'claude-3-5-haiku@20241022'
    }
    return vertexMap[modelId] || modelId
  }
  return modelId
}