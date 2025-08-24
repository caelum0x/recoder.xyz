"use strict";
/**
 * OpenRouter Premium AI Models Configuration
 * Configured for monetization with $20/month subscription model
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_SELECTION_STRATEGY = exports.OPENROUTER_MODELS = void 0;
exports.calculateModelCost = calculateModelCost;
exports.selectBestModel = selectBestModel;
// Premium models configured for our monetization
exports.OPENROUTER_MODELS = [
    {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        context_length: 200000,
        pricing: { prompt: 15, completion: 75 }, // per 1M tokens
        capabilities: ['coding', 'reasoning', 'analysis', 'writing'],
        performance_tier: 'premium'
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        context_length: 1000000,
        pricing: { prompt: 0.075, completion: 0.3 },
        capabilities: ['coding', 'multimodal', 'fast-reasoning'],
        performance_tier: 'premium'
    },
    {
        id: 'google/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        context_length: 1000000,
        pricing: { prompt: 0.075, completion: 0.3 },
        capabilities: ['coding', 'multimodal', 'fast-reasoning'],
        performance_tier: 'premium'
    },
    {
        id: 'deepseek/deepseek-v3-0324',
        name: 'DeepSeek V3 0324',
        provider: 'deepseek',
        context_length: 128000,
        pricing: { prompt: 0.27, completion: 1.1 },
        capabilities: ['coding', 'reasoning', 'math'],
        performance_tier: 'premium'
    },
    {
        id: 'qwen/qwen3-coder',
        name: 'Qwen3 Coder',
        provider: 'qwen',
        context_length: 32768,
        pricing: { prompt: 0.2, completion: 1.0 },
        capabilities: ['coding', 'programming', 'debugging'],
        performance_tier: 'premium'
    },
    {
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        context_length: 200000,
        pricing: { prompt: 3, completion: 15 },
        capabilities: ['coding', 'reasoning', 'analysis'],
        performance_tier: 'premium'
    },
    {
        id: 'deepseek/deepseek-v3-0324-free',
        name: 'DeepSeek V3 0324 (Free)',
        provider: 'deepseek',
        context_length: 128000,
        pricing: { prompt: 0, completion: 0 },
        capabilities: ['coding', 'reasoning', 'math'],
        performance_tier: 'free'
    },
    {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        context_length: 2000000,
        pricing: { prompt: 1.25, completion: 5.0 },
        capabilities: ['coding', 'multimodal', 'advanced-reasoning'],
        performance_tier: 'premium'
    },
    {
        id: 'deepseek/r1-0528-free',
        name: 'R1 0528 (Free)',
        provider: 'deepseek',
        context_length: 64000,
        pricing: { prompt: 0, completion: 0 },
        capabilities: ['reasoning', 'problem-solving'],
        performance_tier: 'free'
    },
    {
        id: 'moonshotai/kimi-k2',
        name: 'Kimi K2',
        provider: 'moonshotai',
        context_length: 200000,
        pricing: { prompt: 0.25, completion: 1.0 },
        capabilities: ['coding', 'multilingual', 'reasoning'],
        performance_tier: 'standard'
    }
];
// Model selection strategy based on subscription tier
exports.MODEL_SELECTION_STRATEGY = {
    free: ['deepseek/deepseek-v3-0324-free', 'deepseek/r1-0528-free'],
    pro: exports.OPENROUTER_MODELS.filter(m => m.performance_tier !== 'free').map(m => m.id),
    enterprise: exports.OPENROUTER_MODELS.map(m => m.id)
};
// Cost calculation for monetization
function calculateModelCost(modelId, inputTokens, outputTokens) {
    const model = exports.OPENROUTER_MODELS.find(m => m.id === modelId);
    if (!model)
        return 0;
    const inputCost = (inputTokens / 1000000) * model.pricing.prompt;
    const outputCost = (outputTokens / 1000000) * model.pricing.completion;
    return inputCost + outputCost;
}
// Smart model selection based on task type
function selectBestModel(taskType, tier) {
    const availableModels = exports.OPENROUTER_MODELS.filter(m => {
        const tierAllowed = tier === 'free' ? m.performance_tier === 'free' :
            tier === 'pro' ? m.performance_tier !== 'free' :
                true; // enterprise gets all
        return tierAllowed && m.capabilities.includes(taskType);
    });
    // Prioritize by performance and cost efficiency
    if (taskType === 'coding') {
        return availableModels.find(m => m.name.includes('Coder'))?.id ||
            availableModels.find(m => m.name.includes('Claude'))?.id ||
            availableModels[0]?.id;
    }
    if (taskType === 'reasoning') {
        return availableModels.find(m => m.name.includes('Claude'))?.id ||
            availableModels.find(m => m.name.includes('DeepSeek'))?.id ||
            availableModels[0]?.id;
    }
    // Default to most cost-efficient premium model
    return availableModels.sort((a, b) => a.pricing.prompt - b.pricing.prompt)[0]?.id;
}
