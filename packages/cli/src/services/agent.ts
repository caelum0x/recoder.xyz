/**
 * Agent service for AI agent management
 */

import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from '../utils/config';
import { Logger } from '@recoder/shared';

export interface AgentConfig {
  name: string;
  type: string;
  model: string;
  description: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  public: boolean;
  capabilities: string[];
}

export interface AgentResponse {
  success: boolean;
  agent?: any;
  agents?: any[];
  error?: string;
}

class AgentManagementService {
  private api: AxiosInstance;

  constructor() {
    const apiConfig = ConfigManager.getApiConfig();
    
    this.api = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder CLI/1.0.0',
      },
    });
  }

  async createAgent(token: string, config: AgentConfig): Promise<AgentResponse> {
    try {
      const response = await this.api.post('/agents', config, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { agent } = response.data;

      Logger.info(`Agent created: ${agent.name} (${agent.id})`);

      return {
        success: true,
        agent,
      };
    } catch (error: any) {
      Logger.error(`Agent creation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Agent creation failed',
      };
    }
  }

  async listAgents(token: string, options: any = {}): Promise<AgentResponse> {
    try {
      const params = new URLSearchParams();
      
      if (options.filter) params.append('type', options.filter);
      if (options.mine) params.append('mine', 'true');
      if (options.public) params.append('public', 'true');

      const response = await this.api.get(`/agents?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        agents: response.data.agents,
      };
    } catch (error: any) {
      Logger.error(`Failed to list agents: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list agents',
      };
    }
  }

  async getAgent(token: string, agentId: string): Promise<AgentResponse> {
    try {
      const response = await this.api.get(`/agents/${agentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        agent: response.data.agent,
      };
    } catch (error: any) {
      Logger.error(`Failed to get agent: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get agent',
      };
    }
  }

  async updateAgent(token: string, agentId: string, updates: any): Promise<AgentResponse> {
    try {
      const response = await this.api.patch(`/agents/${agentId}`, updates, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { agent } = response.data;

      Logger.info(`Agent updated: ${agentId}`);

      return {
        success: true,
        agent,
      };
    } catch (error: any) {
      Logger.error(`Agent update failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Agent update failed',
      };
    }
  }

  async deleteAgent(token: string, agentId: string): Promise<AgentResponse> {
    try {
      await this.api.delete(`/agents/${agentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Logger.info(`Agent deleted: ${agentId}`);

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Agent deletion failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Agent deletion failed',
      };
    }
  }

  async cloneAgent(token: string, agentId: string, options: any = {}): Promise<AgentResponse> {
    try {
      const response = await this.api.post(`/agents/${agentId}/clone`, options, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { agent } = response.data;

      Logger.info(`Agent cloned: ${agentId} -> ${agent.id}`);

      return {
        success: true,
        agent,
      };
    } catch (error: any) {
      Logger.error(`Agent cloning failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Agent cloning failed',
      };
    }
  }

  async testAgent(token: string, agentId: string, prompt: string): Promise<any> {
    try {
      const response = await this.api.post(`/agents/${agentId}/test`, 
        { prompt },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return {
        success: true,
        response: response.data.response,
        usage: response.data.usage,
      };
    } catch (error: any) {
      Logger.error(`Agent test failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Agent test failed',
      };
    }
  }

  async testAgentStream(token: string, agentId: string, prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const response = await this.api.post(`/agents/${agentId}/test`, 
        { prompt, stream: true },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: 'stream',
        }
      );

      response.data.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.content) {
                onChunk(json.content);
              }
            } catch (error) {
              // Ignore JSON parse errors
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
    } catch (error: any) {
      Logger.error(`Agent stream test failed: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  async listModels(options: any = {}): Promise<any> {
    try {
      const params = new URLSearchParams();
      
      if (options.provider) params.append('provider', options.provider);
      if (options.includePricing) params.append('pricing', 'true');

      const response = await this.api.get(`/models?${params}`);

      return {
        success: true,
        models: response.data.models,
      };
    } catch (error: any) {
      Logger.error(`Failed to list models: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list models',
      };
    }
  }
}

// Export singleton instance
export const AgentService = new AgentManagementService();