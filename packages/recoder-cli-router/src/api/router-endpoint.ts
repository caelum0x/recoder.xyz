// API endpoint for CLI to access the smart router
import { FastifyRequest, FastifyReply } from 'fastify';
import { ModelRouter, TaskType, RoutingRequest, PlanType } from '../core/model-router';
import { routerBackendClient } from '../services/backend-client';
import { log } from '../utils/log';

const smartRouter = new ModelRouter();

export interface RouterRequestBody {
  prompt: string;
  taskType?: TaskType;
  context?: {
    language?: string;
    framework?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    fileTypes?: string[];
  };
  priority?: 'low' | 'medium' | 'high';
  maxCost?: number;
  preferredProviders?: string[];
}

export interface RouterResponse {
  success: boolean;
  selectedModel?: {
    id: string;
    name: string;
    displayName: string;
    provider: string;
  };
  provider?: {
    id: string;
    name: string;
    endpoint: string;
  };
  reasoning?: string;
  estimatedCost?: number;
  estimatedTime?: number;
  confidence?: number;
  fallbackModels?: any[];
  sessionInfo?: any;
  error?: string;
}

// Detect task type from prompt if not provided
const detectTaskType = (prompt: string): TaskType => {
  const promptLower = prompt.toLowerCase();
  
  if (promptLower.includes('smart contract') || promptLower.includes('solidity') || 
      promptLower.includes('ethereum') || promptLower.includes('solana')) {
    return TaskType.SMART_CONTRACTS;
  }
  
  if (promptLower.includes('react') || promptLower.includes('next.js') || 
      promptLower.includes('vue') || promptLower.includes('frontend')) {
    return TaskType.WEB_DEVELOPMENT;
  }
  
  if (promptLower.includes('api') || promptLower.includes('server') || 
      promptLower.includes('backend')) {
    return TaskType.BACKEND_API;
  }
  
  if (promptLower.includes('mobile') || promptLower.includes('react native') || 
      promptLower.includes('flutter')) {
    return TaskType.MOBILE_DEVELOPMENT;
  }
  
  if (promptLower.includes('security') || promptLower.includes('audit')) {
    return TaskType.SECURITY_AUDIT;
  }
  
  if (promptLower.includes('docker') || promptLower.includes('deploy') || 
      promptLower.includes('kubernetes')) {
    return TaskType.DEPLOYMENT;
  }
  
  return TaskType.WEB_DEVELOPMENT; // default
};

export const routerEndpoint = async (
  request: FastifyRequest<{ Body: RouterRequestBody }>,
  reply: FastifyReply
): Promise<RouterResponse> => {
  try {
    const { prompt, taskType, context, priority, maxCost, preferredProviders } = request.body;

    if (!prompt || prompt.trim().length === 0) {
      reply.status(400);
      return {
        success: false,
        error: 'Prompt is required'
      };
    }

    // Check authentication and quota with backend
    const backendResult = await routerBackendClient.processRequest(
      prompt,
      'auto-select', // Let smart router decide
      'router'
    );

    if (!backendResult.allowed) {
      reply.status(429);
      return {
        success: false,
        error: 'Quota exceeded. Please upgrade your plan or wait for reset.',
        sessionInfo: backendResult.sessionInfo
      };
    }

    // Detect or use provided task type
    const detectedTaskType = taskType || detectTaskType(prompt);

    // Create routing request
    const routingRequest: RoutingRequest = {
      prompt,
      taskType: detectedTaskType,
      userPlan: (typeof backendResult.sessionInfo === 'object' && backendResult.sessionInfo?.plan?.toUpperCase() as PlanType) || 'FREE',
      userId: (typeof backendResult.sessionInfo === 'object' && backendResult.sessionInfo?.userId) || 'anonymous',
      priority: priority || 'medium',
      maxCost,
      preferredProviders,
      context
    };

    log(`Processing smart routing request for task: ${detectedTaskType}`);
    log(`User plan: ${routingRequest.userPlan}, Priority: ${routingRequest.priority}`);

    // Use smart router to select best model
    const routingResult = await smartRouter.selectModel(routingRequest);

    log(`Smart router selected: ${routingResult.selectedModel.displayName}`);
    log(`Provider: ${routingResult.provider.name}`);
    log(`Reasoning: ${routingResult.reasoning}`);
    log(`Estimated cost: $${routingResult.estimatedCost.toFixed(4)}`);

    reply.status(200);
    return {
      success: true,
      selectedModel: {
        id: routingResult.selectedModel.id,
        name: routingResult.selectedModel.name,
        displayName: routingResult.selectedModel.displayName,
        provider: routingResult.selectedModel.provider
      },
      provider: {
        id: routingResult.provider.id,
        name: routingResult.provider.name,
        endpoint: routingResult.provider.endpoint
      },
      reasoning: routingResult.reasoning,
      estimatedCost: routingResult.estimatedCost,
      estimatedTime: routingResult.estimatedTime,
      confidence: routingResult.confidence,
      fallbackModels: routingResult.fallbackModels.map(model => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        provider: model.provider
      })),
      sessionInfo: backendResult.sessionInfo
    };

  } catch (error: any) {
    log('Error in router endpoint:', error.message);
    
    reply.status(500);
    return {
      success: false,
      error: error.message || 'Internal server error'
    };
  }
};

// Get available models endpoint
export const getAvailableModels = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const models = smartRouter.getAvailableModels();
    
    reply.status(200);
    return {
      success: true,
      models: models.map(model => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        provider: model.provider,
        capabilities: model.capabilities,
        strengths: model.strengths,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        multimodal: model.multimodal,
        qualityScore: model.qualityScore
      }))
    };
  } catch (error: any) {
    log('Error getting available models:', error.message);
    
    reply.status(500);
    return {
      success: false,
      error: error.message || 'Internal server error'
    };
  }
};

// Get router status endpoint
export const getRouterStatus = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const providers = ['anthropic', 'groq', 'google', 'openai'];
    const availableProviders = providers.filter(provider => {
      const providerInstance = smartRouter.getProvider(provider);
      return providerInstance && providerInstance.apiKey;
    });

    reply.status(200);
    return {
      success: true,
      status: 'running',
      availableProviders,
      totalProviders: providers.length,
      availableModels: smartRouter.getAvailableModels().length,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    log('Error getting router status:', error.message);
    
    reply.status(500);
    return {
      success: false,
      error: error.message || 'Internal server error'
    };
  }
};