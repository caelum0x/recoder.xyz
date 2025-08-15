/**
 * Recoder Backend API Client
 * Connects mobile app to the main Recoder.xyz backend and services
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  subscription: {
    plan: 'free' | 'premium' | 'enterprise';
    usage: {
      requests: number;
      tokens: number;
      limit: number;
    };
  };
  preferences: {
    defaultModel: string;
    theme: 'light' | 'dark' | 'system';
  };
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
  chatId?: string;
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
  structure: any;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  files: ProjectFile[];
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
  type: 'code' | 'chat' | 'analysis' | 'deployment' | 'testing';
  capabilities: string[];
  modelProvider: string;
  isActive: boolean;
  config: any;
}

export interface AIProvider {
  id: string;
  name: string;
  status: 'available' | 'unavailable' | 'rate_limited';
  models: string[];
  features: string[];
}

export interface GenerationRequest {
  prompt: string;
  language: string;
  framework?: string;
  agentId?: string;
  includeTests?: boolean;
  includeComments?: boolean;
  style?: 'functional' | 'object-oriented' | 'minimal' | 'comprehensive';
  optimization?: 'performance' | 'readability' | 'size';
}

export interface GenerationResponse {
  code: string;
  explanation: string;
  suggestions: string[];
  language: string;
  tests?: string;
  dependencies?: string[];
  instructions?: string;
}

export class RecoderBackendClient {
  private static instance: RecoderBackendClient;
  private backendUrl: string = __DEV__ ? 'http://localhost:3001' : 'https://api.recoder.xyz';
  private engineUrl: string = __DEV__ ? 'http://localhost:3002' : 'https://engine.recoder.xyz';
  private wsConnection: WebSocket | null = null;
  private authTokens: AuthTokens | null = null;
  private deviceInfo: any = null;

  private constructor() {
    this.loadAuthTokens();
    this.initializeDeviceInfo();
  }

  static getInstance(): RecoderBackendClient {
    if (!RecoderBackendClient.instance) {
      RecoderBackendClient.instance = new RecoderBackendClient();
    }
    return RecoderBackendClient.instance;
  }

  private async initializeDeviceInfo() {
    this.deviceInfo = {
      deviceId: Device.osInternalBuildId || 'unknown',
      platform: Device.osName,
      version: Device.osVersion,
      isDevice: Device.isDevice,
      brand: Device.brand,
      model: Device.modelName,
    };
  }

  /**
   * Authentication Management
   */
  async loadAuthTokens(): Promise<void> {
    try {
      const tokens = await AsyncStorage.getItem('@recoder:auth_tokens');
      if (tokens) {
        this.authTokens = JSON.parse(tokens);
        
        // Check if tokens are expired
        if (this.authTokens && this.authTokens.expiresAt < Date.now()) {
          await this.refreshTokens();
        } else if (this.authTokens) {
          // Setup WebSocket connection if tokens are valid
          this.setupWebSocketConnection();
        }
      }
    } catch (error) {
      console.error('Failed to load auth tokens:', error);
    }
  }

  async saveAuthTokens(tokens: AuthTokens): Promise<void> {
    try {
      this.authTokens = tokens;
      await AsyncStorage.setItem('@recoder:auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to save auth tokens:', error);
    }
  }

  async login(email: string, password: string): Promise<ApiResponse<AuthTokens>> {
    try {
      const response = await fetch(`${this.backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Info': JSON.stringify(this.deviceInfo),
        },
        body: JSON.stringify({ 
          email, 
          password,
          deviceInfo: this.deviceInfo 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Login failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Login failed');
      }

      const tokens: AuthTokens = {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        expiresAt: Date.now() + (15 * 60 * 1000), // 15 minutes for access token
        user: data.data.user,
      };

      await this.saveAuthTokens(tokens);
      this.setupWebSocketConnection();

      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message || 'Login failed',
      };
    }
  }

  async register(userData: {
    name: string;
    email: string;
    password: string;
  }): Promise<ApiResponse<AuthTokens>> {
    try {
      const response = await fetch(`${this.backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Info': JSON.stringify(this.deviceInfo),
        },
        body: JSON.stringify({
          ...userData,
          deviceInfo: this.deviceInfo
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Registration failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      const tokens: AuthTokens = {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        expiresAt: Date.now() + (15 * 60 * 1000),
        user: data.data.user,
      };

      await this.saveAuthTokens(tokens);
      this.setupWebSocketConnection();

      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message || 'Registration failed',
      };
    }
  }

  async refreshTokens(): Promise<boolean> {
    if (!this.authTokens) return false;

    try {
      const response = await fetch(`${this.backendUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authTokens.refreshToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Token refresh failed');
      }

      const newTokens: AuthTokens = {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken || this.authTokens.refreshToken,
        expiresAt: Date.now() + (15 * 60 * 1000),
        user: data.data.user || this.authTokens.user,
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
    try {
      if (this.authTokens) {
        await fetch(`${this.backendUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authTokens.accessToken}`,
          },
        }).catch(() => {}); // Ignore logout API errors
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      this.closeWebSocketConnection();
      this.authTokens = null;
      await AsyncStorage.removeItem('@recoder:auth_tokens');
    }
  }

  /**
   * User Profile APIs
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return await this.makeRequest('/api/auth/me', { method: 'GET' });
  }

  async updateProfile(updates: Partial<User>): Promise<ApiResponse<User>> {
    return await this.makeRequest('/api/auth/update-profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return await this.makeRequest('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /**
   * AI Agents APIs
   */
  async getAgents(): Promise<ApiResponse<AIAgent[]>> {
    return await this.makeRequest('/api/agents', { method: 'GET' });
  }

  async createAgent(agentData: {
    name: string;
    description: string;
    type: string;
    capabilities: string[];
    modelProvider: string;
    config: any;
  }): Promise<ApiResponse<AIAgent>> {
    return await this.makeRequest('/api/agents', {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
  }

  async updateAgent(agentId: string, updates: Partial<AIAgent>): Promise<ApiResponse<AIAgent>> {
    return await this.makeRequest(`/api/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAgent(agentId: string): Promise<ApiResponse<void>> {
    return await this.makeRequest(`/api/agents/${agentId}`, { method: 'DELETE' });
  }

  async executeAgent(agentId: string, task: string, context?: any): Promise<ApiResponse<any>> {
    return await this.makeRequest(`/api/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ task, context }),
    });
  }

  async getAIProviders(): Promise<ApiResponse<AIProvider[]>> {
    return await this.makeRequest('/api/ai-providers', { method: 'GET' });
  }

  async generateCode(request: GenerationRequest): Promise<ApiResponse<GenerationResponse>> {
    try {
      // Use Production Engine for code generation (port 3002)
      const response = await fetch(`${this.engineUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authTokens?.accessToken}`,
        },
        body: JSON.stringify(request),
      });

      if (response.status === 401) {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          return await this.generateCode(request);
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
      console.error('Code generation error:', error);
      return {
        success: false,
        error: error.message || 'Code generation failed',
      };
    }
  }

  async processMultiModal(request: {
    code?: string;
    docs?: string;
    conversation: string;
    context?: any;
  }): Promise<ApiResponse<any>> {
    return await this.makeRequest('/api/multi-modal-ai/process', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Project Management APIs
   */
  async getProjects(filters?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{
    projects: Project[];
    total: number;
    page: number;
    totalPages: number;
  }>> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) queryParams.append(key, value.toString());
      });
    }
    const query = queryParams.toString();
    return await this.makeRequest(`/api/projects${query ? '?' + query : ''}`, { method: 'GET' });
  }

  async createProject(project: {
    name: string;
    description: string;
    type: string;
    framework: string;
    language: string;
    template?: string;
  }): Promise<ApiResponse<Project>> {
    return await this.makeRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async getProject(projectId: string): Promise<ApiResponse<Project>> {
    return await this.makeRequest(`/api/projects/${projectId}`, { method: 'GET' });
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<ApiResponse<Project>> {
    return await this.makeRequest(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProject(projectId: string): Promise<ApiResponse<void>> {
    return await this.makeRequest(`/api/projects/${projectId}`, { method: 'DELETE' });
  }

  async getProjectStructure(projectId: string): Promise<ApiResponse<any>> {
    return await this.makeRequest(`/api/projects/${projectId}/structure`, { method: 'GET' });
  }

  async generateProjectCode(projectId: string, options: {
    feature?: string;
    prompt?: string;
    agentId?: string;
  }): Promise<ApiResponse<any>> {
    return await this.makeRequest(`/api/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Templates and Analytics APIs
   */
  async getTemplates(): Promise<ApiResponse<any[]>> {
    return await this.makeRequest('/api/templates', { method: 'GET' });
  }

  async getAnalytics(timeRange?: string): Promise<ApiResponse<any>> {
    const query = timeRange ? `?timeRange=${timeRange}` : '';
    return await this.makeRequest(`/api/analytics${query}`, { method: 'GET' });
  }

  async getBilling(): Promise<ApiResponse<any>> {
    return await this.makeRequest('/api/billing', { method: 'GET' });
  }

  async getSubscription(): Promise<ApiResponse<any>> {
    return await this.makeRequest('/api/subscriptions', { method: 'GET' });
  }

  /**
   * AI Models and Health APIs
   */
  async getModels(): Promise<ApiResponse<any[]>> {
    return await this.makeRequest('/api/models', { method: 'GET' });
  }

  async getSystemHealth(): Promise<ApiResponse<any>> {
    return await this.makeRequest('/health', { method: 'GET' });
  }

  async reportError(error: any): Promise<ApiResponse<void>> {
    return await this.makeRequest('/api/errors/report', {
      method: 'POST',
      body: JSON.stringify({ error, deviceInfo: this.deviceInfo }),
    });
  }

  /**
   * WebSocket Connection for Real-time Features
   */
  setupWebSocketConnection(): void {
    if (!this.authTokens) return;

    try {
      const wsUrl = `${this.backendUrl.replace('http', 'ws')}/ws?token=${this.authTokens.accessToken}&deviceId=${this.deviceInfo?.deviceId}&platform=mobile`;
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.log('WebSocket connected');
        // Send device registration
        this.sendWebSocketMessage({
          type: 'device:register',
          data: {
            deviceInfo: this.deviceInfo,
            platform: 'mobile',
            userId: this.authTokens?.user.id,
          }
        });
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.wsConnection.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        // Attempt to reconnect after 5 seconds if not a clean close
        if (event.code !== 1000 && this.authTokens) {
          setTimeout(() => {
            this.setupWebSocketConnection();
          }, 5000);
        }
      };
    } catch (error) {
      console.error('WebSocket setup error:', error);
    }
  }

  closeWebSocketConnection(): void {
    if (this.wsConnection) {
      this.wsConnection.close(1000, 'Client logout');
      this.wsConnection = null;
    }
  }

  sendWebSocketMessage(message: any): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  private handleWebSocketMessage(data: any): void {
    console.log('WebSocket message received:', data.type);
    
    // Handle different message types
    switch (data.type) {
      case 'sync:update':
        // Handle cross-platform sync
        console.log('Sync update received:', data.data);
        break;
      
      case 'notification:push':
        // Handle push notifications
        console.log('Push notification:', data.data);
        break;
      
      case 'ai:status':
        // Handle AI processing status updates
        console.log('AI status update:', data.data);
        break;
      
      case 'collaboration:update':
        // Handle real-time collaboration
        console.log('Collaboration update:', data.data);
        break;
      
      case 'activity:update':
        // Handle user activity updates
        console.log('Activity update:', data.data);
        break;
      
      default:
        console.log('Unknown WebSocket message:', data);
    }
  }

  /**
   * Helper Methods
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse> {
    try {
      if (!this.authTokens) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.backendUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authTokens.accessToken}`,
          'X-Device-Info': JSON.stringify(this.deviceInfo),
          ...options.headers,
        },
      });

      if (response.status === 401) {
        // Try to refresh tokens
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          // Retry the request
          return await this.makeRequest(endpoint, options);
        } else {
          throw new Error('Authentication failed');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: data.success !== false,
        data: data.data || data,
        message: data.message,
      };
    } catch (error) {
      console.error('API request error:', error);
      return {
        success: false,
        error: error.message || 'Request failed',
      };
    }
  }

  /**
   * Status and Utility Methods
   */
  isAuthenticated(): boolean {
    return !!this.authTokens && this.authTokens.expiresAt > Date.now();
  }

  getCurrentUser(): User | null {
    return this.authTokens?.user || null;
  }

  getConnectionStatus(): {
    wsConnected: boolean;
    authenticated: boolean;
    userId: string | null;
  } {
    return {
      wsConnected: this.wsConnection?.readyState === WebSocket.OPEN,
      authenticated: this.isAuthenticated(),
      userId: this.authTokens?.user.id || null,
    };
  }

  async syncWithPlatform(data: any): Promise<ApiResponse<void>> {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.sendWebSocketMessage({
        type: 'sync:request',
        data,
      });
      return { success: true };
    } else {
      return {
        success: false,
        error: 'WebSocket not connected',
      };
    }
  }
}

// Export singleton instance
export const recoderClient = RecoderBackendClient.getInstance();

// For backward compatibility with existing code
export const dualPlatformClient = recoderClient;

// Export convenience functions
export const loginUser = (email: string, password: string) => 
  recoderClient.login(email, password);

export const registerUser = (userData: { name: string; email: string; password: string }) => 
  recoderClient.register(userData);

export const getProjects = (filters?: any) => 
  recoderClient.getProjects(filters);

export const getAgents = () => 
  recoderClient.getAgents();

export const generateCode = (request: GenerationRequest) => 
  recoderClient.generateCode(request);

export const getCurrentUser = () => 
  recoderClient.getCurrentUser();

export const isAuthenticated = () => 
  recoderClient.isAuthenticated();

export const logout = () => 
  recoderClient.logout();

export default recoderClient;