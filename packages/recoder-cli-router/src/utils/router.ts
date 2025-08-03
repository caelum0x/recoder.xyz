import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";
import { routerBackendClient } from "../services/backend-client";
import { ModelRouter, TaskType, RoutingRequest } from "../core/model-router";

const enc = get_encoding("cl100k_base");

// Initialize the smart model router
const smartRouter = new ModelRouter();

const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(
              JSON.stringify(contentPart.input)
            ).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

// Intelligent task type detection from prompt content
const detectTaskType = (promptContent: string, tools: Tool[] = []): TaskType => {
  const prompt = promptContent.toLowerCase();
  
  // Blockchain/Web3 detection
  if (prompt.includes('smart contract') || prompt.includes('solidity') || 
      prompt.includes('ethereum') || prompt.includes('solana') || 
      prompt.includes('web3') || prompt.includes('defi')) {
    return TaskType.SMART_CONTRACTS;
  }
  
  // Web development detection
  if (prompt.includes('react') || prompt.includes('next.js') || 
      prompt.includes('vue') || prompt.includes('angular') || 
      prompt.includes('frontend') || prompt.includes('website')) {
    return TaskType.WEB_DEVELOPMENT;
  }
  
  // Mobile development detection
  if (prompt.includes('react native') || prompt.includes('flutter') || 
      prompt.includes('ios') || prompt.includes('android') || 
      prompt.includes('mobile app')) {
    return TaskType.MOBILE_DEVELOPMENT;
  }
  
  // Backend/API detection
  if (prompt.includes('api') || prompt.includes('server') || 
      prompt.includes('backend') || prompt.includes('express') || 
      prompt.includes('fastapi') || prompt.includes('django')) {
    return TaskType.BACKEND_API;
  }
  
  // Security detection
  if (prompt.includes('security') || prompt.includes('vulnerability') || 
      prompt.includes('audit') || prompt.includes('penetration test')) {
    return TaskType.SECURITY_AUDIT;
  }
  
  // DevOps detection
  if (prompt.includes('docker') || prompt.includes('kubernetes') || 
      prompt.includes('deploy') || prompt.includes('ci/cd') || 
      prompt.includes('pipeline')) {
    return TaskType.DEPLOYMENT;
  }
  
  // Database detection
  if (prompt.includes('database') || prompt.includes('sql') || 
      prompt.includes('mongodb') || prompt.includes('postgres')) {
    return TaskType.DATABASE_DESIGN;
  }
  
  // AI/ML detection
  if (prompt.includes('machine learning') || prompt.includes('ai') || 
      prompt.includes('neural') || prompt.includes('tensorflow') || 
      prompt.includes('pytorch')) {
    return TaskType.AI_INTEGRATION;
  }
  
  // Web search tool detection
  if (tools.some((tool: any) => tool.type?.startsWith("web_search"))) {
    return TaskType.DATA_ANALYSIS;
  }
  
  // Code analysis detection
  if (prompt.includes('review') || prompt.includes('analyze') || 
      prompt.includes('explain') || prompt.includes('debug')) {
    return TaskType.CODE_REVIEW;
  }
  
  // Default to general code generation
  return TaskType.WEB_DEVELOPMENT;
};

const getUseModel = async (req: any, tokenCount: number, config: any, sessionInfo: any) => {
  // Handle comma-separated models (existing behavior)
  if (req.body.model.includes(",")) {
    return req.body.model;
  }

  try {
    // Get prompt content for smart routing
    let promptContent = '';
    if (Array.isArray(req.body.messages) && req.body.messages.length > 0) {
      const lastMessage = req.body.messages[req.body.messages.length - 1];
      if (typeof lastMessage.content === 'string') {
        promptContent = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        promptContent = lastMessage.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join(' ');
      }
    }

    // Detect task type from prompt
    const taskType = detectTaskType(promptContent, req.body.tools);
    
    // Create smart routing request
    const routingRequest: RoutingRequest = {
      prompt: promptContent,
      taskType,
      userPlan: sessionInfo?.plan || 'FREE',
      userId: sessionInfo?.userId || 'anonymous',
      priority: tokenCount > 60000 ? 'high' : 'medium',
      context: {
        complexity: tokenCount > 30000 ? 'complex' : tokenCount > 10000 ? 'medium' : 'simple'
      }
    };

    // Use smart router to select best model
    const routingResult = await smartRouter.selectModel(routingRequest);
    
    log(`Smart routing selected: ${routingResult.selectedModel.displayName}`);
    log(`Reasoning: ${routingResult.reasoning}`);
    log(`Estimated cost: $${routingResult.estimatedCost.toFixed(4)}`);
    
    // Map our model IDs to provider format
    const modelMapping = {
      'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
      'claude-3-haiku-20240307': 'claude-3-haiku-20240307',
      'llama-3.1-70b-versatile': 'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant': 'llama-3.1-8b-instant',
      'gemini-1.5-pro': 'gemini-1.5-pro',
      'gpt-4-turbo-preview': 'gpt-4-turbo-preview'
    };

    return modelMapping[routingResult.selectedModel.id as keyof typeof modelMapping] || routingResult.selectedModel.id;
    
  } catch (error: any) {
    log("Smart routing failed, falling back to legacy routing:", error.message);
    
    // Fallback to legacy routing logic
    if (tokenCount > 1000 * 60 && config.Router.longContext) {
      log("Using long context model due to token count:", tokenCount);
      return config.Router.longContext;
    }
    
    if (req.body.model?.startsWith("claude-3-5-haiku") && config.Router.background) {
      log("Using background model for ", req.body.model);
      return config.Router.background;
    }
    
    if (req.body.thinking && config.Router.think) {
      log("Using think model for ", req.body.thinking);
      return config.Router.think;
    }
    
    if (Array.isArray(req.body.tools) && 
        req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) && 
        config.Router.webSearch) {
      return config.Router.webSearch;
    }
    
    return config.Router!.default;
  }
};

export const router = async (req: any, res: any, config: any) => {
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  
  try {
    // Get prompt content for quota checking
    let promptContent = '';
    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (typeof lastMessage.content === 'string') {
        promptContent = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        promptContent = lastMessage.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join(' ');
      }
    }

    // Check backend authentication and quota
    const backendResult = await routerBackendClient.processRequest(
      promptContent,
      req.body.model || 'claude-3-5-sonnet',
      'router'
    );

    if (!backendResult.allowed) {
      log('Request blocked by quota system:', backendResult.sessionInfo);
      res.status(429).send({
        error: 'Quota exceeded',
        message: 'Request quota has been exceeded. Please upgrade your plan or wait for reset.',
        sessionInfo: backendResult.sessionInfo
      });
      return;
    }

    log('Processing request:', backendResult.sessionInfo);

    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        model = await customRouter(req, config);
      } catch (e: any) {
        log("failed to load custom router", e.message);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, config, backendResult.sessionInfo);
    }
    req.body.model = model;

    // Add session info to headers for downstream processing
    if (backendResult.sessionInfo) {
      req.headers['x-recoder-session'] = backendResult.sessionInfo;
    }

  } catch (error: any) {
    log("Error in router middleware:", error.message);
    req.body.model = config.Router!.default;
  }
  return;
};
