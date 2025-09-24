'use client';

import { useState } from 'react';
import { usePaymentStore } from '@/lib/payment-service';
import { useSmartUpgrade } from '@/components/smart-upgrade/SmartUpgradeProvider';
import { toast } from 'sonner';

interface AIUsageParams {
  model: string;
  inputTokens: number;
  outputTokens: number;
  feature?: string;
  metadata?: any;
}

interface AITrackingResult {
  cost: number;
  remainingTokens: number;
  remainingCost: number;
  warnings: string[];
}

export function useAITracking() {
  const [isTracking, setIsTracking] = useState(false);
  const { trackUsage, fetchUsageStats } = usePaymentStore();
  const { checkAndPromptUpgrade } = useSmartUpgrade();

  const trackAIUsage = async (params: AIUsageParams): Promise<AITrackingResult | null> => {
    try {
      setIsTracking(true);
      
      const result = await trackUsage(
        params.model,
        params.inputTokens,
        params.outputTokens,
        params.feature,
        params.metadata
      ) as AITrackingResult | void;

      // Show warnings if any
      if (result && result.warnings && result.warnings.length > 0) {
        result.warnings.forEach(warning => {
          toast.warning(warning, {
            duration: 5000,
          });
        });
      }

      // Check if upgrade should be prompted based on current usage
      const estimatedCost = (params.inputTokens + params.outputTokens) * 0.00001; // Rough estimate
      await checkAndPromptUpgrade({
        tokens: params.inputTokens + params.outputTokens,
        cost: estimatedCost,
        feature: params.feature
      });

      // Show warnings from backend
      if (result && result.remainingTokens < 10000) {
        toast.warning('You are running low on tokens.', {
          duration: 5000,
        });
      }

      if (result && result.remainingCost < 5) {
        toast.warning('You are approaching your cost limit.', {
          duration: 5000,
        });
      }

      return result ?? null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to track AI usage';
      
      // Handle specific limit errors
      if (errorMessage.includes('limit exceeded')) {
        toast.error(errorMessage, {
          duration: 10000,
          action: {
            label: 'Upgrade Plan',
            onClick: () => window.location.href = '/subscription'
          }
        });
      } else {
        toast.error('Failed to track AI usage: ' + errorMessage);
      }
      
      throw error;
    } finally {
      setIsTracking(false);
    }
  };

  const estimateTokens = (text: string): number => {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  };

  const trackTextGeneration = async (
    model: string,
    inputText: string,
    outputText: string,
    feature: string = 'text_generation',
    metadata?: any
  ) => {
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    
    return trackAIUsage({
      model,
      inputTokens,
      outputTokens,
      feature,
      metadata: {
        inputLength: inputText.length,
        outputLength: outputText.length,
        ...metadata
      }
    });
  };

  const trackCodeGeneration = async (
    model: string,
    prompt: string,
    generatedCode: string,
    language?: string,
    metadata?: any
  ) => {
    return trackTextGeneration(
      model,
      prompt,
      generatedCode,
      'code_generation',
      {
        language,
        ...metadata
      }
    );
  };

  const trackChatMessage = async (
    model: string,
    userMessage: string,
    assistantResponse: string,
    metadata?: any
  ) => {
    return trackTextGeneration(
      model,
      userMessage,
      assistantResponse,
      'chat',
      metadata
    );
  };

  const trackImageAnalysis = async (
    model: string,
    imageDescription: string,
    analysisResult: string,
    metadata?: any
  ) => {
    return trackTextGeneration(
      model,
      imageDescription,
      analysisResult,
      'image_analysis',
      {
        imageSize: metadata?.imageSize,
        imageFormat: metadata?.imageFormat,
        ...metadata
      }
    );
  };

  return {
    isTracking,
    trackAIUsage,
    trackTextGeneration,
    trackCodeGeneration,
    trackChatMessage,
    trackImageAnalysis,
    estimateTokens
  };
}

// Usage examples for documentation:
/*
// In a code generation component:
const { trackCodeGeneration } = useAITracking();

const generateCode = async (prompt: string) => {
  const result = await callAIAPI(prompt);
  
  // Track the usage
  await trackCodeGeneration(
    'claude-3-sonnet',
    prompt,
    result.code,
    'javascript',
    { feature: 'web_builder' }
  );
  
  return result;
};

// In a chat component:
const { trackChatMessage } = useAITracking();

const sendMessage = async (message: string) => {
  const response = await callChatAPI(message);
  
  // Track the usage
  await trackChatMessage(
    'gpt-4',
    message,
    response.content,
    { conversationId: 'conv-123' }
  );
  
  return response;
};
*/