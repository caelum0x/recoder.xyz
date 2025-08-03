/**
 * Enhanced API client for backend communication with comprehensive error handling
 * Provides type-safe methods for interacting with Recoder backend services
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { ConfigManager } from '../utils/config';
import { Logger } from '@recoder/shared';
import { getAuthHeaders, handleAuthError } from '../utils/auth';
import { ValidationHelper } from '../utils/validation';
import chalk from 'chalk';
import ora from 'ora';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
    suggestions?: string[];
  };
  message?: string;
  meta?: {
    requestId: string;
    timestamp: string;
    version: string;
    performance?: {
      duration: number;
      size: number;
    };
  };
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RequestOptions extends AxiosRequestConfig {
  authenticated?: boolean;
  retries?: number;
  timeout?: number;
  showSpinner?: boolean;
  spinnerText?: string;
  validate?: boolean;
  cache?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
}

// Enhanced data interfaces
export interface ProjectData {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'mobile' | 'blockchain' | 'ai' | 'fullstack' | 'api';
  framework: string;
  language: string;
  structure: ProjectStructure;
  dependencies: string[];
  features: string[];
  integrations: string[];
  status: 'planning' | 'development' | 'testing' | 'deployed' | 'archived';
  created_at: string;
  updated_at: string;
  owner_id: string;
  team_members: string[];
  configuration: Record<string, any>;
}

export interface ProjectStructure {
  directories: Array<{
    name: string;
    path: string;
    type: 'directory' | 'file';
    permissions?: string;
    size?: number;
    modified?: string;
    children?: ProjectStructure['directories'];
  }>;
  files: Array<{
    name: string;
    path: string;
    type: string;
    size: number;
    modified: string;
    content?: string;
    encoding?: string;
    checksum?: string;
  }>;
  metadata: {
    total_files: number;
    total_directories: number;
    total_size: number;
    languages: Array<{
      name: string;
      files: number;
      lines: number;
      bytes: number;
    }>;
    frameworks: string[];
    dependencies: string[];
  };
}

export interface AgentData {
  id: string;
  name: string;
  type: 'planner' | 'structure' | 'integration' | 'web' | 'mobile' | 'blockchain' | 'ai' | 'backend' | 'devops';
  description: string;
  capabilities: string[];
  configuration: Record<string, any>;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  version: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  usage_stats: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    average_response_time: number;
    last_used: string;
  };
}

export interface PlanData {
  id: string;
  name: string;
  description: string;
  project_id: string;
  requirements: Array<{
    id: string;
    description: string;
    type: 'functional' | 'non-functional' | 'technical' | 'business';
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  }>;
  architecture: {
    components: Array<{
      name: string;
      type: string;
      description: string;
      dependencies: string[];
      interfaces: string[];
    }>;
    data_flow: Array<{
      from: string;
      to: string;
      type: string;
      description: string;
    }>;
    infrastructure: {
      hosting: string;
      database: string;
      cache: string;
      cdn: string;
      monitoring: string;
    };
  };
  phases: Array<{
    id: string;
    name: string;
    description: string;
    order: number;
    estimated_duration: number;
    dependencies: string[];
    tasks: Array<{
      id: string;
      name: string;
      description: string;
      type: 'development' | 'testing' | 'deployment' | 'configuration';
      estimated_duration: number;
      assigned_to?: string;
      dependencies: string[];
      acceptance_criteria: string[];
    }>;
  }>;
  timeline: {
    total_duration: number;
    start_date: string;
    end_date: string;
    milestones: Array<{
      name: string;
      date: string;
      description: string;
      deliverables: string[];
    }>;
  };
  cost_analysis: {
    total_cost: number;
    breakdown: Array<{
      category: string;
      cost: number;
      description: string;
      recurring: boolean;
    }>;
    assumptions: string[];
  };
  risk_assessment: {
    overall_risk_score: number;
    risks: Array<{
      id: string;
      description: string;
      probability: number;
      impact: number;
      mitigation: string;
      contingency: string;
    }>;
  };
  success_metrics: Array<{
    name: string;
    description: string;
    target: string;
    measurement: string;
  }>;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'review' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
}

export interface ValidationResult {
  id: string;
  project_id: string;
  type: 'code' | 'integration' | 'security' | 'performance' | 'accessibility' | 'compliance';
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  score: number;
  max_score: number;
  percentage: number;
  issues: Array<{
    id: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    category: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    rule?: string;
    suggestion?: string;
    fix?: string;
    documentation?: string;
  }>;
  metrics: {
    total_checks: number;
    passed_checks: number;
    failed_checks: number;
    warnings: number;
    duration: number;
  };
  recommendations: Array<{
    priority: 'low' | 'medium' | 'high';
    category: string;
    description: string;
    action: string;
    estimated_effort: string;
  }>;
  created_at: string;
  expires_at?: string;
}

export interface TemplateData {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
  language: string;
  version: string;
  tags: string[];
  features: string[];
  structure: ProjectStructure;
  configuration: Record<string, any>;
  dependencies: Array<{
    name: string;
    version: string;
    type: 'production' | 'development' | 'peer' | 'optional';
    description?: string;
  }>;
  installation_steps: string[];
  usage_examples: Array<{
    name: string;
    description: string;
    code: string;
    language: string;
  }>;
  documentation: {
    readme: string;
    changelog: string;
    contributing: string;
    license: string;
  };
  created_at: string;
  updated_at: string;
  downloads: number;
  rating: number;
  reviews: number;
}

class ApiClient {
  private static instance: ApiClient;
  private client: AxiosInstance;
  private baseURL: string;
  private timeout: number;
  private retries: number;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private requestQueue: Map<string, Promise<any>> = new Map();
  private performanceMetrics: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();

  private constructor() {
    const apiConfig = ConfigManager.getApiConfig();
    this.baseURL = apiConfig.baseUrl;
    this.timeout = apiConfig.timeout;
    this.retries = apiConfig.retries;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder CLI/1.0.0',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication headers if available
        const authHeaders = getAuthHeaders();
        config.headers = { ...(config.headers as any), ...authHeaders };

        // Log requests in verbose mode
        if (ConfigManager.getPreference('verboseLogging')) {
          Logger.info(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }

        return config;
      },
      (error) => {
        Logger.error(`Request error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Log responses in verbose mode
        if (ConfigManager.getPreference('verboseLogging')) {
          Logger.info(`API Response: ${response.status} ${response.config.url}`);
        }

        return response;
      },
      (error) => {
        // Handle authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          handleAuthError(error);
        }

        // Log errors
        Logger.error(`API Error: ${error.response?.status} ${error.response?.statusText || error.message}`);
        
        return Promise.reject(error);
      }
    );
  }

  private async makeRequest<T = any>(
    method: string,
    url: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { 
      authenticated = true, 
      retries = this.retries, 
      timeout = this.timeout, 
      showSpinner = false,
      spinnerText = 'Loading...',
      validate = true,
      cache = false,
      cacheKey,
      cacheTTL = 300000, // 5 minutes default
      ...axiosConfig 
    } = options;

    const requestId = this.generateRequestId();
    const startTime = Date.now();
    let spinner: any = null;

    // Check authentication if required
    if (authenticated && !ConfigManager.isAuthenticated()) {
      return {
        success: false,
        error: {
          message: 'Authentication required. Please login first.',
          code: 'AUTH_REQUIRED',
          suggestions: ['Run: recoder auth login', 'Check your authentication status with: recoder auth status']
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };
    }

    // Check cache first
    if (cache && method.toLowerCase() === 'get') {
      const key = cacheKey || `${method}:${url}:${JSON.stringify(data)}`;
      const cached = this.getFromCache(key);
      if (cached) {
        Logger.debug(`Cache hit for ${key}`);
        return {
          success: true,
          data: cached,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            performance: {
              duration: Date.now() - startTime,
              size: JSON.stringify(cached).length
            }
          }
        };
      }
    }

    // Check for duplicate requests
    const requestKey = `${method}:${url}:${JSON.stringify(data)}`;
    if (this.requestQueue.has(requestKey)) {
      Logger.debug(`Duplicate request detected, waiting for existing request: ${requestKey}`);
      return await this.requestQueue.get(requestKey)!;
    }

    // Input validation
    if (validate && data) {
      try {
        ValidationHelper.validateRequestData(data, method, url);
      } catch (validationError: any) {
        return {
          success: false,
          error: {
            message: 'Invalid input data',
            code: 'VALIDATION_ERROR',
            details: validationError.message,
            suggestions: ['Check your input data format', 'Refer to API documentation']
          },
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
      }
    }

    // Show spinner if requested
    if (showSpinner) {
      spinner = ora(spinnerText).start();
    }

    const requestPromise = this.executeRequest<T>(method, url, data, axiosConfig, retries, timeout, requestId, startTime);
    
    // Store in queue to prevent duplicates
    this.requestQueue.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful GET requests
      if (cache && method.toLowerCase() === 'get' && result.success) {
        const key = cacheKey || `${method}:${url}:${JSON.stringify(data)}`;
        this.setCache(key, result.data, cacheTTL);
      }

      if (spinner) {
        if (result.success) {
          spinner.succeed(chalk.green('Request completed successfully'));
        } else {
          spinner.fail(chalk.red('Request failed'));
        }
      }

      return result;
    } catch (error: any) {
      if (spinner) {
        spinner.fail(chalk.red('Request failed'));
      }
      throw error;
    } finally {
      // Clean up
      this.requestQueue.delete(requestKey);
    }
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    data: any,
    axiosConfig: any,
    retries: number,
    timeout: number,
    requestId: string,
    startTime: number
  ): Promise<ApiResponse<T>> {
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const config: AxiosRequestConfig = {
          method: method as any,
          url,
          data,
          timeout,
          headers: {
            'X-Request-ID': requestId,
            'X-Attempt': attempt.toString(),
            ...axiosConfig.headers,
          },
          ...axiosConfig,
        };

        const response: AxiosResponse = await this.client.request(config);
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update performance metrics
        this.updatePerformanceMetrics(url, duration);

        return {
          success: true,
          data: response.data,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
            version: response.headers['x-api-version'] || '1.0.0',
            performance: {
              duration,
              size: JSON.stringify(response.data).length
            }
          }
        };
      } catch (error: any) {
        lastError = error;

        // Enhanced error logging
        Logger.error('API Request Failed', {
          requestId,
          attempt: attempt + 1,
          method,
          url,
          status: error.response?.status,
          message: error.message,
          code: error.code
        });

        // Don't retry authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          break;
        }

        // Don't retry client errors (4xx except 401/403)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break;
        }

        // Don't retry if this is the last attempt
        if (attempt >= retries) {
          break;
        }

        // Wait before retrying (exponential backoff with jitter)
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        Logger.debug(`Retrying request in ${delay}ms`, { requestId, attempt: attempt + 1 });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Format error response with helpful information
    const errorResponse = this.formatErrorResponse(lastError, requestId);
    
    // Show user-friendly error message
    this.displayUserError(errorResponse);

    return errorResponse;
  }

  private formatErrorResponse(error: any, requestId: string): ApiResponse {
    const response = error.response;
    const status = response?.status;
    const data = response?.data;

    let message = 'An unexpected error occurred';
    let code = 'UNKNOWN_ERROR';
    let suggestions: string[] = [];

    if (status) {
      switch (status) {
        case 400:
          message = 'Bad request - invalid input data';
          code = 'BAD_REQUEST';
          suggestions = ['Check your input data format', 'Validate required fields'];
          break;
        case 401:
          message = 'Authentication required';
          code = 'UNAUTHORIZED';
          suggestions = ['Run: recoder auth login', 'Check your API key'];
          break;
        case 403:
          message = 'Access denied - insufficient permissions';
          code = 'FORBIDDEN';
          suggestions = ['Check your account permissions', 'Contact support if needed'];
          break;
        case 404:
          message = 'Resource not found';
          code = 'NOT_FOUND';
          suggestions = ['Check the resource ID', 'Verify the endpoint URL'];
          break;
        case 429:
          message = 'Rate limit exceeded';
          code = 'RATE_LIMITED';
          suggestions = ['Wait before retrying', 'Consider upgrading your plan'];
          break;
        case 500:
          message = 'Server error';
          code = 'SERVER_ERROR';
          suggestions = ['Try again later', 'Check service status'];
          break;
        case 503:
          message = 'Service unavailable';
          code = 'SERVICE_UNAVAILABLE';
          suggestions = ['Try again later', 'Check service status'];
          break;
        default:
          message = data?.message || error.message || `HTTP ${status} error`;
          code = data?.code || 'HTTP_ERROR';
      }
    } else if (error.code === 'ECONNABORTED') {
      message = 'Request timeout';
      code = 'TIMEOUT';
      suggestions = ['Check your internet connection', 'Try again with a longer timeout'];
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      message = 'Unable to connect to server';
      code = 'CONNECTION_ERROR';
      suggestions = ['Check your internet connection', 'Verify the server URL'];
    } else {
      message = error.message || message;
      code = error.code || code;
    }

    return {
      success: false,
      error: {
        message,
        code,
        details: data?.details || error.details,
        suggestions
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  private displayUserError(errorResponse: ApiResponse): void {
    const error = errorResponse.error;
    if (!error) return;

    console.error(chalk.red.bold('❌ Request Failed'));
    console.error(chalk.red(`${error.message}`));
    
    if (error.code) {
      console.error(chalk.gray(`Error Code: ${error.code}`));
    }

    if (error.suggestions && error.suggestions.length > 0) {
      console.error(chalk.yellow('\n💡 Suggestions:'));
      error.suggestions.forEach(suggestion => {
        console.error(chalk.yellow(`  • ${suggestion}`));
      });
    }

    if (error.details) {
      console.error(chalk.gray(`\nDetails: ${JSON.stringify(error.details, null, 2)}`));
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private updatePerformanceMetrics(url: string, duration: number): void {
    const existing = this.performanceMetrics.get(url) || { count: 0, totalTime: 0, avgTime: 0 };
    existing.count++;
    existing.totalTime += duration;
    existing.avgTime = existing.totalTime / existing.count;
    this.performanceMetrics.set(url, existing);
  }

  // HTTP Methods
  public async get<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('GET', url, undefined, options);
  }

  public async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('POST', url, data, options);
  }

  public async put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('PUT', url, data, options);
  }

  public async patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('PATCH', url, data, options);
  }

  public async delete<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('DELETE', url, undefined, options);
  }

  // Specialized methods
  public async getPaginated<T = any>(
    url: string,
    params?: { page?: number; limit?: number; [key: string]: any },
    options?: RequestOptions
  ): Promise<ApiResponse<PaginatedResponse<T>>> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const fullUrl = queryParams.toString() ? `${url}?${queryParams.toString()}` : url;
    return this.get<PaginatedResponse<T>>(fullUrl, options);
  }

  public async upload<T = any>(
    url: string,
    file: File | Buffer,
    filename?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    
    if (file instanceof Buffer) {
      formData.append('file', new Blob([file]), filename || 'file');
    } else {
      formData.append('file', file, filename);
    }

    return this.makeRequest<T>('POST', url, formData, {
      ...options,
      headers: {
        'Content-Type': 'multipart/form-data',
        ...options?.headers,
      },
    });
  }

  public async download(url: string, options?: RequestOptions): Promise<ApiResponse<Buffer>> {
    return this.makeRequest<Buffer>('GET', url, undefined, {
      ...options,
      responseType: 'arraybuffer',
    });
  }

  // Health check
  public async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.get('/health', { authenticated: false });
  }

  // Configuration methods
  public updateBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
    ConfigManager.set('api.baseUrl', baseURL);
  }

  public updateTimeout(timeout: number): void {
    this.timeout = timeout;
    this.client.defaults.timeout = timeout;
    ConfigManager.set('api.timeout', timeout);
  }

  public updateRetries(retries: number): void {
    this.retries = retries;
    ConfigManager.set('api.retries', retries);
  }

  public getConfig(): { baseURL: string; timeout: number; retries: number } {
    return {
      baseURL: this.baseURL,
      timeout: this.timeout,
      retries: this.retries,
    };
  }

  // Utility methods
  public isOnline(): boolean {
    // For Node.js environment, assume online
    return true;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.healthCheck();
      return response.success;
    } catch {
      return false;
    }
  }

  // Raw axios client access for advanced use cases
  public getAxiosInstance(): AxiosInstance {
    return this.client;
  }

  // Project API Methods
  public async createProject(projectData: Partial<ProjectData>): Promise<ApiResponse<ProjectData>> {
    return this.post<ProjectData>('/projects', projectData, {
      showSpinner: true,
      spinnerText: 'Creating project...',
      validate: true
    });
  }

  public async getProject(projectId: string): Promise<ApiResponse<ProjectData>> {
    return this.get<ProjectData>(`/projects/${projectId}`, {
      cache: true,
      cacheTTL: 300000 // 5 minutes
    });
  }

  public async updateProject(projectId: string, updates: Partial<ProjectData>): Promise<ApiResponse<ProjectData>> {
    return this.patch<ProjectData>(`/projects/${projectId}`, updates, {
      showSpinner: true,
      spinnerText: 'Updating project...',
      validate: true
    });
  }

  public async deleteProject(projectId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/projects/${projectId}`, {
      showSpinner: true,
      spinnerText: 'Deleting project...'
    });
  }

  public async listProjects(filters?: { type?: string; framework?: string; language?: string; status?: string }): Promise<ApiResponse<ProjectData[]>> {
    const response = await this.getPaginated<ProjectData>('/projects', filters, {
      cache: true,
      cacheTTL: 180000 // 3 minutes
    });
    return { ...response, data: response.data?.data || [] };
  }

  public async analyzeProject(projectId: string, options?: { depth?: number; includeTests?: boolean }): Promise<ApiResponse<any>> {
    return this.post<any>(`/projects/${projectId}/analyze`, options, {
      showSpinner: true,
      spinnerText: 'Analyzing project...',
      timeout: 60000 // 1 minute timeout for analysis
    });
  }

  public async generateProjectCode(projectId: string, requirements: any): Promise<ApiResponse<{ files: any[]; structure: ProjectStructure }>> {
    return this.post<{ files: any[]; structure: ProjectStructure }>(`/projects/${projectId}/generate`, requirements, {
      showSpinner: true,
      spinnerText: 'Generating code...',
      timeout: 120000 // 2 minutes timeout for code generation
    });
  }

  public async deployProject(projectId: string, deploymentConfig: any): Promise<ApiResponse<any>> {
    return this.post<any>(`/projects/${projectId}/deploy`, deploymentConfig, {
      showSpinner: true,
      spinnerText: 'Deploying project...',
      timeout: 300000 // 5 minutes timeout for deployment
    });
  }

  // Agent API Methods
  public async createAgent(agentData: Partial<AgentData>): Promise<ApiResponse<AgentData>> {
    return this.post<AgentData>('/agents', agentData, {
      showSpinner: true,
      spinnerText: 'Creating agent...',
      validate: true
    });
  }

  public async getAgent(agentId: string): Promise<ApiResponse<AgentData>> {
    return this.get<AgentData>(`/agents/${agentId}`, {
      cache: true,
      cacheTTL: 300000
    });
  }

  public async updateAgent(agentId: string, updates: Partial<AgentData>): Promise<ApiResponse<AgentData>> {
    return this.patch<AgentData>(`/agents/${agentId}`, updates, {
      showSpinner: true,
      spinnerText: 'Updating agent...',
      validate: true
    });
  }

  public async deleteAgent(agentId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/agents/${agentId}`, {
      showSpinner: true,
      spinnerText: 'Deleting agent...'
    });
  }

  public async listAgents(filters?: { type?: string; status?: string }): Promise<ApiResponse<AgentData[]>> {
    const response = await this.getPaginated<AgentData>('/agents', filters, {
      cache: true,
      cacheTTL: 180000
    });
    return { ...response, data: response.data?.data || [] };
  }

  public async configureAgent(agentId: string, configuration: any): Promise<ApiResponse<AgentData>> {
    return this.post<AgentData>(`/agents/${agentId}/configure`, configuration, {
      showSpinner: true,
      spinnerText: 'Configuring agent...',
      validate: true
    });
  }

  public async getAgentUsageStats(agentId: string): Promise<ApiResponse<any>> {
    return this.get<any>(`/agents/${agentId}/stats`, {
      cache: true,
      cacheTTL: 60000 // 1 minute
    });
  }

  // Planning API Methods
  public async createPlan(planData: Partial<PlanData>): Promise<ApiResponse<PlanData>> {
    return this.post<PlanData>('/planner/plans', planData, {
      showSpinner: true,
      spinnerText: 'Creating plan...',
      validate: true,
      timeout: 60000
    });
  }

  public async getPlan(planId: string): Promise<ApiResponse<PlanData>> {
    return this.get<PlanData>(`/planner/plans/${planId}`, {
      cache: true,
      cacheTTL: 300000
    });
  }

  public async updatePlan(planId: string, updates: Partial<PlanData>): Promise<ApiResponse<PlanData>> {
    return this.patch<PlanData>(`/planner/plans/${planId}`, updates, {
      showSpinner: true,
      spinnerText: 'Updating plan...',
      validate: true
    });
  }

  public async deletePlan(planId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/planner/plans/${planId}`, {
      showSpinner: true,
      spinnerText: 'Deleting plan...'
    });
  }

  public async listPlans(filters?: { project_id?: string; status?: string }): Promise<ApiResponse<PlanData[]>> {
    const response = await this.getPaginated<PlanData>('/planner/plans', filters, {
      cache: true,
      cacheTTL: 180000
    });
    return { ...response, data: response.data?.data || [] };
  }

  public async executePlan(planId: string, options?: { dryRun?: boolean; environment?: string }): Promise<ApiResponse<any>> {
    return this.post<any>(`/planner/plans/${planId}/execute`, options, {
      showSpinner: true,
      spinnerText: 'Executing plan...',
      timeout: 600000 // 10 minutes timeout for plan execution
    });
  }

  public async validatePlan(planId: string): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/planner/plans/${planId}/validate`, {}, {
      showSpinner: true,
      spinnerText: 'Validating plan...',
      timeout: 120000
    });
  }

  public async getPlanExecutionStatus(planId: string, executionId: string): Promise<ApiResponse<any>> {
    return this.get<any>(`/planner/plans/${planId}/executions/${executionId}`, {
      cache: false
    });
  }

  public async simulatePlan(planId: string, scenarios?: any): Promise<ApiResponse<any>> {
    return this.post<any>(`/planner/plans/${planId}/simulate`, scenarios, {
      showSpinner: true,
      spinnerText: 'Simulating plan...',
      timeout: 180000
    });
  }

  // Validation API Methods
  public async validateCode(projectId: string, options?: { type?: string; strict?: boolean }): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/code/${projectId}`, options, {
      showSpinner: true,
      spinnerText: 'Validating code...',
      timeout: 120000
    });
  }

  public async validateIntegration(projectId: string, integrationId: string): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/integration/${projectId}/${integrationId}`, {}, {
      showSpinner: true,
      spinnerText: 'Validating integration...',
      timeout: 180000
    });
  }

  public async validateSecurity(projectId: string): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/security/${projectId}`, {}, {
      showSpinner: true,
      spinnerText: 'Running security validation...',
      timeout: 300000
    });
  }

  public async validatePerformance(projectId: string): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/performance/${projectId}`, {}, {
      showSpinner: true,
      spinnerText: 'Running performance validation...',
      timeout: 300000
    });
  }

  public async validateAccessibility(projectId: string): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/accessibility/${projectId}`, {}, {
      showSpinner: true,
      spinnerText: 'Running accessibility validation...',
      timeout: 180000
    });
  }

  public async validateCompliance(projectId: string, standards: string[]): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>(`/validation/compliance/${projectId}`, { standards }, {
      showSpinner: true,
      spinnerText: 'Running compliance validation...',
      timeout: 300000
    });
  }

  public async getValidationHistory(projectId: string, type?: string): Promise<ApiResponse<ValidationResult[]>> {
    const params = type ? { type } : {};
    const response = await this.getPaginated<ValidationResult>(`/validation/history/${projectId}`, params, {
      cache: true,
      cacheTTL: 300000
    });
    return { ...response, data: response.data?.data || [] };
  }

  // Template API Methods
  public async getTemplates(filters?: { category?: string; framework?: string; language?: string }): Promise<ApiResponse<TemplateData[]>> {
    const response = await this.getPaginated<TemplateData>('/templates', filters, {
      cache: true,
      cacheTTL: 600000 // 10 minutes
    });
    return { ...response, data: response.data?.data || [] };
  }

  public async getTemplate(templateId: string): Promise<ApiResponse<TemplateData>> {
    return this.get<TemplateData>(`/templates/${templateId}`, {
      cache: true,
      cacheTTL: 600000
    });
  }

  public async createTemplate(templateData: Partial<TemplateData>): Promise<ApiResponse<TemplateData>> {
    return this.post<TemplateData>('/templates', templateData, {
      showSpinner: true,
      spinnerText: 'Creating template...',
      validate: true
    });
  }

  public async updateTemplate(templateId: string, updates: Partial<TemplateData>): Promise<ApiResponse<TemplateData>> {
    return this.patch<TemplateData>(`/templates/${templateId}`, updates, {
      showSpinner: true,
      spinnerText: 'Updating template...',
      validate: true
    });
  }

  public async deleteTemplate(templateId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/templates/${templateId}`, {
      showSpinner: true,
      spinnerText: 'Deleting template...'
    });
  }

  public async downloadTemplate(templateId: string): Promise<ApiResponse<Buffer>> {
    return this.download(`/templates/${templateId}/download`, {
      showSpinner: true,
      spinnerText: 'Downloading template...'
    });
  }

  public async searchTemplates(query: string, filters?: any): Promise<ApiResponse<TemplateData[]>> {
    const response = await this.getPaginated<TemplateData>('/templates/search', { query, ...filters }, {
      cache: true,
      cacheTTL: 300000
    });
    return { ...response, data: response.data?.data || [] };
  }

  // Structure API Methods
  public async analyzeStructure(projectPath: string): Promise<ApiResponse<ProjectStructure>> {
    return this.post<ProjectStructure>('/structure/analyze', { projectPath }, {
      showSpinner: true,
      spinnerText: 'Analyzing project structure...',
      timeout: 60000
    });
  }

  public async generateStructure(type: string, options: any): Promise<ApiResponse<ProjectStructure>> {
    return this.post<ProjectStructure>('/structure/generate', { type, options }, {
      showSpinner: true,
      spinnerText: 'Generating project structure...',
      validate: true
    });
  }

  public async validateStructure(structure: ProjectStructure): Promise<ApiResponse<ValidationResult>> {
    return this.post<ValidationResult>('/structure/validate', { structure }, {
      showSpinner: true,
      spinnerText: 'Validating project structure...',
      validate: true
    });
  }

  public async optimizeStructure(structure: ProjectStructure): Promise<ApiResponse<ProjectStructure>> {
    return this.post<ProjectStructure>('/structure/optimize', { structure }, {
      showSpinner: true,
      spinnerText: 'Optimizing project structure...',
      validate: true
    });
  }

  public async compareStructures(structure1: ProjectStructure, structure2: ProjectStructure): Promise<ApiResponse<any>> {
    return this.post<any>('/structure/compare', { structure1, structure2 }, {
      showSpinner: true,
      spinnerText: 'Comparing project structures...',
      validate: true
    });
  }

  // Utility Methods
  public async getPerformanceMetrics(): Promise<Map<string, { count: number; totalTime: number; avgTime: number }>> {
    return new Map(this.performanceMetrics);
  }

  public async clearCache(): Promise<void> {
    this.cache.clear();
    Logger.info('API cache cleared');
  }

  public async getCacheStats(): Promise<{ size: number; keys: string[] }> {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  public async exportLogs(): Promise<string> {
    // This would typically export logs to a file
    return JSON.stringify({
      performanceMetrics: Object.fromEntries(this.performanceMetrics),
      cacheStats: await this.getCacheStats(),
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}

// Export singleton instance
export const apiClient = ApiClient.getInstance();

// Export class for testing
export { ApiClient };

// Types are already exported above