/**
 * ADVANCED CODE GENERATION TEMPLATES
 * AI-powered template system with enterprise features
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TemplateEngine } from './template-engine';
import { AIProviderRouter } from '../providers/ai-router';
import { SecurityEngine } from '../security/enterprise-security';
import { AnalyticsEngine } from '../monitoring/analytics-engine';

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string[];
  framework?: string[];
  complexity: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  tags: string[];
  aiOptimized: boolean;
  enterpriseReady: boolean;
  securityLevel: 'basic' | 'enhanced' | 'enterprise';
  version: string;
  author: string;
  license: string;
  dependencies?: string[];
  requirements?: string[];
  estimatedTime: number; // minutes
}

export interface GenerationContext {
  projectName: string;
  language: string;
  framework?: string;
  features: string[];
  architecture: 'monolith' | 'microservices' | 'serverless' | 'hybrid';
  deployment: 'local' | 'cloud' | 'hybrid';
  database?: string;
  authentication?: string;
  testing: boolean;
  documentation: boolean;
  cicd: boolean;
  monitoring: boolean;
  security: 'basic' | 'enhanced' | 'enterprise';
  scalability: 'small' | 'medium' | 'large' | 'enterprise';
  customizations?: Record<string, any>;
}

export interface GeneratedCode {
  files: Array<{
    path: string;
    content: string;
    language: string;
    description: string;
    dependencies?: string[];
  }>;
  instructions: string[];
  setupCommands: string[];
  testCommands: string[];
  deploymentCommands: string[];
  documentation: string;
  estimatedTime: number;
  securityNotes: string[];
  performanceNotes: string[];
}

export class AdvancedCodeGenerator extends EventEmitter {
  private templates = new Map<string, TemplateConfig>();
  private templateEngine: TemplateEngine;
  private aiRouter: AIProviderRouter;
  private security: SecurityEngine;
  private analytics: AnalyticsEngine;
  private cacheEnabled = true;
  private generationCache = new Map<string, GeneratedCode>();

  constructor() {
    super();
    this.templateEngine = new TemplateEngine();
    this.aiRouter = new AIProviderRouter();
    this.security = new SecurityEngine();
    this.analytics = new AnalyticsEngine();
    
    console.log('🏗️ Advanced Code Generator initialized');
  }

  async initialize(): Promise<void> {
    try {
      await this.loadBuiltInTemplates();
      await this.loadUserTemplates();
      await this.setupAIProviders();
      
      console.log(`✅ Code Generator ready with ${this.templates.size} templates`);
    } catch (error) {
      console.error('❌ Failed to initialize Code Generator:', error);
      throw error;
    }
  }

  private async loadBuiltInTemplates(): Promise<void> {
    const builtInTemplates: TemplateConfig[] = [
      {
        id: 'react-enterprise-app',
        name: 'React Enterprise Application',
        description: 'Full-stack React application with TypeScript, authentication, testing, and deployment',
        category: 'web',
        language: ['typescript', 'javascript'],
        framework: ['react', 'next.js'],
        complexity: 'expert',
        tags: ['frontend', 'spa', 'enterprise', 'production-ready'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enterprise',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['react', 'typescript', 'next.js', 'tailwindcss', 'prisma'],
        requirements: ['Node.js 18+', 'PostgreSQL/MySQL'],
        estimatedTime: 30
      },
      {
        id: 'node-microservice',
        name: 'Node.js Microservice',
        description: 'Production-ready microservice with API, database, testing, and monitoring',
        category: 'backend',
        language: ['typescript', 'javascript'],
        framework: ['express', 'fastify'],
        complexity: 'advanced',
        tags: ['backend', 'api', 'microservice', 'production-ready'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enterprise',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['express', 'typescript', 'prisma', 'jest'],
        requirements: ['Node.js 18+', 'Database'],
        estimatedTime: 25
      },
      {
        id: 'python-ai-service',
        name: 'Python AI/ML Service',
        description: 'FastAPI-based AI service with ML models, authentication, and monitoring',
        category: 'ai',
        language: ['python'],
        framework: ['fastapi', 'tensorflow', 'pytorch'],
        complexity: 'expert',
        tags: ['ai', 'ml', 'api', 'production-ready'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enterprise',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['fastapi', 'tensorflow', 'uvicorn', 'pydantic'],
        requirements: ['Python 3.9+', 'CUDA (optional)'],
        estimatedTime: 45
      },
      {
        id: 'react-native-app',
        name: 'React Native Mobile App',
        description: 'Cross-platform mobile app with navigation, state management, and native features',
        category: 'mobile',
        language: ['typescript', 'javascript'],
        framework: ['react-native', 'expo'],
        complexity: 'advanced',
        tags: ['mobile', 'cross-platform', 'production-ready'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enhanced',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['react-native', 'expo', 'react-navigation'],
        requirements: ['Node.js 18+', 'Xcode/Android Studio'],
        estimatedTime: 35
      },
      {
        id: 'solana-dapp',
        name: 'Solana DApp',
        description: 'Complete Solana decentralized application with smart contracts and web interface',
        category: 'blockchain',
        language: ['rust', 'typescript'],
        framework: ['anchor', 'react'],
        complexity: 'expert',
        tags: ['blockchain', 'solana', 'defi', 'web3'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enterprise',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['anchor', 'solana-web3.js', 'react'],
        requirements: ['Rust', 'Solana CLI', 'Node.js'],
        estimatedTime: 60
      },
      {
        id: 'kubernetes-deployment',
        name: 'Kubernetes Deployment',
        description: 'Complete K8s deployment with ingress, monitoring, and auto-scaling',
        category: 'devops',
        language: ['yaml', 'bash'],
        framework: ['kubernetes', 'helm'],
        complexity: 'expert',
        tags: ['devops', 'kubernetes', 'deployment', 'production'],
        aiOptimized: true,
        enterpriseReady: true,
        securityLevel: 'enterprise',
        version: '1.0.0',
        author: 'Recoder.xyz',
        license: 'MIT',
        dependencies: ['kubernetes', 'helm', 'prometheus'],
        requirements: ['Kubernetes cluster', 'kubectl', 'helm'],
        estimatedTime: 40
      }
    ];

    builtInTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });

    console.log(`📚 Loaded ${builtInTemplates.length} built-in templates`);
  }

  private async loadUserTemplates(): Promise<void> {
    try {
      const userTemplatesPath = path.join(process.cwd(), '.recoder', 'templates');
      const templateFiles = await fs.readdir(userTemplatesPath).catch(() => []);
      
      for (const file of templateFiles) {
        if (file.endsWith('.template.json')) {
          const templatePath = path.join(userTemplatesPath, file);
          const templateData = await fs.readFile(templatePath, 'utf-8');
          const template: TemplateConfig = JSON.parse(templateData);
          this.templates.set(template.id, template);
        }
      }

      console.log(`👤 Loaded ${templateFiles.length} user templates`);
    } catch (error) {
      console.log('📁 No user templates directory found');
    }
  }

  private async setupAIProviders(): Promise<void> {
    await this.aiRouter.initialize();
    console.log('🤖 AI providers configured for code generation');
  }

  async generateCode(templateId: string, context: GenerationContext): Promise<GeneratedCode> {
    const startTime = Date.now();
    
    try {
      console.log(`🏗️ Generating code for template: ${templateId}`);
      
      // Security validation
      await this.security.validateGenerationRequest(templateId, context);
      
      // Check cache
      const cacheKey = this.getCacheKey(templateId, context);
      if (this.cacheEnabled && this.generationCache.has(cacheKey)) {
        console.log('⚡ Returning cached generation');
        return this.generationCache.get(cacheKey)!;
      }

      // Get template
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Validate context against template
      this.validateContext(template, context);

      // Generate code using AI
      const generated = await this.performAIGeneration(template, context);

      // Post-process and validate
      const finalCode = await this.postProcessGeneration(generated, template, context);

      // Cache result
      if (this.cacheEnabled) {
        this.generationCache.set(cacheKey, finalCode);
      }

      // Track analytics
      const duration = Date.now() - startTime;
      this.analytics.trackCodeGeneration(templateId, context, duration, 'success');

      console.log(`✅ Code generation completed in ${duration}ms`);
      return finalCode;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.analytics.trackCodeGeneration(templateId, context, duration, 'error', error.message);
      console.error(`❌ Code generation failed for ${templateId}:`, error);
      throw error;
    }
  }

  private validateContext(template: TemplateConfig, context: GenerationContext): void {
    // Validate language compatibility
    if (!template.language.includes(context.language)) {
      throw new Error(`Template ${template.id} does not support language: ${context.language}`);
    }

    // Validate framework compatibility
    if (context.framework && template.framework && !template.framework.includes(context.framework)) {
      throw new Error(`Template ${template.id} does not support framework: ${context.framework}`);
    }

    // Validate security level
    const securityLevels = { basic: 1, enhanced: 2, enterprise: 3 };
    const templateLevel = securityLevels[template.securityLevel];
    const contextLevel = securityLevels[context.security];
    
    if (contextLevel > templateLevel) {
      throw new Error(`Template ${template.id} does not meet required security level: ${context.security}`);
    }
  }

  private async performAIGeneration(template: TemplateConfig, context: GenerationContext): Promise<GeneratedCode> {
    const prompt = this.buildGenerationPrompt(template, context);
    
    // Use the best AI provider for this type of generation
    const provider = await this.aiRouter.selectProvider({
      task: 'code-generation',
      complexity: template.complexity,
      language: context.language,
      estimatedTokens: this.estimateTokens(template, context)
    });

    console.log(`🤖 Using ${provider.name} for code generation`);

    const response = await provider.generateCode(prompt, {
      maxTokens: 8000,
      temperature: 0.3,
      model: provider.getBestModel('code-generation')
    });

    return this.parseAIResponse(response);
  }

  private buildGenerationPrompt(template: TemplateConfig, context: GenerationContext): string {
    return `# Advanced Code Generation Request

## Template Information
- **Template**: ${template.name}
- **Description**: ${template.description}
- **Category**: ${template.category}
- **Complexity**: ${template.complexity}
- **Security Level**: ${template.securityLevel}

## Project Context
- **Project Name**: ${context.projectName}
- **Language**: ${context.language}
- **Framework**: ${context.framework || 'None specified'}
- **Architecture**: ${context.architecture}
- **Deployment**: ${context.deployment}
- **Database**: ${context.database || 'None specified'}
- **Authentication**: ${context.authentication || 'None specified'}
- **Security Level**: ${context.security}
- **Scalability**: ${context.scalability}

## Required Features
${context.features.map(f => `- ${f}`).join('\n')}

## Additional Requirements
- **Testing**: ${context.testing ? 'Required' : 'Optional'}
- **Documentation**: ${context.documentation ? 'Required' : 'Optional'}
- **CI/CD**: ${context.cicd ? 'Required' : 'Optional'}
- **Monitoring**: ${context.monitoring ? 'Required' : 'Optional'}

## Custom Configuration
${context.customizations ? JSON.stringify(context.customizations, null, 2) : 'None'}

## Generation Instructions

Generate a complete, production-ready codebase that includes:

1. **Core Application Files**: Complete implementation with all specified features
2. **Configuration Files**: All necessary config files (package.json, tsconfig.json, etc.)
3. **Database Schema**: If database is specified, include complete schema
4. **Authentication System**: If authentication is specified, include complete auth flow
5. **Testing Suite**: If testing is required, include comprehensive tests
6. **Documentation**: If documentation is required, include README and API docs
7. **Deployment Configuration**: Docker, K8s, or cloud deployment configs as needed
8. **CI/CD Pipeline**: If CI/CD is required, include complete pipeline configuration
9. **Security Implementation**: Implement security according to specified level
10. **Monitoring & Logging**: If monitoring is required, include telemetry and logging

## Quality Requirements

- **Production Ready**: All code must be production-grade, not demo code
- **Error Handling**: Comprehensive error handling and validation
- **Security**: Implement security best practices for the specified level
- **Performance**: Optimize for the specified scalability level
- **Maintainability**: Clean, well-documented, maintainable code
- **Testing**: Include unit, integration, and e2e tests as appropriate
- **Documentation**: Include inline comments and external documentation

## Output Format

Provide the response as a valid JSON object with this structure:

\`\`\`json
{
  "files": [
    {
      "path": "string",
      "content": "string",
      "language": "string",
      "description": "string",
      "dependencies": ["string"]
    }
  ],
  "instructions": ["string"],
  "setupCommands": ["string"],
  "testCommands": ["string"],
  "deploymentCommands": ["string"],
  "documentation": "string",
  "estimatedTime": number,
  "securityNotes": ["string"],
  "performanceNotes": ["string"]
}
\`\`\`

Generate the complete codebase now:`;
  }

  private estimateTokens(template: TemplateConfig, context: GenerationContext): number {
    let baseTokens = 2000;
    
    // Complexity multiplier
    const complexityMultiplier = {
      beginner: 1,
      intermediate: 1.5,
      advanced: 2,
      expert: 3
    };
    
    baseTokens *= complexityMultiplier[template.complexity];
    
    // Feature multiplier
    baseTokens += context.features.length * 200;
    
    // Additional features
    if (context.testing) baseTokens += 500;
    if (context.documentation) baseTokens += 300;
    if (context.cicd) baseTokens += 400;
    if (context.monitoring) baseTokens += 300;
    
    return Math.min(baseTokens, 8000);
  }

  private parseAIResponse(response: string): GeneratedCode {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        throw new Error('Invalid AI response format');
      }

      const parsedResponse = JSON.parse(jsonMatch[1]);
      
      // Validate response structure
      if (!parsedResponse.files || !Array.isArray(parsedResponse.files)) {
        throw new Error('Invalid response structure: missing files array');
      }

      return parsedResponse as GeneratedCode;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Failed to parse AI generation response');
    }
  }

  private async postProcessGeneration(generated: GeneratedCode, template: TemplateConfig, context: GenerationContext): Promise<GeneratedCode> {
    // Security scan
    await this.security.scanGeneratedCode(generated.files);
    
    // Add enterprise features if required
    if (template.enterpriseReady) {
      generated = await this.addEnterpriseFeatures(generated, context);
    }
    
    // Optimize for performance
    generated = await this.optimizePerformance(generated, context);
    
    // Add monitoring and telemetry
    if (context.monitoring) {
      generated = await this.addMonitoring(generated, context);
    }
    
    return generated;
  }

  private async addEnterpriseFeatures(generated: GeneratedCode, context: GenerationContext): Promise<GeneratedCode> {
    // Add enterprise logging
    generated.files.push({
      path: 'src/logging/enterprise-logger.ts',
      content: this.getEnterpriseLoggerTemplate(),
      language: 'typescript',
      description: 'Enterprise-grade logging system',
      dependencies: ['winston', 'winston-elasticsearch']
    });

    // Add enterprise configuration
    generated.files.push({
      path: 'src/config/enterprise-config.ts',
      content: this.getEnterpriseConfigTemplate(),
      language: 'typescript',
      description: 'Enterprise configuration management',
      dependencies: ['dotenv', 'joi']
    });

    // Add security middleware
    generated.files.push({
      path: 'src/middleware/security.ts',
      content: this.getSecurityMiddlewareTemplate(),
      language: 'typescript',
      description: 'Enterprise security middleware',
      dependencies: ['helmet', 'express-rate-limit']
    });

    return generated;
  }

  private async optimizePerformance(generated: GeneratedCode, context: GenerationContext): Promise<GeneratedCode> {
    // Add performance monitoring
    generated.files.push({
      path: 'src/monitoring/performance.ts',
      content: this.getPerformanceMonitoringTemplate(),
      language: 'typescript',
      description: 'Performance monitoring and optimization',
      dependencies: ['prom-client']
    });

    // Add caching layer
    generated.files.push({
      path: 'src/caching/cache-manager.ts',
      content: this.getCacheManagerTemplate(),
      language: 'typescript',
      description: 'Intelligent caching system',
      dependencies: ['redis', 'node-cache']
    });

    return generated;
  }

  private async addMonitoring(generated: GeneratedCode, context: GenerationContext): Promise<GeneratedCode> {
    // Add telemetry
    generated.files.push({
      path: 'src/telemetry/telemetry.ts',
      content: this.getTelemetryTemplate(),
      language: 'typescript',
      description: 'Application telemetry and analytics',
      dependencies: ['@opentelemetry/node', '@opentelemetry/exporter-prometheus']
    });

    // Add health checks
    generated.files.push({
      path: 'src/health/health-checks.ts',
      content: this.getHealthChecksTemplate(),
      language: 'typescript',
      description: 'Comprehensive health checking system',
      dependencies: ['express']
    });

    return generated;
  }

  private getCacheKey(templateId: string, context: GenerationContext): string {
    const contextHash = JSON.stringify(context);
    return `${templateId}:${Buffer.from(contextHash).toString('base64')}`;
  }

  // Template getters for enterprise features
  private getEnterpriseLoggerTemplate(): string {
    return `import winston from 'winston';

export class EnterpriseLogger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
      ]
    });
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error, meta?: any) {
    this.logger.error(message, { error: error?.stack, ...meta });
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }
}

export const logger = new EnterpriseLogger();`;
  }

  private getEnterpriseConfigTemplate(): string {
    return `import Joi from 'joi';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  RATE_LIMIT_WINDOW: Joi.number().default(900000),
  RATE_LIMIT_MAX: Joi.number().default(100)
});

const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(\`Config validation error: \${error.message}\`);
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  database: {
    url: envVars.DATABASE_URL
  },
  jwt: {
    secret: envVars.JWT_SECRET
  },
  logging: {
    level: envVars.LOG_LEVEL
  },
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW,
    max: envVars.RATE_LIMIT_MAX
  }
};`;
  }

  private getSecurityMiddlewareTemplate(): string {
    return `import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP'
  })
];

export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
};`;
  }

  private getPerformanceMonitoringTemplate(): string {
    return `import promClient from 'prom-client';

export class PerformanceMonitor {
  private httpRequestDuration: promClient.Histogram<string>;
  private httpRequestTotal: promClient.Counter<string>;

  constructor() {
    promClient.register.clear();
    
    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status']
    });

    this.httpRequestTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status']
    });
  }

  trackRequest(method: string, route: string, status: number, duration: number) {
    this.httpRequestDuration.observe({ method, route, status: status.toString() }, duration);
    this.httpRequestTotal.inc({ method, route, status: status.toString() });
  }

  getMetrics() {
    return promClient.register.metrics();
  }
}

export const performanceMonitor = new PerformanceMonitor();`;
  }

  private getCacheManagerTemplate(): string {
    return `import Redis from 'redis';
import NodeCache from 'node-cache';

export class CacheManager {
  private redis?: Redis.RedisClientType;
  private memoryCache: NodeCache;

  constructor() {
    this.memoryCache = new NodeCache({ stdTTL: 600 }); // 10 minutes default
    this.initRedis();
  }

  private async initRedis() {
    if (process.env.REDIS_URL) {
      this.redis = Redis.createClient({ url: process.env.REDIS_URL });
      await this.redis.connect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.redis) {
      const value = await this.redis.get(key);
      if (value) return JSON.parse(value);
    }

    // Fall back to memory cache
    return this.memoryCache.get<T>(key) || null;
  }

  async set<T>(key: string, value: T, ttl: number = 600): Promise<void> {
    // Set in Redis
    if (this.redis) {
      await this.redis.setEx(key, ttl, JSON.stringify(value));
    }

    // Set in memory cache
    this.memoryCache.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
    }
    this.memoryCache.del(key);
  }
}

export const cache = new CacheManager();`;
  }

  private getTelemetryTemplate(): string {
    return `import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

export class TelemetryService {
  private sdk: NodeSDK;

  constructor() {
    this.sdk = new NodeSDK({
      metricReader: new PrometheusExporter({
        port: 9464,
        endpoint: '/metrics'
      }),
      instrumentations: []
    });
  }

  start() {
    this.sdk.start();
    console.log('Telemetry started successfully');
  }

  shutdown() {
    return this.sdk.shutdown();
  }
}

export const telemetry = new TelemetryService();`;
  }

  private getHealthChecksTemplate(): string {
    return `import { Request, Response } from 'express';

interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

export class HealthChecker {
  private checks: HealthCheck[] = [];

  addCheck(name: string, check: () => Promise<boolean>) {
    this.checks.push({ name, check });
  }

  async runChecks(): Promise<{ status: string; checks: Record<string, boolean> }> {
    const results: Record<string, boolean> = {};
    let allHealthy = true;

    for (const { name, check } of this.checks) {
      try {
        results[name] = await check();
        if (!results[name]) allHealthy = false;
      } catch (error) {
        results[name] = false;
        allHealthy = false;
      }
    }

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks: results
    };
  }
}

export const healthChecker = new HealthChecker();

// Add default checks
healthChecker.addCheck('database', async () => {
  // Database connectivity check
  return true;
});

healthChecker.addCheck('memory', async () => {
  const usage = process.memoryUsage();
  return usage.heapUsed < 500 * 1024 * 1024; // 500MB limit
});

export const healthEndpoint = async (req: Request, res: Response) => {
  const health = await healthChecker.runChecks();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
};`;
  }

  // Public API methods
  getAvailableTemplates(): TemplateConfig[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: string): TemplateConfig[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  getTemplatesByLanguage(language: string): TemplateConfig[] {
    return Array.from(this.templates.values()).filter(t => t.language.includes(language));
  }

  getTemplatesByComplexity(complexity: string): TemplateConfig[] {
    return Array.from(this.templates.values()).filter(t => t.complexity === complexity);
  }

  async addCustomTemplate(template: TemplateConfig): Promise<void> {
    // Validate template
    await this.security.validateTemplate(template);
    
    // Add to memory
    this.templates.set(template.id, template);
    
    // Persist to disk
    const userTemplatesPath = path.join(process.cwd(), '.recoder', 'templates');
    await fs.mkdir(userTemplatesPath, { recursive: true });
    
    const templatePath = path.join(userTemplatesPath, `${template.id}.template.json`);
    await fs.writeFile(templatePath, JSON.stringify(template, null, 2));
    
    console.log(`✅ Custom template added: ${template.id}`);
  }

  async removeTemplate(templateId: string): Promise<void> {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    this.templates.delete(templateId);
    
    // Remove from disk if it's a user template
    const templatePath = path.join(process.cwd(), '.recoder', 'templates', `${templateId}.template.json`);
    await fs.unlink(templatePath).catch(() => {}); // Ignore if file doesn't exist
    
    console.log(`🗑️ Template removed: ${templateId}`);
  }

  clearCache(): void {
    this.generationCache.clear();
    console.log('🧹 Generation cache cleared');
  }

  getGenerationStats(): any {
    return {
      templatesLoaded: this.templates.size,
      cacheSize: this.generationCache.size,
      cacheEnabled: this.cacheEnabled
    };
  }
}

export const codeGenerator = new AdvancedCodeGenerator();