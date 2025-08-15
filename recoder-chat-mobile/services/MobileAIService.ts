/**
 * Mobile AI Service - Handles AI functionality with offline capabilities
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface AIProvider {
  id: string;
  name: string;
  type: 'cloud' | 'local';
  available: boolean;
  models: string[];
}

export interface GenerationRequest {
  prompt: string;
  model?: string;
  provider?: string;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

export interface GenerationResponse {
  content: string;
  model: string;
  provider: string;
  tokens: number;
  cached: boolean;
  timestamp: number;
}

class MobileAIService {
  private apiEndpoint = __DEV__ ? 'http://localhost:3001' : 'https://api.recoder.xyz';
  private providers: AIProvider[] = [];
  private cache = new Map<string, GenerationResponse>();
  
  constructor() {
    this.initializeProviders();
    this.loadCache();
  }

  private async initializeProviders() {
    // Cloud providers
    const cloudProviders: AIProvider[] = [
      {
        id: 'anthropic',
        name: 'Claude (Anthropic)',
        type: 'cloud',
        available: true,
        models: ['claude-3-sonnet', 'claude-3-haiku']
      },
      {
        id: 'openai',
        name: 'OpenAI GPT',
        type: 'cloud',
        available: true,
        models: ['gpt-4', 'gpt-3.5-turbo']
      },
      {
        id: 'groq',
        name: 'Groq',
        type: 'cloud',
        available: true,
        models: ['llama-3.1-70b', 'mixtral-8x7b']
      }
    ];

    // Local providers (when available)
    const localProviders: AIProvider[] = [
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        type: 'local',
        available: await this.checkLocalAI('ollama'),
        models: await this.getLocalModels('ollama')
      }
    ];

    this.providers = [...cloudProviders, ...localProviders];
  }

  private async checkLocalAI(provider: string): Promise<boolean> {
    try {
      // Check if local AI server is running
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`http://localhost:11434/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getLocalModels(provider: string): Promise<string[]> {
    try {
      if (provider === 'ollama') {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        return data.models?.map((m: any) => m.name) || [];
      }
    } catch {
      // Local AI not available
    }
    return [];
  }

  private async loadCache() {
    try {
      const cached = await AsyncStorage.getItem('@recoder:ai_cache');
      if (cached) {
        const cacheData = JSON.parse(cached);
        this.cache = new Map(cacheData);
      }
    } catch (error) {
      console.warn('Failed to load AI cache:', error);
    }
  }

  private async saveCache() {
    try {
      const cacheData = Array.from(this.cache.entries());
      await AsyncStorage.setItem('@recoder:ai_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to save AI cache:', error);
    }
  }

  private getCacheKey(request: GenerationRequest): string {
    return `${request.provider || 'auto'}:${request.model || 'default'}:${JSON.stringify(request.prompt)}`;
  }

  private async getAPIKey(provider: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(`@recoder:api_key_${provider}`);
    } catch {
      return null;
    }
  }

  async setAPIKey(provider: string, key: string): Promise<void> {
    await SecureStore.setItemAsync(`@recoder:api_key_${provider}`, key);
  }

  async generateCode(request: GenerationRequest): Promise<GenerationResponse> {
    // Check cache first for offline capability
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return { ...cached, cached: true };
    }

    try {
      // Try local AI first if available
      const localProvider = this.providers.find(p => p.type === 'local' && p.available);
      if (localProvider && (!request.provider || request.provider === 'local')) {
        return await this.generateWithLocal(request, localProvider);
      }

      // Fall back to cloud providers
      return await this.generateWithCloud(request);
    } catch (error) {
      // If all else fails, try to use cached response even if expired
      if (cached) {
        console.warn('Using expired cache due to generation error:', error);
        return { ...cached, cached: true };
      }
      throw error;
    }
  }

  private async generateWithLocal(request: GenerationRequest, provider: AIProvider): Promise<GenerationResponse> {
    const model = request.model || provider.models[0];
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.options?.temperature || 0.7,
          num_predict: request.options?.maxTokens || 2048
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Local AI error: ${response.statusText}`);
    }

    const data = await response.json();
    
    const result: GenerationResponse = {
      content: data.response,
      model,
      provider: provider.id,
      tokens: data.eval_count || 0,
      cached: false,
      timestamp: Date.now()
    };

    // Cache the result
    this.cache.set(this.getCacheKey(request), result);
    this.saveCache();

    return result;
  }

  private async generateWithCloud(request: GenerationRequest): Promise<GenerationResponse> {
    const provider = request.provider || 'anthropic';
    const apiKey = await this.getAPIKey(provider);
    
    if (!apiKey) {
      throw new Error(`No API key found for ${provider}. Please set it in settings.`);
    }

    const response = await fetch(`${this.apiEndpoint}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAuthToken()}`
      },
      body: JSON.stringify({
        provider,
        model: request.model,
        prompt: request.prompt,
        options: request.options
      })
    });

    if (!response.ok) {
      throw new Error(`Cloud AI error: ${response.statusText}`);
    }

    const data = await response.json();
    
    const result: GenerationResponse = {
      content: data.content,
      model: data.model,
      provider: data.provider,
      tokens: data.tokens,
      cached: false,
      timestamp: Date.now()
    };

    // Cache the result
    this.cache.set(this.getCacheKey(request), result);
    this.saveCache();

    return result;
  }

  private async getAuthToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('@recoder:auth_token');
  }

  async getAvailableProviders(): Promise<AIProvider[]> {
    // Refresh local provider availability
    for (const provider of this.providers) {
      if (provider.type === 'local') {
        provider.available = await this.checkLocalAI(provider.id);
        if (provider.available) {
          provider.models = await this.getLocalModels(provider.id);
        }
      }
    }
    
    return this.providers;
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    await AsyncStorage.removeItem('@recoder:ai_cache');
  }

  async getCacheSize(): Promise<number> {
    return this.cache.size;
  }

  // Offline-specific methods
  async enableOfflineMode(): Promise<void> {
    await AsyncStorage.setItem('@recoder:offline_mode', 'true');
  }

  async disableOfflineMode(): Promise<void> {
    await AsyncStorage.setItem('@recoder:offline_mode', 'false');
  }

  async isOfflineModeEnabled(): Promise<boolean> {
    const offline = await AsyncStorage.getItem('@recoder:offline_mode');
    return offline === 'true';
  }

  // Code generation templates for offline use
  async generateCodeFromTemplate(template: string, variables: Record<string, string>): Promise<string> {
    let code = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return code;
  }

  // Pre-defined templates for offline code generation
  getCodeTemplates() {
    return {
      'react-component': `import React from 'react';

interface {{componentName}}Props {
  {{props}}
}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({{propsDestructured}}) => {
  return (
    <div className="{{className}}">
      {{children}}
    </div>
  );
};`,
      
      'express-route': `import { Request, Response } from 'express';

export const {{routeName}} = async (req: Request, res: Response) => {
  try {
    {{implementation}}
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('{{routeName}} error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};`,

      'python-function': `def {{functionName}}({{parameters}}):
    """
    {{description}}
    
    Args:
        {{parameterDocs}}
    
    Returns:
        {{returnType}}: {{returnDescription}}
    """
    {{implementation}}
    return result`
    };
  }
}

export const mobileAI = new MobileAIService();
export default mobileAI;