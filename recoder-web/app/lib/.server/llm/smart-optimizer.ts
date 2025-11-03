/**
 * Smart Optimizer
 * Combines template matching + multi-model routing for maximum cost savings
 * Strategy: Template-first (real starters) → Model routing → Standard
 */

import { matchTemplate, isTemplateSuitable, getTemplatePrompt, type TemplateMatch } from './template-matcher';
import { routeToModel, type TaskAnalysis, type ModelConfig, calculateSavings } from './model-router';
import { getSystemPrompt } from './prompts';
import {
  loadStarterTemplates,
  matchUserRequestToTemplate,
  generateTemplateCustomizationPrompt
} from '../templates/starter-integration';

export interface OptimizationResult {
  strategy: 'template-based' | 'model-routed' | 'standard';
  selectedModel: ModelConfig | null;
  templateMatch: TemplateMatch | null;
  systemPrompt: string;
  estimatedCost: number;
  estimatedSavings: {
    amount: number;
    percent: number;
  };
  rationale: string;
  metadata: {
    taskAnalysis?: TaskAnalysis;
    originalMessage: string;
    conversationLength: number;
  };
}

/**
 * Main optimization function
 * Analyzes request and returns optimal strategy + model
 */
export function optimizeRequest(
  userMessage: string,
  conversationLength: number = 1
): OptimizationResult {
  const lowerMessage = userMessage.toLowerCase();

  // STEP 1: Check REAL starter templates first (highest savings: 80-95%)
  try {
    const starterTemplates = loadStarterTemplates();
    const starterMatch = matchUserRequestToTemplate(userMessage, starterTemplates);

    if (starterMatch && starterMatch.confidence >= 20) {  // Lowered from 25 to catch more templates
      // Found a real starter template match!
      const templatePrompt = generateTemplateCustomizationPrompt(
        starterMatch.template,
        userMessage
      );

      // For template-based, use fastest free model (template does heavy lifting)
      const modelRouting = routeToModel(userMessage, conversationLength);

      // Override with fastest free model for template customization
      const geminiFlashLite = {
        id: 'gemini-2.5-flash-lite',
        provider: 'google',
        name: 'Gemini 2.5 Flash Lite',
        costPerMToken: { input: 0, output: 0 },
        capabilities: {
          coding: 7,
          reasoning: 7,
          speed: 10,
          contextWindow: 100000
        },
        isFree: true
      };

      const savings = calculateSavings(geminiFlashLite, modelRouting.analysis.estimatedTokens);

      // Convert starter template to TemplateMatch format
      const templateMatch: TemplateMatch = {
        template: {
          id: starterMatch.template.id,
          name: starterMatch.template.name,
          description: starterMatch.template.description,
          keywords: starterMatch.template.keywords,
          framework: starterMatch.template.framework as any,
          complexity: 'moderate' as any,
          features: starterMatch.template.files.slice(0, 5), // Top 5 files as features
          estimatedFiles: starterMatch.template.files.length,
          estimatedLines: starterMatch.template.files.length * 50, // Rough estimate
          setupInstructions: `Based on ${starterMatch.template.name} starter template from /starters/${starterMatch.template.id}`
        },
        confidence: starterMatch.confidence,
        reasoning: starterMatch.reasoning
      };

      console.log(`🎯 REAL TEMPLATE MATCH: ${starterMatch.template.name} (${starterMatch.confidence}% confidence, ${starterMatch.template.files.length} files)`);

      return {
        strategy: 'template-based',
        selectedModel: geminiFlashLite,
        templateMatch,
        systemPrompt: templatePrompt,
        estimatedCost: 0,
        estimatedSavings: {
          amount: savings.savings,
          percent: 85 // Real templates provide 80-95% savings
        },
        rationale: `Template-based: Using real ${starterMatch.template.name} starter (${starterMatch.template.files.length} files). ${starterMatch.reasoning}. Savings: 85% avg`,
        metadata: {
          taskAnalysis: modelRouting.analysis,
          originalMessage: userMessage,
          conversationLength
        }
      };
    }
  } catch (error) {
    console.error('Failed to load starter templates:', error);
    // Fall through to legacy template matching
  }

  // STEP 2: Try legacy template matcher as fallback
  if (isTemplateSuitable(userMessage)) {
    const templateMatch = matchTemplate(userMessage);

    if (templateMatch && templateMatch.confidence >= 50) {
      const templatePrompt = getTemplatePrompt(templateMatch.template, userMessage);
      const modelRouting = routeToModel(userMessage, conversationLength);

      const geminiFlashLite = {
        id: 'gemini-2.5-flash-lite',
        provider: 'google',
        name: 'Gemini 2.5 Flash Lite',
        costPerMToken: { input: 0, output: 0 },
        capabilities: { coding: 7, reasoning: 7, speed: 10, contextWindow: 100000 },
        isFree: true
      };

      const savings = calculateSavings(geminiFlashLite, modelRouting.analysis.estimatedTokens);

      return {
        strategy: 'template-based',
        selectedModel: geminiFlashLite,
        templateMatch,
        systemPrompt: templatePrompt,
        estimatedCost: 0,
        estimatedSavings: { amount: savings.savings, percent: savings.savingsPercent },
        rationale: `Legacy template: ${templateMatch.template.name}. Savings: ${savings.savingsPercent.toFixed(1)}%`,
        metadata: { taskAnalysis: modelRouting.analysis, originalMessage: userMessage, conversationLength }
      };
    }
  }

  // STEP 2: Model routing optimization (medium savings)
  const modelRouting = routeToModel(userMessage, conversationLength);
  const savings = calculateSavings(
    modelRouting.model,
    modelRouting.analysis.estimatedTokens
  );

  // Use standard system prompt but with optimized model
  const systemPrompt = getSystemPrompt();

  return {
    strategy: 'model-routed',
    selectedModel: modelRouting.model,
    templateMatch: null,
    systemPrompt,
    estimatedCost: modelRouting.estimatedCost,
    estimatedSavings: {
      amount: savings.savings,
      percent: savings.savingsPercent
    },
    rationale: `Model routing: ${modelRouting.rationale}. Savings: ${savings.savingsPercent.toFixed(1)}%`,
    metadata: {
      taskAnalysis: modelRouting.analysis,
      originalMessage: userMessage,
      conversationLength
    }
  };
}

/**
 * Batch optimization for multiple requests
 */
export function optimizeBatch(requests: { message: string; conversationLength: number }[]): {
  results: OptimizationResult[];
  totalSavings: number;
  totalSavingsPercent: number;
} {
  const results = requests.map(req => optimizeRequest(req.message, req.conversationLength));

  const totalSavings = results.reduce((sum, r) => sum + r.estimatedSavings.amount, 0);
  const avgSavingsPercent = results.reduce((sum, r) => sum + r.estimatedSavings.percent, 0) / results.length;

  return {
    results,
    totalSavings,
    totalSavingsPercent: avgSavingsPercent
  };
}

/**
 * Get optimization statistics
 */
export interface OptimizationStats {
  templateBasedCount: number;
  modelRoutedCount: number;
  standardCount: number;
  totalRequests: number;
  averageSavingsPercent: number;
  totalCostSavings: number;
  freeModelUsagePercent: number;
}

export function getOptimizationStats(results: OptimizationResult[]): OptimizationStats {
  const templateBased = results.filter(r => r.strategy === 'template-based');
  const modelRouted = results.filter(r => r.strategy === 'model-routed');
  const standard = results.filter(r => r.strategy === 'standard');

  const totalSavings = results.reduce((sum, r) => sum + r.estimatedSavings.amount, 0);
  const avgSavingsPercent = results.reduce((sum, r) => sum + r.estimatedSavings.percent, 0) / results.length;

  const freeModelUsage = results.filter(r => r.selectedModel?.isFree).length;
  const freeModelUsagePercent = (freeModelUsage / results.length) * 100;

  return {
    templateBasedCount: templateBased.length,
    modelRoutedCount: modelRouted.length,
    standardCount: standard.length,
    totalRequests: results.length,
    averageSavingsPercent: avgSavingsPercent,
    totalCostSavings: totalSavings,
    freeModelUsagePercent
  };
}

/**
 * Suggest best strategy for a given request type
 */
export function suggestStrategy(userMessage: string): {
  suggestedStrategy: 'template-based' | 'model-routed' | 'standard';
  reasoning: string;
  expectedSavings: string;
} {
  const optimization = optimizeRequest(userMessage);

  let expectedSavings = '';
  if (optimization.strategy === 'template-based') {
    expectedSavings = '80-95% cost reduction (template + free model)';
  } else if (optimization.strategy === 'model-routed') {
    expectedSavings = `${optimization.estimatedSavings.percent.toFixed(0)}% cost reduction (optimized model)`;
  } else {
    expectedSavings = 'Standard pricing (premium model required)';
  }

  return {
    suggestedStrategy: optimization.strategy,
    reasoning: optimization.rationale,
    expectedSavings
  };
}

/**
 * Get recommended model for manual override
 */
export function getRecommendedModel(
  userMessage: string,
  conversationLength: number = 1,
  preferFree: boolean = true
): ModelConfig {
  const optimization = optimizeRequest(userMessage, conversationLength);

  if (optimization.selectedModel) {
    return optimization.selectedModel;
  }

  // Fallback to model routing
  const routing = routeToModel(userMessage, conversationLength);
  return routing.model;
}
