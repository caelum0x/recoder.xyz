/**
 * Premium AI Models Configuration for Monetization
 * These are the top-tier models we offer to subscribers using our OpenRouter API key
 */

export interface PremiumModel {
  id: string;
  name: string;
  provider: string;
  tokens: string;
  usage: string;
  tier: 'premium' | 'enterprise';
  costPerToken: number;
  maxTokens: number;
  capabilities: string[];
  bestFor: string[];
  openRouterModel: string;
}

export const PREMIUM_MODELS: PremiumModel[] = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tokens: '520B tokens',
    usage: '4%',
    tier: 'premium',
    costPerToken: 0.00003, // $3 per million tokens
    maxTokens: 200000,
    capabilities: ['reasoning', 'coding', 'analysis', 'writing'],
    bestFor: ['Complex coding', 'Advanced reasoning', 'System architecture'],
    openRouterModel: 'anthropic/claude-3.5-sonnet'
  },
  {
    id: 'gemini-2-5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    tokens: '265B tokens',
    usage: '3%',
    tier: 'premium',
    costPerToken: 0.000075, // $0.075 per million tokens
    maxTokens: 1000000,
    capabilities: ['multimodal', 'fast-inference', 'code-generation'],
    bestFor: ['Fast development', 'Multimodal tasks', 'Real-time coding'],
    openRouterModel: 'google/gemini-flash-1.5'
  },
  {
    id: 'gemini-2-0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    tokens: '264B tokens',
    usage: '3%',
    tier: 'premium',
    costPerToken: 0.000075,
    maxTokens: 1000000,
    capabilities: ['multimodal', 'fast-inference', 'code-generation'],
    bestFor: ['Rapid prototyping', 'Web development', 'API design'],
    openRouterModel: 'google/gemini-flash-1.5'
  },
  {
    id: 'deepseek-v3-0324',
    name: 'DeepSeek V3 0324',
    provider: 'deepseek',
    tokens: '156B tokens',
    usage: '12%',
    tier: 'premium',
    costPerToken: 0.00014, // $0.14 per million tokens
    maxTokens: 64000,
    capabilities: ['reasoning', 'mathematics', 'science', 'coding'],
    bestFor: ['Mathematical reasoning', 'Scientific analysis', 'Algorithm design'],
    openRouterModel: 'deepseek/deepseek-chat'
  },
  {
    id: 'qwen3-coder',
    name: 'Qwen3 Coder',
    provider: 'qwen',
    tokens: '146B tokens',
    usage: '3%',
    tier: 'premium',
    costPerToken: 0.0002,
    maxTokens: 32000,
    capabilities: ['coding', 'debugging', 'refactoring'],
    bestFor: ['Code optimization', 'Bug fixing', 'Code review'],
    openRouterModel: 'qwen/qwen-2.5-coder-32b-instruct'
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    tokens: '143B tokens',
    usage: '12%',
    tier: 'premium',
    costPerToken: 0.00003,
    maxTokens: 200000,
    capabilities: ['reasoning', 'analysis', 'writing', 'coding'],
    bestFor: ['Complex analysis', 'Technical writing', 'Architecture design'],
    openRouterModel: 'anthropic/claude-3-sonnet'
  },
  {
    id: 'deepseek-v3-0324-free',
    name: 'DeepSeek V3 0324 (free)',
    provider: 'deepseek',
    tokens: '136B tokens',
    usage: '14%',
    tier: 'premium',
    costPerToken: 0, // Free tier model
    maxTokens: 64000,
    capabilities: ['reasoning', 'mathematics', 'basic-coding'],
    bestFor: ['Learning', 'Basic tasks', 'Experimentation'],
    openRouterModel: 'deepseek/deepseek-chat'
  },
  {
    id: 'gemini-2-5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    tokens: '136B tokens',
    usage: '7%',
    tier: 'enterprise',
    costPerToken: 0.00125, // $1.25 per million tokens
    maxTokens: 2000000,
    capabilities: ['advanced-reasoning', 'multimodal', 'enterprise-features'],
    bestFor: ['Enterprise development', 'Complex systems', 'Large codebases'],
    openRouterModel: 'google/gemini-pro-1.5'
  },
  {
    id: 'r1-0528-free',
    name: 'R1 0528 (free)',
    provider: 'deepseek',
    tokens: '110B tokens',
    usage: '4%',
    tier: 'premium',
    costPerToken: 0, // Free tier model
    maxTokens: 64000,
    capabilities: ['reasoning', 'step-by-step-analysis'],
    bestFor: ['Problem solving', 'Educational use', 'Step-by-step reasoning'],
    openRouterModel: 'deepseek/deepseek-reasoner'
  },
  {
    id: 'kimi-k2',
    name: 'Kimi K2',
    provider: 'moonshotai',
    tokens: '98.5B tokens',
    usage: '1%',
    tier: 'premium',
    costPerToken: 0.0003,
    maxTokens: 200000,
    capabilities: ['long-context', 'document-analysis', 'coding'],
    bestFor: ['Long documents', 'Context analysis', 'Large codebases'],
    openRouterModel: 'moonshot/moonshot-v1-8k'
  }
];

export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'Free',
    price: 0,
    modelsAccess: ['deepseek-v3-0324-free', 'r1-0528-free'],
    requestsPerMonth: 100,
    features: ['Basic AI models', 'Limited requests', 'Community support']
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 20,
    modelsAccess: ['claude-sonnet-4', 'gemini-2-5-flash', 'gemini-2-0-flash', 'deepseek-v3-0324', 'qwen3-coder'],
    requestsPerMonth: 10000,
    features: ['Premium AI models', 'Priority support', 'Advanced features', 'API access']
  },
  BUSINESS: {
    name: 'Business',
    price: 50,
    modelsAccess: PREMIUM_MODELS.map(m => m.id),
    requestsPerMonth: 50000,
    features: ['All AI models', 'Team collaboration', 'Priority support', 'Custom integrations']
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 200,
    modelsAccess: PREMIUM_MODELS.map(m => m.id),
    requestsPerMonth: 500000,
    features: ['All AI models', 'Enterprise support', 'Custom deployment', 'SLA guarantee']
  }
};

export function getModelsByTier(tier: keyof typeof SUBSCRIPTION_TIERS): PremiumModel[] {
  const allowedModels = SUBSCRIPTION_TIERS[tier].modelsAccess;
  return PREMIUM_MODELS.filter(model => allowedModels.includes(model.id));
}

export function calculateMonthlyCost(tier: keyof typeof SUBSCRIPTION_TIERS): number {
  return SUBSCRIPTION_TIERS[tier].price;
}

export function getModelByOpenRouterName(openRouterModel: string): PremiumModel | undefined {
  return PREMIUM_MODELS.find(model => model.openRouterModel === openRouterModel);
}