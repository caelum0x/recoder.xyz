import type { ModelInfo } from "../model"

// https://openrouter.ai/models?order=newest&supported_parameters=tools
// Updated with latest top-performing models based on leaderboard data:
// #1 Claude Sonnet 4 (57% usage), #3 Gemini 2.5 Flash (331% growth), #6 DeepSeek V3, #16 Qwen3 Coder
export const openRouterDefaultModelId = "anthropic/claude-sonnet-4"

export const openRouterDefaultModelInfo: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 200_000,
	supportsImages: true,
	supportsComputerUse: true,
	supportsPromptCache: true,
	inputPrice: 3.0,
	outputPrice: 15.0,
	cacheWritesPrice: 3.75,
	cacheReadsPrice: 0.3,
	description:
		"Claude Sonnet 4 is the #1 most popular model on OpenRouter with 57% usage share. Advanced reasoning, coding, and problem-solving with hybrid reasoning approach. Excellent for complex development tasks, agentic workflows, and multi-step processes. Supports computer use and vision capabilities. Read more at [Anthropic's blog](https://www.anthropic.com/news/claude-sonnet-4).",
}

export const OPENROUTER_DEFAULT_PROVIDER_NAME = "[default]"

export const OPEN_ROUTER_PROMPT_CACHING_MODELS = new Set([
	"anthropic/claude-3-haiku",
	"anthropic/claude-3-haiku:beta",
	"anthropic/claude-3-opus",
	"anthropic/claude-3-opus:beta",
	"anthropic/claude-3-sonnet",
	"anthropic/claude-3-sonnet:beta",
	"anthropic/claude-3.5-haiku",
	"anthropic/claude-3.5-haiku-20241022",
	"anthropic/claude-3.5-haiku-20241022:beta",
	"anthropic/claude-3.5-haiku:beta",
	"anthropic/claude-3.5-sonnet",
	"anthropic/claude-3.5-sonnet-20240620",
	"anthropic/claude-3.5-sonnet-20240620:beta",
	"anthropic/claude-3.5-sonnet:beta",
	"anthropic/claude-3.7-sonnet",
	"anthropic/claude-3.7-sonnet:beta",
	"anthropic/claude-3.7-sonnet:thinking",
	"anthropic/claude-sonnet-4",
	"anthropic/claude-opus-4",
	"google/gemini-2.5-flash-preview",
	"google/gemini-2.5-flash-preview:thinking",
	"google/gemini-2.5-flash-preview-05-20",
	"google/gemini-2.5-flash-preview-05-20:thinking",
	"google/gemini-2.5-flash",
	"google/gemini-2.5-flash-lite-preview-06-17",
	"google/gemini-2.0-flash-001",
	"google/gemini-flash-1.5",
	"google/gemini-flash-1.5-8b",
	"qwen/qwen-2.5-coder-32b-instruct",
	"deepseek/deepseek-v3",
])

// https://www.anthropic.com/news/3-5-models-and-computer-use
export const OPEN_ROUTER_COMPUTER_USE_MODELS = new Set([
	"anthropic/claude-3.5-sonnet",
	"anthropic/claude-3.5-sonnet:beta",
	"anthropic/claude-3.7-sonnet",
	"anthropic/claude-3.7-sonnet:beta",
	"anthropic/claude-3.7-sonnet:thinking",
	"anthropic/claude-sonnet-4",
	"anthropic/claude-opus-4",
])

// When we first launched these models we didn't have support for
// enabling/disabling the reasoning budget for hybrid models. Now that we
// do support this we should give users the option to enable/disable it
// whenever possible. However these particular (virtual) model ids with the
// `:thinking` suffix always require the reasoning budget to be enabled, so
// for backwards compatibility we should still require it.
// We should *not* be adding new models to this set.
export const OPEN_ROUTER_REQUIRED_REASONING_BUDGET_MODELS = new Set([
	"anthropic/claude-3.7-sonnet:thinking",
	"google/gemini-2.5-pro",
	"google/gemini-2.5-flash-preview-05-20:thinking",
])

export const OPEN_ROUTER_REASONING_BUDGET_MODELS = new Set([
	"anthropic/claude-3.7-sonnet:beta",
	"anthropic/claude-opus-4",
	"anthropic/claude-sonnet-4",
	"google/gemini-2.5-pro-preview",
	"google/gemini-2.5-pro",
	"google/gemini-2.5-flash-preview-05-20",
	"google/gemini-2.5-flash",
	"google/gemini-2.5-flash-lite-preview-06-17",
	"deepseek/deepseek-v3",
	"qwen/qwen-2.5-coder-32b-instruct",
	// Also include the models that require the reasoning budget to be enabled
	// even though `OPEN_ROUTER_REQUIRED_REASONING_BUDGET_MODELS` takes precedence.
	"anthropic/claude-3.7-sonnet:thinking",
	"google/gemini-2.5-flash-preview-05-20:thinking",
])

// Top-performing model configurations based on OpenRouter leaderboard
export const OPENROUTER_TOP_MODELS = {
	"anthropic/claude-sonnet-4": {
		ranking: 1,
		usageShare: "57%",
		specialty: "Most popular, general purpose, coding",
		description: "#1 most used model. Excellent for complex reasoning and coding tasks."
	},
	"google/gemini-2.5-flash": {
		ranking: 3,
		growth: "331%",
		specialty: "Fastest growing, multimodal, speed",
		description: "#3 fastest growing model. Great for rapid development and multimodal tasks."
	},
	"deepseek/deepseek-v3": {
		ranking: 6,
		specialty: "Best reasoning, math, complex logic",
		description: "#6 best reasoning model. Rivals GPT-4 performance at lower cost."
	},
	"qwen/qwen-2.5-coder-32b-instruct": {
		ranking: 16,
		specialty: "Code specialist, programming tasks",
		description: "#16 specialized coding model. Optimized for software development."
	}
} as const
