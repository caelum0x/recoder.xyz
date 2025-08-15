/**
 * Dual Platform API Client
 * Connects mobile app to both Chat Platform (3001) and Web Platform (3000)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthTokens {
  chatToken: string;
  webToken: string;
  unifiedToken: string;
  expiresAt: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  provider?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'mobile' | 'blockchain' | 'api' | 'fullstack';
  framework: string;
  language: string;
  status: 'active' | 'deployed' | 'archived';
  files: ProjectFile[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
  lastModified: string;
}

export interface AIAgent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  specialties: string[];
  available: boolean;
  platform: 'web' | 'chat' | 'both';
}

export interface DeploymentStatus {
  id: string;
  projectId: string;
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed';
  url?: string;
  buildLogs: string[];
  error?: string;
  createdAt: string;
}

export class DualPlatformClient {
  private static instance: DualPlatformClient;
  private chatBaseUrl: string = __DEV__ ? 'http://localhost:3001' : 'https://chat.recoder.xyz';
  private webBaseUrl: string = __DEV__ ? 'http://localhost:3000' : 'https://web.recoder.xyz';
  private wsConnections: Map<string, WebSocket> = new Map();
  private authTokens: AuthTokens | null = null;

  private constructor() {
    this.loadAuthTokens();
  }

  static getInstance(): DualPlatformClient {
    if (!DualPlatformClient.instance) {
      DualPlatformClient.instance = new DualPlatformClient();
    }
    return DualPlatformClient.instance;
  }

  /**
   * Authentication Management
   */
  async loadAuthTokens(): Promise<void> {
    try {
      // Skip during build time / SSR
      if (typeof window === 'undefined') {
        return;
      }
      
      const tokens = await AsyncStorage.getItem('auth_tokens');
      if (tokens) {
        this.authTokens = JSON.parse(tokens);
        
        // Check if tokens are expired
        if (this.authTokens && this.authTokens.expiresAt < Date.now()) {
          await this.refreshTokens();
        }
      }
    } catch (error) {
      console.error('Failed to load auth tokens:', error);
    }
  }

  async saveAuthTokens(tokens: AuthTokens): Promise<void> {
    try {
      this.authTokens = tokens;
      await AsyncStorage.setItem('auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to save auth tokens:', error);
    }
  }

  async login(email: string, password: string): Promise<ApiResponse<AuthTokens>> {
    try {
      // Login to Chat Platform first
      const chatResponse = await fetch(`${this.chatBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!chatResponse.ok) {
        throw new Error('Chat platform login failed');
      }

      const chatData = await chatResponse.json();

      // Login to Web Platform with unified token
      const webResponse = await fetch(`${this.webBaseUrl}/api/auth/mobile-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${chatData.token}`,
        },
        body: JSON.stringify({ unifiedToken: chatData.token }),
      });

      if (!webResponse.ok) {
        throw new Error('Web platform login failed');
      }

      const webData = await webResponse.json();

      const tokens: AuthTokens = {
        chatToken: chatData.token,
        webToken: webData.token,
        unifiedToken: chatData.token,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };

      await this.saveAuthTokens(tokens);
      this.setupWebSocketConnections();

      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async refreshTokens(): Promise<boolean> {
    if (!this.authTokens) return false;

    try {
      const response = await fetch(`${this.chatBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authTokens.unifiedToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      const newTokens: AuthTokens = {
        chatToken: data.chatToken,
        webToken: data.webToken,
        unifiedToken: data.unifiedToken,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };

      await this.saveAuthTokens(newTokens);
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      await this.logout();
      return false;
    }
  }

  async logout(): Promise<void> {
    this.closeWebSocketConnections();
    this.authTokens = null;
    await AsyncStorage.removeItem('auth_tokens');
  }

  /**
   * Chat Platform APIs (Port 3001)
   */
  async getChatHistory(limit: number = 50): Promise<ApiResponse<ChatMessage[]>> {
    return await this.chatRequest('/api/messages', { method: 'GET' });
  }

  async sendChatMessage(message: string, model?: string): Promise<ApiResponse<ChatMessage>> {
    return await this.chatRequest('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ message, model }),
    });
  }

  async streamChatMessage(message: string, model?: string): Promise<ReadableStream> {
    const response = await fetch(`${this.chatBaseUrl}/api/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authTokens?.chatToken}`,
      },
      body: JSON.stringify({ message, model }),
    });

    if (!response.body) {
      throw new Error('No response stream available');
    }

    return response.body;
  }

  /**
   * Web Platform APIs (Port 3000) - AI Agents
   */
  async getAvailableAgents(): Promise<ApiResponse<AIAgent[]>> {
    return await this.webRequest('/api/agents', { method: 'GET' });
  }

  async chatWithAgent(agentId: string, message: string, context?: any): Promise<ApiResponse<ChatMessage>> {
    return await this.webRequest(`/api/agents/${agentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    });
  }

  async generateCode(request: {
    prompt: string;
    language: string;
    framework?: string;
    agentId?: string;
  }): Promise<ApiResponse<{
    code: string;
    explanation: string;
    suggestions: string[];
  }>> {
    return await this.webRequest('/api/generate/code', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async generateBlockchainContract(request: {
    type: 'erc20' | 'erc721' | 'erc1155' | 'defi' | 'dao';
    name: string;
    symbol?: string;
    features: string[];
    network: 'ethereum' | 'solana' | 'polygon';
  }): Promise<ApiResponse<{
    contract: string;
    deployment: string;
    tests: string;
  }>> {
    return await this.webRequest('/api/agents/blockchain/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Project Management APIs
   */
  async getProjects(): Promise<ApiResponse<Project[]>> {
    return await this.webRequest('/api/projects', { method: 'GET' });
  }

  async createProject(project: {
    name: string;
    description: string;
    type: string;
    framework: string;
    language: string;
  }): Promise<ApiResponse<Project>> {
    return await this.webRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async getProject(projectId: string): Promise<ApiResponse<Project>> {
    return await this.webRequest(`/api/projects/${projectId}`, { method: 'GET' });
  }

  async updateProjectFile(
    projectId: string, 
    fileId: string, 
    content: string
  ): Promise<ApiResponse<ProjectFile>> {
    return await this.webRequest(`/api/projects/${projectId}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async createProjectFile(
    projectId: string,
    file: {
      name: string;
      path: string;
      content: string;
      language: string;
    }
  ): Promise<ApiResponse<ProjectFile>> {
    return await this.webRequest(`/api/projects/${projectId}/files`, {
      method: 'POST',
      body: JSON.stringify(file),
    });
  }

  /**
   * Deployment APIs
   */
  async deployProject(projectId: string, config?: any): Promise<ApiResponse<DeploymentStatus>> {
    return await this.webRequest(`/api/projects/${projectId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  }

  async getDeploymentStatus(deploymentId: string): Promise<ApiResponse<DeploymentStatus>> {
    return await this.webRequest(`/api/deployments/${deploymentId}`, { method: 'GET' });
  }

  async getDeploymentLogs(deploymentId: string): Promise<ApiResponse<string[]>> {
    return await this.webRequest(`/api/deployments/${deploymentId}/logs`, { method: 'GET' });
  }

  /**
   * Local AI Integration
   */
  async getAvailableModels(): Promise<ApiResponse<any>> {
    // Try local first, then fallback to platforms
    try {
      const response = await this.webRequest('/api/ai/models', { method: 'GET' });
      if (response.success) {
        return response;
      }
    } catch (error) {
      // Fallback to chat platform
      return await this.chatRequest('/api/ai/models', { method: 'GET' });
    }
  }

  async downloadModel(modelId: string): Promise<ApiResponse<any>> {
    return await this.webRequest('/api/ai/models/download', {
      method: 'POST',
      body: JSON.stringify({ modelId }),
    });
  }

  /**
   * WebSocket Connections for Real-time Features
   */
  setupWebSocketConnections(): void {
    if (!this.authTokens) return;

    // Chat platform WebSocket
    const chatWs = new WebSocket(`${this.chatBaseUrl.replace('http', 'ws')}/ws?token=${this.authTokens.chatToken}`);
    this.wsConnections.set('chat', chatWs);

    chatWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleWebSocketMessage('chat', data);
    };

    // Web platform WebSocket
    const webWs = new WebSocket(`${this.webBaseUrl.replace('http', 'ws')}/ws?token=${this.authTokens.webToken}`);
    this.wsConnections.set('web', webWs);

    webWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleWebSocketMessage('web', data);
    };
  }

  closeWebSocketConnections(): void {
    this.wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.wsConnections.clear();
  }

  private handleWebSocketMessage(platform: 'chat' | 'web', data: any): void {
    // Emit events for the React Native app to handle
    // This would integrate with your event system
    console.log(`WebSocket message from ${platform}:`, data);
  }

  /**
   * Helper Methods
   */
  private async chatRequest(endpoint: string, options: RequestInit = {}): Promise<ApiResponse> {
    return await this.makeRequest(this.chatBaseUrl, endpoint, options, 'chatToken');
  }

  private async webRequest(endpoint: string, options: RequestInit = {}): Promise<ApiResponse> {
    return await this.makeRequest(this.webBaseUrl, endpoint, options, 'webToken');
  }

  private async makeRequest(
    baseUrl: string,
    endpoint: string,
    options: RequestInit,
    tokenType: keyof AuthTokens
  ): Promise<ApiResponse> {
    try {
      if (!this.authTokens) {
        throw new Error('Not authenticated');
      }

      const token = this.authTokens[tokenType];
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (response.status === 401) {
        // Try to refresh tokens
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          // Retry the request
          return await this.makeRequest(baseUrl, endpoint, options, tokenType);
        } else {
          throw new Error('Authentication failed');
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sync Status
   */
  getSyncStatus(): {
    chatConnected: boolean;
    webConnected: boolean;
    authenticated: boolean;
  } {
    const chatWs = this.wsConnections.get('chat');
    const webWs = this.wsConnections.get('web');

    return {
      chatConnected: chatWs?.readyState === WebSocket.OPEN,
      webConnected: webWs?.readyState === WebSocket.OPEN,
      authenticated: !!this.authTokens && this.authTokens.expiresAt > Date.now(),
    };
  }
}

// Export singleton instance
export const dualPlatformClient = DualPlatformClient.getInstance();

// Export convenience functions
export const loginUser = (email: string, password: string) => 
  dualPlatformClient.login(email, password);

export const getChatHistory = () => 
  dualPlatformClient.getChatHistory();

export const sendMessage = (message: string, model?: string) => 
  dualPlatformClient.sendChatMessage(message, model);

export const getProjects = () => 
  dualPlatformClient.getProjects();

export const getAgents = () => 
  dualPlatformClient.getAvailableAgents();

export const generateCode = (request: any) => 
  dualPlatformClient.generateCode(request);