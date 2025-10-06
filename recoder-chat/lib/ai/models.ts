import { getLocalChatModel, getLocalTitleModel, getLocalReasoningModel, getLocalArtifactModel } from './local-first-providers';
import { unifiedAI } from './unified-providers';

export const DEFAULT_CHAT_MODEL: string = 'unified-balanced';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  // 🆓 FREE AI MODELS - NO API COSTS
  {
    id: 'deepseek/deepseek-r1:free',
    name: '🆓 DeepSeek R1 (Free)',
    description: 'Advanced reasoning - 671B params - FREE',
  },
  {
    id: 'glm-4.5-air',
    name: '🆓 GLM 4.5 Air (Free)',
    description: 'Lightweight MoE - Agent tasks - FREE',
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b:free',
    name: '🆓 Qwen3 Coder (Free)',
    description: 'Code generation expert - 480B params - FREE',
  },
  {
    id: 'deepseek/deepseek-v3-0324:free',
    name: '🆓 DeepSeek V3 (Free)',
    description: 'Latest DeepSeek flagship - FREE',
  },
  {
    id: 'microsoft/mai-ds-r1:free',
    name: '🆓 Microsoft MAI DS R1 (Free)',
    description: 'Enhanced safety R1 variant - FREE',
  },

  // 🎨 IMAGE GENERATION
  {
    id: 'google/gemini-2.5-flash-image',
    name: '🎨 Gemini 2.5 Flash Image',
    description: 'State-of-the-art image generation',
  },

  // 🚀 UNIFIED AI MODELS - BATTLE READY
  {
    id: 'unified-premium',
    name: '👑 Premium AI',
    description: 'Claude 3.5 Sonnet - Best quality & reasoning',
  },
  {
    id: 'unified-balanced',
    name: '🧠 Balanced AI',
    description: 'Smart routing - Optimal speed & quality',
  },
  {
    id: 'unified-fast',
    name: '⚡ Fast AI',
    description: 'Claude Haiku + Local - Ultra fast responses',
  },
  {
    id: 'claude-sonnet',
    name: '🎯 Claude 3.5 Sonnet',
    description: 'Premium reasoning & code generation',
  },
  {
    id: 'claude-haiku',
    name: '🏃 Claude 3 Haiku',
    description: 'Fast & efficient for simple tasks',
  },
  // Legacy local models
  {
    id: 'local-chat-model',
    name: '🆓 Local AI Chat',
    description: 'Local AI model (Ollama/LM Studio) - FREE',
  },
  {
    id: 'local-reasoning-model',
    name: '🔧 Local Reasoning',
    description: 'Local AI for reasoning tasks - FREE',
  },
];

// 🚀 UNIFIED MODEL FUNCTIONS
export async function chatModel() {
  return {
    provider: 'unified-ai',
    modelId: 'unified-balanced',
    specificationVersion: 'v2' as const,
    supportedUrls: {},
    doGenerate: async (params: any) => {
      const { messages, modelId, ...options } = params;
      const chatMessages = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Map model ID to quality/provider preference
      const providerOptions = {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4000,
        quality: getQualityFromModelId(modelId),
        preferredProvider: getProviderFromModelId(modelId)
      };
      
      const response = await unifiedAI.smartGenerate(chatMessages, providerOptions);
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { 
          inputTokens: response.tokens ? Math.floor(response.tokens * 0.7) : 0, 
          outputTokens: response.tokens ? Math.floor(response.tokens * 0.3) : 0, 
          totalTokens: response.tokens || 0 
        },
        finishReason: 'stop' as const,
        warnings: []
      };
    },
    doStream: async function* (params: any) {
      const { messages, modelId, ...options } = params;
      const chatMessages = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));
      
      try {
        const providerOptions = {
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 4000,
          quality: getQualityFromModelId(modelId),
          preferredProvider: getProviderFromModelId(modelId)
        };
        
        const response = await unifiedAI.smartGenerate(chatMessages, providerOptions);
        
        // Stream the response word by word for better UX
        const words = response.content.split(' ');
        
        for (const word of words) {
          yield {
            type: 'text-delta',
            textDelta: word + ' '
          };
          await new Promise(resolve => setTimeout(resolve, 30)); // Faster streaming
        }
        
        yield {
          type: 'finish',
          finishReason: 'stop' as const,
          usage: { 
            inputTokens: response.tokens ? Math.floor(response.tokens * 0.7) : 0, 
            outputTokens: response.tokens ? Math.floor(response.tokens * 0.3) : 0, 
            totalTokens: response.tokens || 0 
          }
        };
      } catch (error) {
        yield {
          type: 'error',
          error: error instanceof Error ? error : new Error('Generation failed')
        };
      }
    }
  };
}

export async function titleModel() {
  return {
    provider: 'unified-ai',
    modelId: 'unified-fast',
    specificationVersion: 'v2' as const,
    supportedUrls: {},
    doGenerate: async (params: any) => {
      const { prompt } = params;
      const titleMessages = [
        { role: 'system' as const, content: 'Generate a short, concise title (max 50 characters) for the following content.' },
        { role: 'user' as const, content: prompt }
      ];
      
      const response = await unifiedAI.smartGenerate(titleMessages, { 
        maxTokens: 50, 
        quality: 'fast'
      });
      
      return {
        content: [{ type: 'text' as const, text: response.content.trim() }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    },
    doStream: async function* (params: any) {
      const { prompt } = params;
      const titleMessages = [
        { role: 'system' as const, content: 'Generate a short, concise title for the following content.' },
        { role: 'user' as const, content: prompt }
      ];
      
      try {
        const response = await unifiedAI.smartGenerate(titleMessages, { 
          maxTokens: 50, 
          quality: 'fast'
        });
        
        yield {
          type: 'text-delta',
          textDelta: response.content.trim()
        };
        
        yield {
          type: 'finish',
          finishReason: 'stop' as const,
          usage: { inputTokens: 0, outputTokens: 10, totalTokens: 10 }
        };
      } catch (error) {
        yield {
          type: 'error',
          error: error instanceof Error ? error : new Error('Generation failed')
        };
      }
    }
  };
}

export async function reasoningModel() {
  return {
    provider: 'unified-ai',
    modelId: 'unified-premium',
    doGenerate: async (params: any) => {
      const { messages, ...options } = params;
      const reasoningMessages = [
        { role: 'system' as const, content: 'Think step by step and provide detailed reasoning. Show your thought process clearly.' },
        ...messages.map((msg: any) => ({ role: msg.role, content: msg.content }))
      ];
      
      const response = await unifiedAI.smartGenerate(reasoningMessages, {
        ...options,
        quality: 'premium',
        preferredProvider: 'claude-sonnet'
      });
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    }
  };
}

export async function artifactModel() {
  return {
    provider: 'unified-ai',
    modelId: 'unified-balanced',
    doGenerate: async (params: any) => {
      const { messages, ...options } = params;
      const artifactMessages = [
        { role: 'system' as const, content: 'Generate clean, production-ready code without explanations. Focus on functionality and best practices.' },
        ...messages.map((msg: any) => ({ role: msg.role, content: msg.content }))
      ];
      
      const response = await unifiedAI.smartGenerate(artifactMessages, {
        ...options,
        quality: 'balanced'
      });
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    }
  };
}

// 🎯 HELPER FUNCTIONS FOR MODEL ROUTING
function getQualityFromModelId(modelId: string): 'fast' | 'balanced' | 'premium' {
  if (modelId?.includes('premium')) return 'premium';
  if (modelId?.includes('fast')) return 'fast';
  if (modelId?.includes('haiku')) return 'fast';
  if (modelId?.includes('sonnet')) return 'premium';
  return 'balanced';
}

function getProviderFromModelId(modelId: string): string | undefined {
  if (modelId?.includes('claude-sonnet')) return 'claude-sonnet';
  if (modelId?.includes('claude-haiku')) return 'claude-haiku';
  if (modelId?.includes('local')) return 'local';
  return undefined; // Let smart routing decide
}
