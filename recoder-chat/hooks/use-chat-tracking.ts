'use client';

import { useCallback } from 'react';
import { usePaymentStore } from '@/lib/payment-service';

interface ChatTrackingParams {
  userMessage: string;
  assistantResponse: string;
  model: string;
  chatId?: string;
  metadata?: any;
}

export function useChatTracking() {
  const { trackUsage } = usePaymentStore();
  
  const estimateTokens = useCallback((text: string): number => {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }, []);
  
  const trackChatMessage = useCallback(async (params: ChatTrackingParams) => {
    try {
      const inputTokens = estimateTokens(params.userMessage);
      const outputTokens = estimateTokens(params.assistantResponse);
      
      await trackUsage(
        params.model,
        inputTokens,
        outputTokens,
        'chat_conversation',
        {
          chatId: params.chatId,
          platform: 'recoder-chat',
          messageLength: {
            user: params.userMessage.length,
            assistant: params.assistantResponse.length
          },
          ...params.metadata
        }
      );
      
      return {
        tracked: true,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      };
    } catch (error) {
      console.error('Chat usage tracking failed:', error);
      
      // Check if it's a usage limit error
      if (error instanceof Error && error.message.includes('limit exceeded')) {
        // This error should trigger upgrade prompts in the UI
        throw error;
      }
      
      // For other errors, log but don't break the chat flow
      return {
        tracked: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, [trackUsage, estimateTokens]);
  
  const trackStreamingMessage = useCallback(async (
    userMessage: string,
    streamingResponse: string,
    model: string,
    chatId?: string,
    isComplete: boolean = false
  ) => {
    // Only track when the streaming is complete to avoid multiple tracking calls
    if (!isComplete) return;
    
    return trackChatMessage({
      userMessage,
      assistantResponse: streamingResponse,
      model,
      chatId,
      metadata: {
        streaming: true,
        responseComplete: true
      }
    });
  }, [trackChatMessage]);
  
  return {
    trackChatMessage,
    trackStreamingMessage,
    estimateTokens
  };
}