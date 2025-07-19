/**
 * AI Model Integration Hub - Type Definitions
 */

export interface ModelCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  documentation: boolean;
  debugging: boolean;
  refactoring: boolean;
  security: boolean;
  translation: boolean;
  planning: boolean;
  analysis: boolean;
  chat: boolean;
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  reasoning: boolean;
}

export interface ModelLimits {
  maxContextLength: number;
  maxOutputTokens: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  costPerInputToken?: number;
  costPerOutputToken?: number;
}

export interface ModelMetadata {
  id: string;
  name: string;
  displayName: string;
  provider: ModelProvider;
  type: ModelType;
  version: string;
  description: string;
  capabilities: ModelCapabilities;
  limits: ModelLimits;
  languages?: string[];
  specializations?: ModelSpecialization[];
  isLocal: boolean;
  isAvailable: boolean;
  priority: number;
  tags: string[];
  releaseDate?: Date;
  deprecated?: boolean;
}

export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  MISTRAL = 'mistral',
  PERPLEXITY = 'perplexity',
  COHERE = 'cohere',
  OLLAMA = 'ollama',
  HUGGINGFACE = 'huggingface',
  CUSTOM = 'custom'
}

export enum ModelType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  CODE = 'code',
  EMBEDDING = 'embedding',
  VISION = 'vision',
  REASONING = 'reasoning',
  SPECIALIZED = 'specialized'
}

export enum ModelSpecialization {
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  TYPESCRIPT = 'typescript',
  RUST = 'rust',
  GO = 'go',
  JAVA = 'java',
  CPP = 'cpp',
  CSHARP = 'csharp',
  PHP = 'php',
  RUBY = 'ruby',
  SWIFT = 'swift',
  KOTLIN = 'kotlin',
  SOLIDITY = 'solidity',
  SQL = 'sql',
  HTML = 'html',
  CSS = 'css',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  ARCHITECTURE = 'architecture',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  DEVOPS = 'devops',
  DATA_SCIENCE = 'data_science',
  MACHINE_LEARNING = 'machine_learning',
  WEB_DEVELOPMENT = 'web_development',
  MOBILE_DEVELOPMENT = 'mobile_development',
  BLOCKCHAIN = 'blockchain',
  CLOUD = 'cloud'
}

export interface ModelRequest {
  id: string;
  model: string;
  messages: ChatMessage[];
  options: ModelRequestOptions;
  context?: RequestContext;
  timestamp: Date;
}

export interface ModelRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  functionCalling?: boolean;
  tools?: Tool[];
  responseFormat?: 'text' | 'json' | 'code' | 'markdown';
  systemPrompt?: string;
}

export interface RequestContext {
  projectPath?: string;
  language?: string;
  framework?: string;
  task: TaskType;
  priority: TaskPriority;
  privacyLevel: PrivacyLevel;
  timeoutMs?: number;
  retryCount?: number;
  fallbackModels?: string[];
}

export enum TaskType {
  CODE_GENERATION = 'code_generation',
  CODE_REVIEW = 'code_review',
  DEBUGGING = 'debugging',
  REFACTORING = 'refactoring',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  SECURITY_ANALYSIS = 'security_analysis',
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  ARCHITECTURE_PLANNING = 'architecture_planning',
  PROJECT_ANALYSIS = 'project_analysis',
  CHAT = 'chat',
  TRANSLATION = 'translation',
  EXPLANATION = 'explanation',
  CUSTOM = 'custom'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum PrivacyLevel {
  PUBLIC = 'public',        // Can use any model including cloud
  INTERNAL = 'internal',    // Prefer local models, cloud allowed with encryption
  CONFIDENTIAL = 'confidential', // Local models only, no cloud
  RESTRICTED = 'restricted' // Specific approved models only
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: FunctionCall;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  timestamp: Date;
  model?: string;
  tokens?: number;
  cost?: number;
  responseTime?: number;
  confidence?: number;
  cached?: boolean;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ModelResponse {
  id: string;
  model: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage: TokenUsage;
  metadata: ResponseMetadata;
  functionCalls?: FunctionCall[];
  error?: ModelError;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
  cached?: boolean;
}

export interface ResponseMetadata {
  model: string;
  provider: ModelProvider;
  timestamp: Date;
  responseTime: number;
  requestId: string;
  cached: boolean;
  fallbackUsed: boolean;
  originalModel?: string;
  quality?: ResponseQuality;
}

export interface ResponseQuality {
  score: number;
  confidence: number;
  coherence: number;
  relevance: number;
  accuracy: number;
  completeness: number;
}

export interface ModelError {
  code: string;
  message: string;
  type: ErrorType;
  retryable: boolean;
  details?: Record<string, any>;
}

export enum ErrorType {
  API_ERROR = 'api_error',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MODEL_UNAVAILABLE = 'model_unavailable',
  INVALID_REQUEST = 'invalid_request',
  AUTHENTICATION = 'authentication',
  PERMISSION_DENIED = 'permission_denied',
  CONTENT_FILTER = 'content_filter',
  TIMEOUT = 'timeout',
  NETWORK_ERROR = 'network_error',
  INTERNAL_ERROR = 'internal_error',
  UNKNOWN = 'unknown'
}

export interface ModelHealth {
  model: string;
  status: HealthStatus;
  availability: number;
  averageResponseTime: number;
  errorRate: number;
  lastChecked: Date;
  issues?: string[];
  metrics: HealthMetrics;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
  UNKNOWN = 'unknown'
}

export interface HealthMetrics {
  uptime: number;
  requestCount: number;
  successRate: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface ModelUsageStats {
  model: string;
  period: StatsPeriod;
  requests: number;
  tokens: TokenUsageStats;
  cost: number;
  averageResponseTime: number;
  errorRate: number;
  popularTasks: Array<{ task: TaskType; count: number }>;
  qualityScore: number;
}

export interface TokenUsageStats {
  input: number;
  output: number;
  total: number;
  cached: number;
}

export enum StatsPeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year'
}

export interface ModelConfiguration {
  apiKey?: string;
  apiUrl?: string;
  organizationId?: string;
  enabled: boolean;
  priority: number;
  maxConcurrency: number;
  timeout: number;
  retryCount: number;
  customHeaders?: Record<string, string>;
  rateLimiting?: RateLimitConfig;
  caching?: CacheConfig;
  monitoring?: MonitoringConfig;
}

export interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  tokensPerMinute?: number;
  burstSize?: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'lfu' | 'ttl';
}

export interface MonitoringConfig {
  enabled: boolean;
  logRequests: boolean;
  logResponses: boolean;
  metrics: boolean;
  alerts: AlertConfig[];
}

export interface AlertConfig {
  type: 'error_rate' | 'response_time' | 'quota' | 'availability';
  threshold: number;
  duration: number;
  channels: string[];
}

export interface ModelRoutingRule {
  id: string;
  name: string;
  condition: RoutingCondition;
  action: RoutingAction;
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  task?: TaskType[];
  language?: string[];
  privacyLevel?: PrivacyLevel[];
  tokenCount?: { min?: number; max?: number };
  time?: { start: string; end: string; timezone?: string };
  models?: { include?: string[]; exclude?: string[] };
}

export interface RoutingAction {
  type: 'route' | 'fallback' | 'reject' | 'transform';
  models: string[];
  options?: ModelRequestOptions;
  transformPrompt?: string;
}

export interface HybridProcessingConfig {
  enabled: boolean;
  localFirst: boolean;
  consensusThreshold: number;
  maxModels: number;
  votingStrategy: 'majority' | 'weighted' | 'quality' | 'custom';
  fallbackChain: string[];
}

export interface StreamingResponse {
  id: string;
  model: string;
  delta: string;
  finished: boolean;
  usage?: Partial<TokenUsage>;
  metadata?: Partial<ResponseMetadata>;
}

export interface ModelProviderConfig {
  provider: ModelProvider;
  baseUrl?: string;
  apiKey?: string;
  organization?: string;
  models: ModelMetadata[];
  defaultOptions: ModelRequestOptions;
  healthCheck: {
    endpoint: string;
    interval: number;
    timeout: number;
  };
}

export interface LocalModelConfig {
  enabled: boolean;
  ollama: {
    host: string;
    port: number;
    timeout: number;
    autoInstall: boolean;
    modelPath?: string;
    gpu: boolean;
    quantization?: 'q4_0' | 'q4_1' | 'q5_0' | 'q5_1' | 'q8_0' | 'f16' | 'f32';
  };
  docker: {
    enabled: boolean;
    image: string;
    containerName: string;
    ports: Record<string, number>;
    volumes: Record<string, string>;
    environment: Record<string, string>;
  };
}

export interface ModelRecommendation {
  model: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    model: string;
    score: number;
    reason: string;
  }>;
  estimated: {
    responseTime: number;
    cost: number;
    quality: number;
  };
}