"use strict";
/**
 * OpenRouter AI Service - Commercial AI Integration
 * Centralized API key management for premium monetization
 * Users pay $20/month subscription, we handle all AI costs via OpenRouter
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterService = exports.OpenRouterService = void 0;
const logger_1 = require("../utils/logger");
class OpenRouterService {
    constructor() {
        this.usageTracker = new Map();
        this.rateLimiter = new Map();
        // Best coding models from OpenRouter (from the documentation)
        this.BEST_CODING_MODELS = [
            {
                id: 'anthropic/claude-sonnet-4',
                name: 'Claude Sonnet 4',
                provider: 'anthropic',
                maxTokens: 200000,
                pricing: { prompt: 15, completion: 75 },
                capabilities: ['code-generation', 'analysis', 'refactoring', 'debugging'],
                bestFor: ['complex-logic', 'architecture', 'enterprise-code', 'security-review']
            },
            {
                id: 'google/gemini-2.0-flash',
                name: 'Gemini 2.0 Flash',
                provider: 'google',
                maxTokens: 1048576,
                pricing: { prompt: 0.075, completion: 0.3 },
                capabilities: ['fast-generation', 'multimodal', 'large-context'],
                bestFor: ['rapid-prototyping', 'large-codebases', 'documentation']
            },
            {
                id: 'google/gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                provider: 'google',
                maxTokens: 1048576,
                pricing: { prompt: 0.15, completion: 0.6 },
                capabilities: ['advanced-reasoning', 'code-optimization', 'testing'],
                bestFor: ['production-code', 'optimization', 'complex-algorithms']
            },
            {
                id: 'deepseek/deepseek-v3-0324',
                name: 'DeepSeek V3',
                provider: 'deepseek',
                maxTokens: 64000,
                pricing: { prompt: 0.27, completion: 1.1 },
                capabilities: ['code-understanding', 'refactoring', 'bug-fixing'],
                bestFor: ['code-review', 'refactoring', 'maintenance']
            },
            {
                id: 'qwen/qwen3-coder',
                name: 'Qwen3 Coder',
                provider: 'qwen',
                maxTokens: 32768,
                pricing: { prompt: 0.1, completion: 0.1 },
                capabilities: ['specialized-coding', 'multiple-languages'],
                bestFor: ['specific-frameworks', 'language-expertise', 'cost-effective']
            },
            {
                id: 'anthropic/claude-3.7-sonnet',
                name: 'Claude 3.7 Sonnet',
                provider: 'anthropic',
                maxTokens: 200000,
                pricing: { prompt: 3, completion: 15 },
                capabilities: ['balanced-performance', 'reasoning', 'code-analysis'],
                bestFor: ['general-purpose', 'balanced-cost', 'reliable-output']
            }
        ];
        this.config = this.loadConfig();
        this.initializeUsageTracking();
    }
    loadConfig() {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
        return {
            apiKey,
            baseUrl: 'https://openrouter.ai/api/v1',
            defaultModel: 'anthropic/claude-sonnet-4',
            fallbackModels: [
                'google/gemini-2.5-flash',
                'deepseek/deepseek-v3-0324',
                'anthropic/claude-3.7-sonnet'
            ],
            maxRetries: 3,
            timeout: 60000,
            rateLimiting: {
                requestsPerMinute: parseInt(process.env.OPENROUTER_RPM || '60'),
                tokensPerMinute: parseInt(process.env.OPENROUTER_TPM || '50000')
            }
        };
    }
    initializeUsageTracking() {
        // Initialize usage tracking with persistence
        const today = new Date().toISOString().split('T')[0];
        if (!this.usageTracker.has(today)) {
            this.usageTracker.set(today, {
                requests: 0,
                tokens: 0,
                cost: 0,
                errors: 0,
                models: new Map()
            });
        }
    }
    /**
     * Check if API key is configured
     */
    isConfigured() {
        return Boolean(this.config.apiKey && this.config.apiKey.length > 0);
    }
    /**
     * Get available models with their capabilities
     */
    getAvailableModels() {
        return this.BEST_CODING_MODELS;
    }
    /**
     * Select the best model for a given task
     */
    selectBestModel(projectType, complexity = 'medium') {
        const modelPreferences = {
            'web': ['google/gemini-2.5-flash', 'anthropic/claude-3.7-sonnet', 'qwen/qwen3-coder'],
            'blockchain': ['anthropic/claude-sonnet-4', 'deepseek/deepseek-v3-0324', 'google/gemini-2.5-flash'],
            'backend': ['anthropic/claude-3.7-sonnet', 'google/gemini-2.0-flash', 'deepseek/deepseek-v3-0324'],
            'mobile': ['google/gemini-2.5-flash', 'qwen/qwen3-coder', 'anthropic/claude-3.7-sonnet'],
            'ai': ['anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'deepseek/deepseek-v3-0324'],
            'payments': ['anthropic/claude-sonnet-4', 'anthropic/claude-3.7-sonnet', 'deepseek/deepseek-v3-0324']
        };
        // Adjust for complexity
        if (complexity === 'high') {
            return 'anthropic/claude-sonnet-4'; // Best for complex tasks
        }
        else if (complexity === 'low') {
            return 'google/gemini-2.0-flash'; // Fast and cost-effective
        }
        const preferredModels = modelPreferences[projectType] || modelPreferences['web'];
        return preferredModels[0];
    }
    /**
     * Check rate limiting
     */
    checkRateLimit(userId) {
        const key = userId || 'default';
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        if (!this.rateLimiter.has(key)) {
            this.rateLimiter.set(key, { count: 0, resetTime: now + windowMs });
        }
        const limiter = this.rateLimiter.get(key);
        if (now > limiter.resetTime) {
            limiter.count = 0;
            limiter.resetTime = now + windowMs;
        }
        if (limiter.count >= this.config.rateLimiting.requestsPerMinute) {
            return { allowed: false, waitTime: limiter.resetTime - now };
        }
        limiter.count++;
        return { allowed: true };
    }
    /**
     * Generate code using OpenRouter
     */
    async generateCode(prompt, options = {}) {
        const startTime = Date.now();
        // Check configuration
        if (!this.isConfigured()) {
            return {
                success: false,
                content: '',
                model: 'none',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
                performance: { latency: 0, throughput: 0 },
                error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY environment variable.'
            };
        }
        // Check rate limiting
        const rateLimitResult = this.checkRateLimit(options.userIdForTracking);
        if (!rateLimitResult.allowed) {
            return {
                success: false,
                content: '',
                model: 'rate-limited',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
                performance: { latency: Date.now() - startTime, throughput: 0 },
                error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.waitTime || 0) / 1000)} seconds.`
            };
        }
        // Select model
        const selectedModel = options.model || this.selectBestModel(options.projectType || 'web', this.determineComplexity(prompt));
        const models = [selectedModel, ...this.config.fallbackModels.filter(m => m !== selectedModel)];
        let lastError = '';
        for (let i = 0; i < models.length; i++) {
            const currentModel = models[i];
            try {
                const result = await this.makeRequest(currentModel, prompt, options, startTime);
                if (result.success) {
                    // Track usage
                    this.trackUsage(currentModel, result.usage, options.userIdForTracking);
                    return {
                        ...result,
                        fallbackUsed: i > 0
                    };
                }
                lastError = result.error || 'Unknown error';
                logger_1.logger.warn(`Model ${currentModel} failed: ${lastError}`);
            }
            catch (error) {
                lastError = error.message;
                logger_1.logger.warn(`Request to ${currentModel} failed: ${lastError}`);
            }
        }
        // All models failed
        this.trackUsage('failed', { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }, options.userIdForTracking);
        return {
            success: false,
            content: '',
            model: selectedModel,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
            performance: { latency: Date.now() - startTime, throughput: 0 },
            error: `All models failed. Last error: ${lastError}`
        };
    }
    async makeRequest(model, prompt, options, startTime) {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.SITE_URL || 'https://recoder.xyz',
                'X-Title': 'Recoder Production Engine'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert software developer. Generate production-ready, secure, and well-documented code. Always include proper error handling, validation, and follow best practices.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: options.maxTokens || 8000,
                temperature: options.temperature || 0.3,
                top_p: options.topP || 1,
                frequency_penalty: options.frequencyPenalty || 0,
                presence_penalty: options.presencePenalty || 0,
                response_format: options.responseFormat,
                stream: false // We'll handle streaming separately if needed
            }),
            signal: AbortSignal.timeout(this.config.timeout)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        const endTime = Date.now();
        const latency = endTime - startTime;
        if (data.error) {
            throw new Error(data.error.message || 'OpenRouter API error');
        }
        const content = data.choices?.[0]?.message?.content || '';
        const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        // Calculate cost based on model pricing
        const modelInfo = this.BEST_CODING_MODELS.find(m => m.id === model);
        const cost = modelInfo ?
            ((usage.prompt_tokens / 1000) * modelInfo.pricing.prompt) +
                ((usage.completion_tokens / 1000) * modelInfo.pricing.completion) : 0;
        const throughput = content.length > 0 ? content.length / (latency / 1000) : 0;
        return {
            success: true,
            content,
            model: data.model || model,
            usage: {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
                cost
            },
            performance: {
                latency,
                throughput
            }
        };
    }
    determineComplexity(prompt) {
        const complexityIndicators = {
            high: [
                'blockchain', 'smart contract', 'defi', 'security', 'encryption',
                'machine learning', 'ai model', 'distributed system', 'microservices',
                'real-time', 'payment processing', 'financial', 'enterprise'
            ],
            medium: [
                'full-stack', 'database', 'api', 'authentication', 'testing',
                'deployment', 'monitoring', 'integration', 'framework'
            ]
        };
        const lowerPrompt = prompt.toLowerCase();
        for (const indicator of complexityIndicators.high) {
            if (lowerPrompt.includes(indicator))
                return 'high';
        }
        for (const indicator of complexityIndicators.medium) {
            if (lowerPrompt.includes(indicator))
                return 'medium';
        }
        return 'low';
    }
    trackUsage(model, usage, userId) {
        const today = new Date().toISOString().split('T')[0];
        const dayData = this.usageTracker.get(today);
        if (dayData) {
            dayData.requests++;
            dayData.tokens += usage.totalTokens;
            dayData.cost += usage.cost;
            if (model === 'failed') {
                dayData.errors++;
            }
            else {
                if (!dayData.models.has(model)) {
                    dayData.models.set(model, { usage: 0, cost: 0 });
                }
                const modelData = dayData.models.get(model);
                modelData.usage += usage.totalTokens;
                modelData.cost += usage.cost;
            }
        }
    }
    /**
     * Get usage metrics for analytics and billing
     */
    getUsageMetrics(days = 30) {
        const metrics = {
            totalRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            averageLatency: 0,
            errorRate: 0,
            topModels: [],
            dailyUsage: []
        };
        const modelUsage = new Map();
        let totalLatency = 0;
        let latencyCount = 0;
        // Aggregate data from the last N days
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const dayData = this.usageTracker.get(dateKey);
            if (dayData) {
                metrics.totalRequests += dayData.requests;
                metrics.totalTokens += dayData.tokens;
                metrics.totalCost += dayData.cost;
                metrics.dailyUsage.push({
                    date: dateKey,
                    requests: dayData.requests,
                    cost: dayData.cost
                });
                // Aggregate model usage
                for (const [model, data] of dayData.models) {
                    if (!modelUsage.has(model)) {
                        modelUsage.set(model, { usage: 0, cost: 0 });
                    }
                    const existing = modelUsage.get(model);
                    existing.usage += data.usage;
                    existing.cost += data.cost;
                }
            }
        }
        // Calculate error rate
        const totalErrors = Array.from(this.usageTracker.values())
            .reduce((sum, day) => sum + (day.errors || 0), 0);
        metrics.errorRate = metrics.totalRequests > 0 ?
            (totalErrors / metrics.totalRequests) * 100 : 0;
        // Top models
        metrics.topModels = Array.from(modelUsage.entries())
            .map(([model, data]) => ({ model, usage: data.usage, cost: data.cost }))
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 10);
        return metrics;
    }
    /**
     * Health check for OpenRouter service
     */
    async healthCheck() {
        try {
            if (!this.isConfigured()) {
                return {
                    status: 'unhealthy',
                    apiKeyValid: false,
                    modelsAvailable: 0,
                    averageLatency: 0,
                    errorRate: 100
                };
            }
            const startTime = Date.now();
            const testResult = await this.generateCode('Generate a simple hello world function in JavaScript', { maxTokens: 100, projectType: 'web' });
            const latency = Date.now() - startTime;
            const metrics = this.getUsageMetrics(7); // Last 7 days
            return {
                status: testResult.success ? 'healthy' : 'degraded',
                apiKeyValid: testResult.success,
                modelsAvailable: this.BEST_CODING_MODELS.length,
                averageLatency: latency,
                errorRate: metrics.errorRate
            };
        }
        catch (error) {
            logger_1.logger.error('OpenRouter health check failed:', error);
            return {
                status: 'unhealthy',
                apiKeyValid: false,
                modelsAvailable: 0,
                averageLatency: 0,
                errorRate: 100
            };
        }
    }
    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        logger_1.logger.info('OpenRouter configuration updated');
    }
    /**
     * Get current configuration (without sensitive data)
     */
    getConfig() {
        const { apiKey, ...safeConfig } = this.config;
        return safeConfig;
    }
}
exports.OpenRouterService = OpenRouterService;
// Export singleton instance
exports.openRouterService = new OpenRouterService();
