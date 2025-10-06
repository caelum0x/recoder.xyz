import { NextRequest } from "next/server";
import { z } from "zod";
import { getAvailableAIProviders, getProviderCapabilities } from "@/lib/ai-integration";
import { MODELS, AI_PROVIDERS } from "@/lib/constants";
import { handleApiError } from "@/lib/api-error-handler";

// Request schema for smart routing
const routingRequestSchema = z.object({
  prompt: z.string(),
  context: z.object({
    previousPrompts: z.array(z.string()).optional(),
    complexity: z.enum(["simple", "medium", "complex"]).optional(),
    language: z.string().optional(),
    framework: z.string().optional(),
    taskType: z.string().optional()
  }).optional(),
  preferences: z.object({
    speed: z.enum(["fast", "balanced", "quality"]).default("balanced"),
    cost: z.enum(["low", "medium", "high"]).default("medium"),
    provider: z.string().optional()
  }).optional()
});

// Response schema
interface SmartRoutingResult {
  recommendedModel: string;
  recommendedProvider: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    model: string;
    provider: string;
    reason: string;
    score: number;
  }>;
  capabilities: {
    realCode: boolean;
    speed: "slow" | "medium" | "fast" | "ultra-fast";
    quality: "good" | "high" | "premium";
    costEfficiency: "low" | "medium" | "high";
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, context, preferences } = routingRequestSchema.parse(body);

    // Analyze the prompt to determine optimal model
    const analysis = analyzePrompt(prompt, context);
    const routing = performSmartRouting(analysis, preferences);

    return new Response(JSON.stringify(routing), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Get available providers and their current status
export async function GET(req: NextRequest) {
  try {
    const availableProviders = getAvailableAIProviders();
    const providerCapabilities = getProviderCapabilities();
    
    const providersStatus = Object.entries(AI_PROVIDERS).map(([key, provider]) => ({
      id: key,
      name: provider.name,
      description: provider.description,
      strengths: provider.strengths,
      available: provider.available,
      models: MODELS.filter(m => m.provider === key)
    }));

    return new Response(JSON.stringify({
      availableProviders,
      providersStatus,
      capabilities: providerCapabilities,
      modelCount: MODELS.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: "Failed to get provider status"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Analyze prompt to determine characteristics
function analyzePrompt(prompt: string, context?: any): {
  complexity: "simple" | "medium" | "complex";
  taskType: string;
  domain: string;
  urgency: "low" | "medium" | "high";
  codeRequired: boolean;
  reasoningRequired: boolean;
} {
  const lowerPrompt = prompt.toLowerCase();
  
  // Determine complexity
  let complexity: "simple" | "medium" | "complex" = "medium";
  
  const complexIndicators = [
    "authentication", "database", "backend", "api", "security", 
    "deployment", "microservices", "architecture", "scalable",
    "real-time", "websocket", "payment", "integration"
  ];
  
  const simpleIndicators = [
    "button", "simple", "basic", "quick", "single", "static",
    "display", "show", "list", "form"
  ];
  
  if (complexIndicators.some(indicator => lowerPrompt.includes(indicator))) {
    complexity = "complex";
  } else if (simpleIndicators.some(indicator => lowerPrompt.includes(indicator))) {
    complexity = "simple";
  }

  // Determine task type
  let taskType = "general";
  if (lowerPrompt.includes("api") || lowerPrompt.includes("endpoint")) {
    taskType = "api-development";
  } else if (lowerPrompt.includes("ui") || lowerPrompt.includes("component") || lowerPrompt.includes("interface")) {
    taskType = "ui-development";
  } else if (lowerPrompt.includes("database") || lowerPrompt.includes("crud")) {
    taskType = "database-operations";
  } else if (lowerPrompt.includes("auth") || lowerPrompt.includes("login") || lowerPrompt.includes("security")) {
    taskType = "security";
  } else if (lowerPrompt.includes("test") || lowerPrompt.includes("debug")) {
    taskType = "testing";
  } else if (lowerPrompt.includes("deploy") || lowerPrompt.includes("production")) {
    taskType = "deployment";
  }

  // Determine domain
  let domain = "web";
  if (lowerPrompt.includes("mobile") || lowerPrompt.includes("app")) {
    domain = "mobile";
  } else if (lowerPrompt.includes("blockchain") || lowerPrompt.includes("smart contract")) {
    domain = "blockchain";
  } else if (lowerPrompt.includes("ai") || lowerPrompt.includes("machine learning")) {
    domain = "ai-ml";
  }

  // Determine urgency
  let urgency: "low" | "medium" | "high" = "medium";
  if (lowerPrompt.includes("urgent") || lowerPrompt.includes("asap") || lowerPrompt.includes("quick")) {
    urgency = "high";
  } else if (lowerPrompt.includes("eventually") || lowerPrompt.includes("when you have time")) {
    urgency = "low";
  }

  return {
    complexity,
    taskType,
    domain,
    urgency,
    codeRequired: lowerPrompt.includes("code") || lowerPrompt.includes("implement") || lowerPrompt.includes("build"),
    reasoningRequired: lowerPrompt.includes("explain") || lowerPrompt.includes("analyze") || lowerPrompt.includes("design")
  };
}

// Perform intelligent model routing
function performSmartRouting(
  analysis: ReturnType<typeof analyzePrompt>,
  preferences?: any
): SmartRoutingResult {
  
  // Define model scoring matrix
  const modelScores: { [key: string]: any } = {
    // FREE MODELS - Highest priority for cost-conscious development
    "deepseek/deepseek-r1-0528:free": {
      complexity: { simple: 0.7, medium: 0.95, complex: 1.0 },
      taskType: {
        "general": 1.0,
        "api-development": 0.95,
        "security": 0.95,
        "database-operations": 0.9,
        "ui-development": 0.85
      },
      speed: 0.7,
      quality: 1.0,
      cost: 1.0 // FREE!
    },
    "tngtech/deepseek-tng-r1t2-chimera:free": {
      complexity: { simple: 0.8, medium: 0.95, complex: 1.0 },
      taskType: {
        "general": 1.0,
        "api-development": 0.95,
        "security": 0.9,
        "database-operations": 0.9,
        "ui-development": 0.85
      },
      speed: 0.85, // 20% faster than R1
      quality: 0.95,
      cost: 1.0 // FREE!
    },
    "zhipuai/glm-4.5-air:free": {
      complexity: { simple: 0.9, medium: 1.0, complex: 0.95 },
      taskType: {
        "general": 1.0,
        "api-development": 0.95,
        "ui-development": 0.95,
        "security": 0.85,
        "database-operations": 0.9
      },
      speed: 0.9,
      quality: 0.95,
      cost: 1.0 // FREE!
    },
    "qwen/qwen3-coder-480b-a35b:free": {
      complexity: { simple: 0.95, medium: 1.0, complex: 0.9 },
      taskType: {
        "api-development": 1.0,
        "ui-development": 1.0,
        "database-operations": 0.95,
        "general": 0.9,
        "security": 0.85
      },
      speed: 0.8,
      quality: 1.0,
      cost: 1.0 // FREE!
    },
    "microsoft/mai-ds-r1:free": {
      complexity: { simple: 0.7, medium: 0.9, complex: 1.0 },
      taskType: {
        "general": 0.95,
        "security": 1.0, // Enhanced safety
        "api-development": 0.9,
        "database-operations": 0.85,
        "ui-development": 0.8
      },
      speed: 0.7,
      quality: 0.95,
      cost: 1.0 // FREE!
    },
    "deepseek/deepseek-v3-324:free": {
      complexity: { simple: 0.7, medium: 0.9, complex: 1.0 },
      taskType: {
        "general": 1.0,
        "api-development": 0.9,
        "security": 0.9,
        "database-operations": 0.95,
        "ui-development": 0.8
      },
      speed: 0.75,
      quality: 0.95,
      cost: 1.0 // FREE!
    },

    // Claude models - best for complex reasoning and security
    "claude-3-5-sonnet-20241022": {
      complexity: { simple: 0.7, medium: 0.9, complex: 1.0 },
      taskType: {
        "security": 1.0,
        "api-development": 0.9,
        "database-operations": 0.9,
        "ui-development": 0.8,
        "general": 0.9
      },
      speed: 0.6,
      quality: 1.0,
      cost: 0.4
    },
    
    // Groq models - ultra fast for APIs and prototyping
    "llama-3.1-70b-versatile": {
      complexity: { simple: 1.0, medium: 0.9, complex: 0.7 },
      taskType: { 
        "api-development": 1.0, 
        "ui-development": 0.9,
        "general": 0.8,
        "security": 0.6,
        "database-operations": 0.8
      },
      speed: 1.0,
      quality: 0.8,
      cost: 0.9
    },
    
    // DeepSeek - excellent for reasoning and complex logic
    "deepseek-ai/DeepSeek-V3": {
      complexity: { simple: 0.6, medium: 0.9, complex: 1.0 },
      taskType: { 
        "general": 0.9,
        "api-development": 0.8,
        "security": 0.9,
        "database-operations": 0.9,
        "ui-development": 0.7
      },
      speed: 0.7,
      quality: 0.95,
      cost: 0.8
    },
    
    // Qwen Coder - specialized for code generation
    "Qwen/Qwen2.5-Coder-32B-Instruct": {
      complexity: { simple: 0.9, medium: 1.0, complex: 0.8 },
      taskType: { 
        "api-development": 1.0,
        "ui-development": 1.0,
        "database-operations": 0.9,
        "general": 0.8,
        "security": 0.7
      },
      speed: 0.8,
      quality: 0.9,
      cost: 0.85
    },
    
    // Llama 3.3 - balanced performance
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": {
      complexity: { simple: 0.8, medium: 0.9, complex: 0.8 },
      taskType: { 
        "general": 0.9,
        "ui-development": 0.8,
        "api-development": 0.8,
        "security": 0.7,
        "database-operations": 0.8
      },
      speed: 0.8,
      quality: 0.85,
      cost: 0.9
    }
  };

  // Calculate scores for each model
  const modelRankings = Object.entries(modelScores).map(([modelId, scores]) => {
    let totalScore = 0;
    let factors = 0;

    // Complexity match
    const complexityScore = scores.complexity[analysis.complexity] || 0.5;
    totalScore += complexityScore * 0.3;
    factors += 0.3;

    // Task type match
    const taskTypeScore = scores.taskType[analysis.taskType] || scores.taskType["general"] || 0.5;
    totalScore += taskTypeScore * 0.3;
    factors += 0.3;

    // User preferences
    if (preferences?.speed === "fast") {
      totalScore += scores.speed * 0.4;
      factors += 0.4;
    } else if (preferences?.speed === "quality") {
      totalScore += scores.quality * 0.4;
      factors += 0.4;
    } else {
      // Balanced
      totalScore += (scores.speed * 0.2 + scores.quality * 0.2);
      factors += 0.4;
    }

    // Cost consideration
    if (preferences?.cost === "low") {
      totalScore += scores.cost * 0.2;
    } else if (preferences?.cost === "high") {
      totalScore += (1 - scores.cost) * 0.2; // Inverse for high-cost preference
    } else {
      totalScore += 0.6 * 0.2; // Neutral
    }
    factors += 0.2;

    const normalizedScore = totalScore / factors;
    
    const modelInfo = MODELS.find(m => m.value === modelId);
    
    return {
      model: modelId,
      provider: modelInfo?.provider || "unknown",
      score: normalizedScore,
      reason: generateReason(analysis, scores, modelInfo),
      capabilities: {
        realCode: true,
        speed: getSpeedRating(scores.speed),
        quality: getQualityRating(scores.quality),
        costEfficiency: getCostRating(scores.cost)
      }
    };
  }).sort((a, b) => b.score - a.score);

  const topChoice = modelRankings[0];
  const alternatives = modelRankings.slice(1, 4);

  return {
    recommendedModel: topChoice.model,
    recommendedProvider: topChoice.provider,
    confidence: Math.min(topChoice.score * 100, 95), // Cap at 95%
    reasoning: `Selected ${topChoice.model} for ${analysis.complexity} ${analysis.taskType} task. ${topChoice.reason}`,
    alternatives: alternatives.map(alt => ({
      model: alt.model,
      provider: alt.provider,
      reason: alt.reason,
      score: Math.round(alt.score * 100)
    })),
    capabilities: topChoice.capabilities
  };
}

// Helper functions
function generateReason(analysis: any, scores: any, modelInfo: any): string {
  const reasons: string[] = [];
  
  if (scores.complexity[analysis.complexity] > 0.8) {
    reasons.push(`optimized for ${analysis.complexity} tasks`);
  }
  
  if (analysis.taskType !== "general" && scores.taskType[analysis.taskType] > 0.8) {
    reasons.push(`specialized in ${analysis.taskType.replace("-", " ")}`);
  }
  
  if (scores.speed > 0.8) {
    reasons.push("provides fast responses");
  }
  
  if (scores.quality > 0.9) {
    reasons.push("delivers premium quality");
  }
  
  return reasons.length > 0 ? reasons.join(", ") : (modelInfo?.description || "balanced performance");
}

function getSpeedRating(speed: number): "slow" | "medium" | "fast" | "ultra-fast" {
  if (speed >= 0.9) return "ultra-fast";
  if (speed >= 0.7) return "fast";
  if (speed >= 0.5) return "medium";
  return "slow";
}

function getQualityRating(quality: number): "good" | "high" | "premium" {
  if (quality >= 0.9) return "premium";
  if (quality >= 0.7) return "high";
  return "good";
}

function getCostRating(cost: number): "low" | "medium" | "high" {
  if (cost >= 0.8) return "high";
  if (cost >= 0.6) return "medium";
  return "low";
}

export const runtime = "nodejs";
export const maxDuration = 30;