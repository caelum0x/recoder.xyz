/**
 * Browser-safe provider exports
 * Only includes providers that work in browser environments
 */

// Export browser-safe providers
export { AnthropicHandler } from "./anthropic"
export { AwsBedrockHandler } from "./bedrock"
export { CerebrasHandler } from "./cerebras"
export { ChutesHandler } from "./chutes"
export { ClaudeCodeHandler } from "./claude-code"
export { DeepSeekHandler } from "./deepseek"
export { FakeAIHandler } from "./fake-ai"
export { GeminiHandler } from "./gemini"
export { GlamaHandler } from "./glama"
export { GroqHandler } from "./groq"
export { LiteLLMHandler } from "./lite-llm"
export { LmStudioHandler } from "./lm-studio"
export { MistralHandler } from "./mistral"
export { OllamaHandler } from "./ollama"
export { OpenAiNativeHandler } from "./openai-native"
export { OpenAiHandler } from "./openai"
export { OpenRouterHandler } from "./openrouter"
export { RequestyHandler } from "./requesty"
export { UnboundHandler } from "./unbound"
export { VertexHandler } from "./vertex"
export { XAIHandler } from "./xai"

// Export browser-safe stubs for problematic providers
export { GeminiCliHandler } from "./gemini-cli-browser"
export { HumanRelayHandler } from "./human-relay-browser"
export { VsCodeLmHandler } from "./vscode-lm-browser"

// Note: AnthropicVertexHandler is excluded as it requires Google Auth Library
// which has Node.js dependencies. In production, this should be handled
// on the server-side only.