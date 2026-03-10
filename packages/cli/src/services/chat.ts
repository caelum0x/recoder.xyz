/**
 * Chat service for AI conversations
 */

import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from '../utils/config';
import { Logger } from 'recoder-shared';

export interface ChatSession {
  id: string;
  agentId?: string;
  model?: string;
  context?: string;
  stream?: boolean;
}

export interface ChatResponse {
  success: boolean;
  message?: string;
  session?: any;
  sessions?: any[];
  error?: string;
}

class ChatManagementService {
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

  async createSession(token: string, options: any): Promise<any> {
    try {
      const response = await this.api.post('/chat/sessions', options, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { session } = response.data;

      Logger.info(`Chat session created: ${session.id}`);

      return {
        success: true,
        session,
      };
    } catch (error) {
      Logger.error(`Chat session creation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Chat session creation failed',
      };
    }
  }

  async getSession(token: string, sessionId: string): Promise<any> {
    try {
      const response = await this.api.get(`/chat/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        session: response.data.session,
      };
    } catch (error) {
      Logger.error(`Failed to get chat session: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get chat session',
      };
    }
  }

  async listSessions(token: string): Promise<any> {
    try {
      const response = await this.api.get('/chat/sessions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        sessions: response.data.sessions,
      };
    } catch (error) {
      Logger.error(`Failed to list chat sessions: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list chat sessions',
      };
    }
  }

  async sendMessage(token: string, sessionId: string, message: string): Promise<any> {
    try {
      const response = await this.api.post(`/chat/sessions/${sessionId}/messages`, 
        { message },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 60000, // 1 minute for chat responses
        }
      );

      return {
        success: true,
        message: response.data.response,
        usage: response.data.usage,
      };
    } catch (error) {
      Logger.error(`Failed to send message: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to send message',
      };
    }
  }

  async sendMessageStream(token: string, sessionId: string, message: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const response = await this.api.post(`/chat/sessions/${sessionId}/messages`, 
        { message, stream: true },
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
    } catch (error) {
      Logger.error(`Failed to stream message: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  async clearSession(token: string, sessionId: string): Promise<any> {
    try {
      await this.api.delete(`/chat/sessions/${sessionId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
      };
    } catch (error) {
      Logger.error(`Failed to clear session: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to clear session',
      };
    }
  }

  async deleteSession(token: string, sessionId: string): Promise<any> {
    try {
      await this.api.delete(`/chat/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Logger.info(`Chat session deleted: ${sessionId}`);

      return {
        success: true,
      };
    } catch (error) {
      Logger.error(`Failed to delete session: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to delete session',
      };
    }
  }

  async clearAllSessions(token: string): Promise<any> {
    try {
      const response = await this.api.delete('/chat/sessions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Logger.info('All chat sessions cleared');

      return {
        success: true,
        deletedCount: response.data.deletedCount,
      };
    } catch (error) {
      Logger.error(`Failed to clear all sessions: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to clear all sessions',
      };
    }
  }

  async exportSession(token: string, sessionId: string, options: any): Promise<any> {
    try {
      const response = await this.api.get(`/chat/sessions/${sessionId}/export`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: options,
      });

      return {
        success: true,
        content: response.data.content,
      };
    } catch (error) {
      Logger.error(`Failed to export session: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to export session',
      };
    }
  }

  async getSessionUsage(token: string, sessionId: string): Promise<any> {
    try {
      const response = await this.api.get(`/chat/sessions/${sessionId}/usage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        usage: response.data.usage,
      };
    } catch (error) {
      Logger.error(`Failed to get session usage: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get session usage',
      };
    }
  }

  async quickAsk(token: string, question: string, options: any): Promise<any> {
    try {
      const response = await this.api.post('/chat/quick-ask', 
        {
          question,
          ...options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 60000,
        }
      );

      return {
        success: true,
        answer: response.data.answer,
        usage: response.data.usage,
      };
    } catch (error) {
      Logger.error(`Quick ask failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Quick ask failed',
      };
    }
  }

  async reviewCode(token: string, code: string, options: any): Promise<any> {
    try {
      const response = await this.api.post('/chat/code-review', 
        {
          code,
          ...options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 120000, // 2 minutes for code review
        }
      );

      return {
        success: true,
        review: response.data.review,
      };
    } catch (error) {
      Logger.error(`Code review failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Code review failed',
      };
    }
  }

  async explainCode(token: string, code: string, options: any): Promise<any> {
    try {
      const response = await this.api.post('/chat/explain-code', 
        {
          code,
          ...options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 60000,
        }
      );

      return {
        success: true,
        explanation: response.data.explanation,
        keypoints: response.data.keypoints,
      };
    } catch (error) {
      Logger.error(`Code explanation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Code explanation failed',
      };
    }
  }

  async debugAssist(token: string, debugContext: string, options: any): Promise<any> {
    try {
      const response = await this.api.post('/chat/debug-assist', 
        {
          context: debugContext,
          ...options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 120000,
        }
      );

      return {
        success: true,
        debug: response.data.debug,
      };
    } catch (error) {
      Logger.error(`Debug assistance failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Debug assistance failed',
      };
    }
  }

  async getAvailableAgents(token: string): Promise<any> {
    try {
      const response = await this.api.get('/chat/agents', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        agents: response.data.agents,
      };
    } catch (error) {
      Logger.error(`Failed to get available agents: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get available agents',
      };
    }
  }

  async streamResponse(responseStream: any, onChunk: (chunk: string) => void): Promise<void> {
    // This would handle streaming responses for quick ask
    return new Promise((resolve, reject) => {
      responseStream.on('data', (chunk: Buffer) => {
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

      responseStream.on('end', resolve);
      responseStream.on('error', reject);
    });
  }
}

// Export singleton instance
export const ChatService = new ChatManagementService();