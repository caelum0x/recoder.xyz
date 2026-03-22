// API endpoint for CLI to access the smart router
import { FastifyRequest, FastifyReply } from 'fastify';
import { ModelRouter, TaskType, RoutingRequest, PlanType } from '../core/model-router';
import { routerBackendClient } from '../services/backend-client';
import { log } from '../utils/log';
import { executionPipeline } from '../integrations/execution-pipeline';
import { daytonaSandbox } from '../integrations/daytona-sandbox';
import { a2aBridge } from '../integrations/a2a-bridge';

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

    const pipelineStatus = executionPipeline.getStatus();

    reply.status(200);
    return {
      success: true,
      status: 'running',
      availableProviders,
      totalProviders: providers.length,
      availableModels: smartRouter.getAvailableModels().length,
      execution: {
        sandbox: pipelineStatus.sandbox,
        a2a: pipelineStatus.a2a,
      },
      version: '2.3.1',
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

// ── Sandbox Execution Endpoint ──

export interface SandboxRunBody {
  command: string;
  image?: string;
  timeoutMs?: number;
}

export const sandboxRunEndpoint = async (
  request: FastifyRequest<{ Body: SandboxRunBody }>,
  reply: FastifyReply
) => {
  try {
    const { command, image, timeoutMs } = request.body;

    if (!command || command.trim().length === 0) {
      reply.status(400);
      return { success: false, error: 'command is required' };
    }

    if (!daytonaSandbox.isConfigured()) {
      reply.status(503);
      return { success: false, error: 'Daytona sandbox not configured. Set DAYTONA_API_KEY.' };
    }

    log(`Sandbox run: ${command.slice(0, 80)}...`);
    const result = await daytonaSandbox.run(command, { image, timeoutMs });

    reply.status(200);
    return {
      success: true,
      exitCode: result.exitCode,
      output: result.output,
      error: result.error,
      sandboxId: result.sandboxId,
      executionTimeMs: result.executionTimeMs,
    };
  } catch (error: any) {
    log('Sandbox run error:', error.message);
    reply.status(500);
    return { success: false, error: error.message || 'Sandbox execution failed' };
  }
};

// ── A2A Agent Endpoints ──

export const a2aListAgentsEndpoint = async (
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const agents = await a2aBridge.listAgents();
    reply.status(200);
    return { success: true, agents };
  } catch (error: any) {
    log('A2A list agents error:', error.message);
    reply.status(500);
    return { success: false, error: error.message };
  }
};

export const a2aListTasksEndpoint = async (
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const tasks = await a2aBridge.listTasks();
    reply.status(200);
    return { success: true, tasks };
  } catch (error: any) {
    log('A2A list tasks error:', error.message);
    reply.status(500);
    return { success: false, error: error.message };
  }
};

export interface A2ASendTaskBody {
  target_agent: string;
  task: string;
  capability?: 'execute' | 'plan' | 'edit';
}

export const a2aSendTaskEndpoint = async (
  request: FastifyRequest<{ Body: A2ASendTaskBody }>,
  reply: FastifyReply
) => {
  try {
    const { target_agent, task, capability } = request.body;

    if (!target_agent || !task) {
      reply.status(400);
      return { success: false, error: 'target_agent and task are required' };
    }

    if (!a2aBridge.isConfigured()) {
      reply.status(503);
      return { success: false, error: 'A2A bridge not configured. Set RECODER_API_TOKEN.' };
    }

    log(`A2A send task to ${target_agent}: ${task.slice(0, 80)}...`);
    const result = await a2aBridge.sendTask({
      targetAgent: target_agent,
      task,
      capability,
    });

    reply.status(200);
    return { success: true, task: result };
  } catch (error: any) {
    log('A2A send task error:', error.message);
    reply.status(500);
    return { success: false, error: error.message };
  }
};

export interface A2ACreateThreadBody {
  prompt: string;
  agent_id?: string;
}

export const a2aCreateThreadEndpoint = async (
  request: FastifyRequest<{ Body: A2ACreateThreadBody }>,
  reply: FastifyReply
) => {
  try {
    const { prompt, agent_id } = request.body;

    if (!prompt) {
      reply.status(400);
      return { success: false, error: 'prompt is required' };
    }

    if (!a2aBridge.isConfigured()) {
      reply.status(503);
      return { success: false, error: 'A2A bridge not configured. Set RECODER_API_TOKEN.' };
    }

    log(`A2A create thread: ${prompt.slice(0, 80)}...`);
    const thread = await a2aBridge.createThread({ prompt, agentId: agent_id });

    reply.status(200);
    return { success: true, thread };
  } catch (error: any) {
    log('A2A create thread error:', error.message);
    reply.status(500);
    return { success: false, error: error.message };
  }
};