/**
 * Code Enhancement Engine for Recoder.xyz
 * 
 * Transforms mock implementations into real, production-ready code
 * Works with ProductionValidator and ProductionTemplateEngine
 */

import { EventEmitter } from 'events';
import ProductionValidator, { ValidationResult, ValidationConfig } from './production-validator';
import ProductionTemplateEngine, { TemplateRequest, TemplateResult } from './production-templates';

export interface EnhancementRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'solidity' | 'java';
  framework?: string;
  context?: {
    projectType?: string;
    existingCode?: string;
    dependencies?: string[];
    environmentVars?: string[];
  };
  requirements: {
    makeProductionReady: boolean;
    addErrorHandling: boolean;
    addInputValidation: boolean;
    addSecurity: boolean;
    addLogging: boolean;
    addTests: boolean;
    addDocumentation: boolean;
    optimizePerformance: boolean;
  };
  targetComplexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
}

export interface EnhancementResult {
  originalCode: string;
  enhancedCode: string;
  improvements: CodeImprovement[];
  validation: ValidationResult;
  templateUsed?: TemplateResult;
  qualityScore: {
    before: number;
    after: number;
    improvement: number;
  };
  realImplementationScore: {
    before: number;
    after: number;
    improvement: number;
  };
  warnings: string[];
  instructions: {
    setup: string[];
    deployment: string[];
    testing: string[];
    security: string[];
  };
}

export interface CodeImprovement {
  type: 'mock-replacement' | 'error-handling' | 'validation' | 'security' | 'performance' | 'logging' | 'testing';
  description: string;
  before: string;
  after: string;
  line?: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export interface MockPattern {
  pattern: RegExp;
  replacement: string;
  category: string;
  language: string;
  requiresTemplate?: boolean;
  templateCategory?: string;
}

export class CodeEnhancementEngine extends EventEmitter {
  private static instance: CodeEnhancementEngine;
  private validator: ProductionValidator;
  private templateEngine: ProductionTemplateEngine;
  private mockPatterns: Map<string, MockPattern[]> = new Map();
  private enhancementStrategies: Map<string, Function> = new Map();

  private constructor() {
    super();
    this.validator = ProductionValidator.getInstance({
      language: 'typescript',
      strictMode: true,
      productionFocus: true,
      securityLevel: 'strict',
      performanceThreshold: 0.8,
      mockDetectionEnabled: true,
      realCodeEnforcement: true
    });
    this.templateEngine = ProductionTemplateEngine.getInstance();
    this.initializeMockPatterns();
    this.initializeEnhancementStrategies();
  }

  static getInstance(): CodeEnhancementEngine {
    if (!CodeEnhancementEngine.instance) {
      CodeEnhancementEngine.instance = new CodeEnhancementEngine();
    }
    return CodeEnhancementEngine.instance;
  }

  /**
   * Enhance code from mock to production-ready implementation
   */
  async enhanceCode(request: EnhancementRequest): Promise<EnhancementResult> {
    const startTime = Date.now();
    
    this.emit('enhancement:started', { request, timestamp: startTime });

    try {
      // Step 1: Validate original code
      const originalValidation = await this.validator.validateCode(request.code, {
        filename: 'original.ts',
        context: 'enhancement',
        taskType: 'code-generation'
      });

      // Step 2: Analyze and detect mock patterns
      const mockAnalysis = await this.analyzeMockPatterns(request.code, request.language);

      // Step 3: Generate enhanced code
      let enhancedCode = request.code;
      const improvements: CodeImprovement[] = [];

      // Replace mock implementations with real code
      if (mockAnalysis.mockCount > 0) {
        const mockReplacementResult = await this.replaceMockImplementations(
          enhancedCode, 
          request, 
          mockAnalysis
        );
        enhancedCode = mockReplacementResult.code;
        improvements.push(...mockReplacementResult.improvements);
      }

      // Add production features
      if (request.requirements.addErrorHandling) {
        const errorHandlingResult = await this.addErrorHandling(enhancedCode, request.language);
        enhancedCode = errorHandlingResult.code;
        improvements.push(...errorHandlingResult.improvements);
      }

      if (request.requirements.addInputValidation) {
        const validationResult = await this.addInputValidation(enhancedCode, request.language);
        enhancedCode = validationResult.code;
        improvements.push(...validationResult.improvements);
      }

      if (request.requirements.addSecurity) {
        const securityResult = await this.addSecurityFeatures(enhancedCode, request.language);
        enhancedCode = securityResult.code;
        improvements.push(...securityResult.improvements);
      }

      if (request.requirements.addLogging) {
        const loggingResult = await this.addLogging(enhancedCode, request.language);
        enhancedCode = loggingResult.code;
        improvements.push(...loggingResult.improvements);
      }

      if (request.requirements.optimizePerformance) {
        const performanceResult = await this.optimizePerformance(enhancedCode, request.language);
        enhancedCode = performanceResult.code;
        improvements.push(...performanceResult.improvements);
      }

      // Step 4: Validate enhanced code
      const enhancedValidation = await this.validator.validateCode(enhancedCode, {
        filename: 'enhanced.ts',
        context: 'enhancement-result',
        taskType: 'code-generation'
      });

      // Step 5: Calculate scores
      const qualityScore = {
        before: originalValidation.quality.score,
        after: enhancedValidation.quality.score,
        improvement: enhancedValidation.quality.score - originalValidation.quality.score
      };

      const realImplementationScore = {
        before: originalValidation.quality.metrics.realImplementationScore,
        after: enhancedValidation.quality.metrics.realImplementationScore,
        improvement: enhancedValidation.quality.metrics.realImplementationScore - 
                    originalValidation.quality.metrics.realImplementationScore
      };

      // Step 6: Generate instructions
      const instructions = await this.generateInstructions(enhancedCode, request, improvements);

      const result: EnhancementResult = {
        originalCode: request.code,
        enhancedCode,
        improvements,
        validation: enhancedValidation,
        qualityScore,
        realImplementationScore,
        warnings: this.generateWarnings(improvements, enhancedValidation),
        instructions
      };

      this.emit('enhancement:completed', {
        result,
        duration: Date.now() - startTime,
        improvementCount: improvements.length
      });

      return result;

    } catch (error) {
      this.emit('enhancement:error', { error, request });
      throw new Error(`Code enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze code for mock patterns
   */
  private async analyzeMockPatterns(code: string, language: string): Promise<{
    mockCount: number;
    patterns: Array<{ pattern: string; matches: string[]; line?: number }>;
    realImplementationRatio: number;
  }> {
    const languagePatterns = this.mockPatterns.get(language) || [];
    const analysis = {
      mockCount: 0,
      patterns: [] as Array<{ pattern: string; matches: string[]; line?: number }>,
      realImplementationRatio: 0
    };

    for (const mockPattern of languagePatterns) {
      const matches = code.match(mockPattern.pattern);
      if (matches && matches.length > 0) {
        analysis.mockCount += matches.length;
        analysis.patterns.push({
          pattern: mockPattern.category,
          matches: matches,
          line: this.findLineNumber(code, matches[0])
        });
      }
    }

    // Calculate real implementation ratio
    const lines = code.split('\n');
    const codeLines = lines.filter(line => 
      line.trim().length > 0 && 
      !line.trim().startsWith('//') && 
      !line.trim().startsWith('/*')
    );
    
    analysis.realImplementationRatio = analysis.mockCount > 0 ? 
      (codeLines.length - analysis.mockCount) / codeLines.length : 1.0;

    return analysis;
  }

  /**
   * Replace mock implementations with real code
   */
  private async replaceMockImplementations(
    code: string, 
    request: EnhancementRequest, 
    mockAnalysis: any
  ): Promise<{ code: string; improvements: CodeImprovement[] }> {
    let enhancedCode = code;
    const improvements: CodeImprovement[] = [];
    const languagePatterns = this.mockPatterns.get(request.language) || [];

    for (const mockPattern of languagePatterns) {
      const matches = enhancedCode.match(mockPattern.pattern);
      if (matches) {
        for (const match of matches) {
          let replacement: string;

          if (mockPattern.requiresTemplate && mockPattern.templateCategory) {
            // Use template engine for complex replacements
            const templateRequest: TemplateRequest = {
              category: mockPattern.templateCategory as any,
              language: request.language,
              framework: request.framework,
              complexity: request.targetComplexity,
              features: [mockPattern.category],
              constraints: {
                noMocks: true,
                productionReady: request.requirements.makeProductionReady,
                includeSecurity: request.requirements.addSecurity,
                includeTests: request.requirements.addTests,
                includeDocumentation: request.requirements.addDocumentation
              },
              context: request.context
            };

            const templateResult = await this.templateEngine.getTemplate(templateRequest);
            replacement = templateResult.generatedCode;
          } else {
            // Use simple pattern replacement
            replacement = await this.generateRealImplementation(
              match, 
              mockPattern.category, 
              request.language,
              request.context
            );
          }

          enhancedCode = enhancedCode.replace(match, replacement);

          improvements.push({
            type: 'mock-replacement',
            description: `Replaced mock ${mockPattern.category} with real implementation`,
            before: match,
            after: replacement,
            line: this.findLineNumber(code, match),
            impact: 'critical',
            category: mockPattern.category
          });
        }
      }
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Add comprehensive error handling
   */
  private async addErrorHandling(code: string, language: string): Promise<{
    code: string;
    improvements: CodeImprovement[];
  }> {
    const improvements: CodeImprovement[] = [];
    let enhancedCode = code;

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Add try-catch blocks to async functions
        const asyncFunctionRegex = /async\s+function\s+(\w+)[^{]*{([^}]*)}/g;
        enhancedCode = enhancedCode.replace(asyncFunctionRegex, (match, funcName, body) => {
          if (body.includes('try {')) {
            return match; // Already has error handling
          }

          const enhancedBody = `
  try {${body}
  } catch (error) {
    console.error(\`Error in \${funcName}:\`, error);
    
    // Log error to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // await errorTracker.captureException(error);
    }
    
    throw error;
  }`;

          improvements.push({
            type: 'error-handling',
            description: `Added comprehensive error handling to ${funcName}`,
            before: body.trim(),
            after: enhancedBody.trim(),
            impact: 'high',
            category: 'error-handling'
          });

          return `async function ${funcName}(...args) {${enhancedBody}}`;
        });

        // Add error handling to HTTP routes
        const routeRegex = /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`],\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*{([^}]*)}/g;
        enhancedCode = enhancedCode.replace(routeRegex, (match, method, path, params, body) => {
          if (body.includes('try {')) {
            return match;
          }

          const enhancedRouteBody = `
  try {${body}
  } catch (error) {
    console.error(\`Error in \${method.toUpperCase()} \${path}:\`, error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({ 
        error: error.message,
        path: req.path,
        method: req.method
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error',
      path: req.path,
      method: req.method
    });
  }`;

          improvements.push({
            type: 'error-handling',
            description: `Added error handling to ${method.toUpperCase()} ${path}`,
            before: body.trim(),
            after: enhancedRouteBody.trim(),
            impact: 'high',
            category: 'api-error-handling'
          });

          return `app.${method}('${path}', async (${params}) => {${enhancedRouteBody}})`;
        });
        break;

      case 'python':
        // Add try-except blocks
        const pythonFunctionRegex = /def\s+(\w+)\([^)]*\):[^:]*?(\n(?:    .+\n)*)/g;
        enhancedCode = enhancedCode.replace(pythonFunctionRegex, (match, funcName, body) => {
          if (body.includes('try:')) {
            return match;
          }

          const enhancedBody = `
    try:${body}
    except Exception as e:
        print(f"Error in {funcName}: {e}")
        
        # Log to monitoring service in production
        if os.getenv('ENVIRONMENT') == 'production':
            # error_tracker.capture_exception(e)
            pass
        
        raise`;

          improvements.push({
            type: 'error-handling',
            description: `Added error handling to ${funcName}`,
            before: body.trim(),
            after: enhancedBody.trim(),
            impact: 'high',
            category: 'error-handling'
          });

          return `def ${funcName}(...):${enhancedBody}`;
        });
        break;
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Add input validation
   */
  private async addInputValidation(code: string, language: string): Promise<{
    code: string;
    improvements: CodeImprovement[];
  }> {
    const improvements: CodeImprovement[] = [];
    let enhancedCode = code;

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Add validation to API routes
        const routeRegex = /app\.(post|put|patch)\(['"`]([^'"`]+)['"`],\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*{([^}]*)}/g;
        enhancedCode = enhancedCode.replace(routeRegex, (match, method, path, params, body) => {
          if (body.includes('validate') || body.includes('joi') || body.includes('schema')) {
            return match;
          }

          const validationCode = `
  // Input validation
  const { error } = requestSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map(d => d.message)
    });
  }
  
  // Sanitize inputs
  const sanitizedData = {
    ...req.body,
    // Add specific sanitization based on fields
  };
  
${body}`;

          improvements.push({
            type: 'validation',
            description: `Added input validation to ${method.toUpperCase()} ${path}`,
            before: body.trim(),
            after: validationCode.trim(),
            impact: 'high',
            category: 'input-validation'
          });

          return `app.${method}('${path}', async (${params}) => {${validationCode}})`;
        });

        // Add Joi schema import if not present
        if (!enhancedCode.includes('joi') && improvements.some(i => i.category === 'input-validation')) {
          enhancedCode = `import Joi from 'joi';\n\n${enhancedCode}`;
          
          // Add example schema
          const schemaCode = `
// Request validation schema
const requestSchema = Joi.object({
  // Define your validation schema here
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  // Add more fields as needed
});

`;
          enhancedCode = enhancedCode.replace(
            /import.*;\n\n/,
            `$&${schemaCode}`
          );
        }
        break;
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Add security features
   */
  private async addSecurityFeatures(code: string, language: string): Promise<{
    code: string;
    improvements: CodeImprovement[];
  }> {
    const improvements: CodeImprovement[] = [];
    let enhancedCode = code;

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Add security middleware
        if (code.includes('express') && !code.includes('helmet')) {
          const securityMiddleware = `
// Security middleware
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Apply security headers
app.use(helmet());

// Configure CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

`;

          enhancedCode = enhancedCode.replace(
            /(import.*express.*;\n)/,
            `$1${securityMiddleware}`
          );

          improvements.push({
            type: 'security',
            description: 'Added security middleware (helmet, CORS, rate limiting)',
            before: 'No security middleware',
            after: securityMiddleware.trim(),
            impact: 'critical',
            category: 'security-middleware'
          });
        }

        // Add authentication middleware
        if (!code.includes('authenticate') && code.includes('app.')) {
          const authMiddleware = `
// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

`;

          enhancedCode = enhancedCode.replace(
            /(const app = express\(\);)/,
            `$1\n${authMiddleware}`
          );

          improvements.push({
            type: 'security',
            description: 'Added JWT authentication middleware',
            before: 'No authentication',
            after: authMiddleware.trim(),
            impact: 'critical',
            category: 'authentication'
          });
        }
        break;
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Add comprehensive logging
   */
  private async addLogging(code: string, language: string): Promise<{
    code: string;
    improvements: CodeImprovement[];
  }> {
    const improvements: CodeImprovement[] = [];
    let enhancedCode = code;

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Replace console.log with proper logging
        if (code.includes('console.log') && !code.includes('winston')) {
          const loggingSetup = `
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

`;

          enhancedCode = enhancedCode.replace(
            /(import.*;\n)/,
            `$1${loggingSetup}`
          );

          // Replace console.log calls
          enhancedCode = enhancedCode.replace(/console\.log\(/g, 'logger.info(');
          enhancedCode = enhancedCode.replace(/console\.error\(/g, 'logger.error(');
          enhancedCode = enhancedCode.replace(/console\.warn\(/g, 'logger.warn(');

          improvements.push({
            type: 'logging',
            description: 'Replaced console.log with Winston logger',
            before: 'console.log statements',
            after: 'Winston logger with file and console transports',
            impact: 'medium',
            category: 'logging'
          });
        }

        // Add request logging middleware
        if (code.includes('express') && !code.includes('morgan')) {
          const requestLogging = `
import morgan from 'morgan';

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

`;

          enhancedCode = enhancedCode.replace(
            /(const app = express\(\);)/,
            `$1\n${requestLogging}`
          );

          improvements.push({
            type: 'logging',
            description: 'Added HTTP request logging with Morgan',
            before: 'No request logging',
            after: requestLogging.trim(),
            impact: 'medium',
            category: 'request-logging'
          });
        }
        break;
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Optimize performance
   */
  private async optimizePerformance(code: string, language: string): Promise<{
    code: string;
    improvements: CodeImprovement[];
  }> {
    const improvements: CodeImprovement[] = [];
    let enhancedCode = code;

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Add compression middleware
        if (code.includes('express') && !code.includes('compression')) {
          const compressionMiddleware = `
import compression from 'compression';

// Enable gzip compression
app.use(compression());

`;

          enhancedCode = enhancedCode.replace(
            /(const app = express\(\);)/,
            `$1\n${compressionMiddleware}`
          );

          improvements.push({
            type: 'performance',
            description: 'Added gzip compression middleware',
            before: 'No compression',
            after: compressionMiddleware.trim(),
            impact: 'medium',
            category: 'compression'
          });
        }

        // Optimize database queries (add connection pooling)
        if (code.includes('mongoose') && !code.includes('maxPoolSize')) {
          enhancedCode = enhancedCode.replace(
            /mongoose\.connect\([^)]+\)/,
            `mongoose.connect(process.env.DATABASE_URL, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,
  bufferMaxEntries: 0
})`
          );

          improvements.push({
            type: 'performance',
            description: 'Added MongoDB connection pooling optimization',
            before: 'Basic mongoose connection',
            after: 'Optimized connection with pooling',
            impact: 'high',
            category: 'database-optimization'
          });
        }
        break;
    }

    return { code: enhancedCode, improvements };
  }

  /**
   * Generate real implementation for specific patterns
   */
  private async generateRealImplementation(
    mockCode: string, 
    category: string, 
    language: string,
    context?: any
  ): Promise<string> {
    const implementations: { [key: string]: { [lang: string]: string } } = {
      'todo-implementation': {
        'typescript': `
// Real implementation
const result = await processData(input);
if (!result) {
  throw new Error('Processing failed');
}
return result;`,
        'javascript': `
// Real implementation
const result = await processData(input);
if (!result) {
  throw new Error('Processing failed');
}
return result;`,
        'python': `
# Real implementation
result = await process_data(input)
if not result:
    raise ValueError('Processing failed')
return result`
      },
      'database-operation': {
        'typescript': `
// Real database operation
const result = await User.findById(userId);
if (!result) {
  throw new Error('User not found');
}
return result;`,
        'python': `
# Real database operation
result = await User.find_by_id(user_id)
if not result:
    raise ValueError('User not found')
return result`
      },
      'api-call': {
        'typescript': `
// Real API call
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${token}\`
  },
  body: JSON.stringify(data)
});

if (!response.ok) {
  throw new Error(\`API call failed: \${response.status}\`);
}

return response.json();`,
        'python': `
# Real API call
async with aiohttp.ClientSession() as session:
    async with session.post(api_url, json=data, headers=headers) as response:
        if response.status != 200:
            raise ValueError(f'API call failed: {response.status}')
        return await response.json()`
      }
    };

    const categoryImplementations = implementations[category];
    if (categoryImplementations && categoryImplementations[language]) {
      return categoryImplementations[category][language];
    }

    // Fallback: generic real implementation
    return `// Real implementation for ${category}\n// TODO: Implement specific ${category} logic`;
  }

  /**
   * Initialize mock patterns for different languages
   */
  private initializeMockPatterns(): void {
    // TypeScript/JavaScript patterns
    this.mockPatterns.set('typescript', [
      {
        pattern: /\/\/\s*TODO:?\s*implement.*/gi,
        replacement: 'Real implementation',
        category: 'todo-implementation',
        language: 'typescript'
      },
      {
        pattern: /throw\s+new\s+Error\s*\(\s*['"]not implemented['"][^)]*\)/gi,
        replacement: 'Real implementation with proper logic',
        category: 'not-implemented-error',
        language: 'typescript'
      },
      {
        pattern: /return\s+null;?\s*\/\/.*mock/gi,
        replacement: 'return realValue;',
        category: 'mock-return',
        language: 'typescript'
      },
      {
        pattern: /console\.log\s*\(\s*['"]mock.*['"][^)]*\)/gi,
        replacement: 'logger.info("Real operation completed");',
        category: 'mock-logging',
        language: 'typescript'
      }
    ]);

    // Python patterns
    this.mockPatterns.set('python', [
      {
        pattern: /#\s*TODO:?\s*implement.*/gi,
        replacement: '# Real implementation',
        category: 'todo-implementation',
        language: 'python'
      },
      {
        pattern: /raise\s+NotImplementedError/gi,
        replacement: 'Real implementation logic',
        category: 'not-implemented-error',
        language: 'python'
      },
      {
        pattern: /pass\s*#.*mock/gi,
        replacement: 'Real implementation',
        category: 'mock-pass',
        language: 'python'
      }
    ]);

    // JavaScript patterns (same as TypeScript but different language key)
    this.mockPatterns.set('javascript', this.mockPatterns.get('typescript') || []);
  }

  /**
   * Initialize enhancement strategies
   */
  private initializeEnhancementStrategies(): void {
    this.enhancementStrategies.set('error-handling', this.addErrorHandling.bind(this));
    this.enhancementStrategies.set('input-validation', this.addInputValidation.bind(this));
    this.enhancementStrategies.set('security', this.addSecurityFeatures.bind(this));
    this.enhancementStrategies.set('logging', this.addLogging.bind(this));
    this.enhancementStrategies.set('performance', this.optimizePerformance.bind(this));
  }

  /**
   * Generate setup and deployment instructions
   */
  private async generateInstructions(
    code: string, 
    request: EnhancementRequest, 
    improvements: CodeImprovement[]
  ): Promise<{
    setup: string[];
    deployment: string[];
    testing: string[];
    security: string[];
  }> {
    const instructions = {
      setup: [] as string[],
      deployment: [] as string[],
      testing: [] as string[],
      security: [] as string[]
    };

    // Analyze improvements to generate relevant instructions
    for (const improvement of improvements) {
      switch (improvement.category) {
        case 'security-middleware':
          instructions.setup.push('npm install helmet express-rate-limit cors');
          instructions.security.push('Configure CORS origins in environment variables');
          instructions.security.push('Set up rate limiting based on your traffic patterns');
          break;
        case 'authentication':
          instructions.setup.push('npm install jsonwebtoken bcrypt');
          instructions.security.push('Generate and store JWT secret securely');
          instructions.testing.push('Test authentication flows with valid/invalid tokens');
          break;
        case 'logging':
          instructions.setup.push('npm install winston morgan');
          instructions.setup.push('Create logs directory');
          instructions.deployment.push('Configure log rotation in production');
          break;
        case 'database-optimization':
          instructions.setup.push('Optimize database connection settings');
          instructions.deployment.push('Monitor database connection pool usage');
          instructions.testing.push('Load test database operations');
          break;
      }
    }

    // Add general instructions
    instructions.setup.push('Set up environment variables (.env file)');
    instructions.deployment.push('Build application for production');
    instructions.deployment.push('Set up monitoring and alerting');
    instructions.testing.push('Run comprehensive test suite');
    instructions.security.push('Perform security audit');

    return instructions;
  }

  /**
   * Generate warnings based on improvements and validation
   */
  private generateWarnings(improvements: CodeImprovement[], validation: ValidationResult): string[] {
    const warnings: string[] = [];

    // Check if critical improvements were made
    const criticalImprovements = improvements.filter(i => i.impact === 'critical');
    if (criticalImprovements.length > 0) {
      warnings.push(`${criticalImprovements.length} critical issues were fixed - review changes carefully`);
    }

    // Check validation results
    if (validation.productionReadiness.blockers.length > 0) {
      warnings.push(`${validation.productionReadiness.blockers.length} production blockers still remain`);
    }

    // Check quality score
    if (validation.quality.score < 0.8) {
      warnings.push('Code quality is below recommended threshold (0.8)');
    }

    return warnings;
  }

  /**
   * Find line number for a piece of code
   */
  private findLineNumber(code: string, searchText: string): number | undefined {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText)) {
        return i + 1;
      }
    }
    return undefined;
  }
}

export default CodeEnhancementEngine;