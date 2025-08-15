/**
 * ENTERPRISE AI CODE ASSISTANT
 * Advanced AI-powered code generation, analysis, and optimization
 */

const { EventEmitter } = require('events');
const axios = require('axios');

class EnterpriseAICodeAssistant extends EventEmitter {
    constructor(telemetryService = null) {
        super();
        this.telemetryService = telemetryService;
        
        this.providers = {
            ollama: {
                name: 'Ollama',
                url: 'http://localhost:11434',
                available: false,
                models: []
            },
            openai: {
                name: 'OpenAI',
                available: !!process.env.OPENAI_API_KEY,
                models: ['gpt-4', 'gpt-3.5-turbo']
            },
            anthropic: {
                name: 'Anthropic',
                available: !!process.env.ANTHROPIC_API_KEY,
                models: ['claude-3-sonnet', 'claude-3-haiku']
            },
            groq: {
                name: 'Groq',
                available: !!process.env.GROQ_API_KEY,
                models: ['llama3-70b', 'mixtral-8x7b']
            }
        };

        this.codeTemplates = {
            react: {
                component: `import React from 'react';

interface {{ComponentName}}Props {
  // Define your props here
}

export const {{ComponentName}}: React.FC<{{ComponentName}}Props> = (props) => {
  return (
    <div className="{{kebab-case-name}}">
      {/* Component content */}
    </div>
  );
};

export default {{ComponentName}};`,
                
                hook: `import { useState, useEffect } from 'react';

export const use{{HookName}} = () => {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Hook logic here
  }, []);
  
  return { state, setState };
};`
            },
            
            node: {
                express: `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(\`🚀 Server running on port \${PORT}\`);
});`,
                
                api: `import { Request, Response, NextFunction } from 'express';

export const {{functionName}} = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // API logic here
    
    res.json({ 
      success: true, 
      data: null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};`
            },
            
            database: {
                prisma: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model {{ModelName}} {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Add your fields here
  
  @@map("{{table_name}}")
}`,
                
                mongoose: `import mongoose from 'mongoose';

const {{modelName}}Schema = new mongoose.Schema({
  // Define your schema here
}, {
  timestamps: true,
  collection: '{{collection_name}}'
});

{{modelName}}Schema.index({ /* Define indexes */ });

export const {{ModelName}} = mongoose.model('{{ModelName}}', {{modelName}}Schema);`
            }
        };

        console.log('🤖 Enterprise AI Code Assistant initialized');
    }

    async initialize() {
        try {
            console.log('🤖 Initializing Enterprise AI Code Assistant...');
            
            // Check Ollama availability
            await this.checkOllamaStatus();
            
            // Initialize provider capabilities
            await this.initializeProviders();
            
            console.log('✅ Enterprise AI Code Assistant ready');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize AI Code Assistant:', error);
            return false;
        }
    }

    async checkOllamaStatus() {
        try {
            const response = await axios.get(`${this.providers.ollama.url}/api/tags`, { timeout: 3000 });
            this.providers.ollama.available = true;
            this.providers.ollama.models = response.data.models?.map(m => m.name) || [];
            
            console.log(`✅ Ollama available with ${this.providers.ollama.models.length} models`);
            
        } catch (error) {
            this.providers.ollama.available = false;
            console.log('ℹ️ Ollama not available');
        }
    }

    async initializeProviders() {
        const availableProviders = Object.entries(this.providers)
            .filter(([, provider]) => provider.available)
            .map(([name]) => name);
            
        console.log(`🔌 Available AI providers: ${availableProviders.join(', ')}`);
        
        this.emit('providers-initialized', availableProviders);
    }

    // ADVANCED CODE GENERATION
    async generateCode(prompt, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                type = 'general',
                language = 'typescript',
                framework = null,
                provider = 'auto',
                model = null,
                temperature = 0.3,
                maxTokens = 2000
            } = options;

            // Select best provider for the task
            const selectedProvider = provider === 'auto' ? 
                this.selectBestProvider(type, language) : provider;

            // Generate enhanced prompt
            const enhancedPrompt = this.buildEnhancedPrompt(prompt, type, language, framework);
            
            // Generate code using selected provider
            const result = await this.generateWithProvider(
                selectedProvider, 
                enhancedPrompt, 
                { model, temperature, maxTokens }
            );

            // Post-process and validate
            const processedResult = await this.postProcessCode(result.code, type, language);

            const response = {
                success: true,
                code: processedResult,
                metadata: {
                    provider: selectedProvider,
                    model: result.model,
                    language,
                    framework,
                    type,
                    tokens: result.tokens,
                    duration: Date.now() - startTime
                }
            };

            // Track usage
            if (this.telemetryService) {
                this.telemetryService.trackAIUsage(
                    selectedProvider,
                    result.model,
                    'code-generation',
                    result.tokens,
                    result.cost,
                    { type, language, framework }
                );
                
                this.telemetryService.trackPerformance(
                    'ai-code-generation',
                    Date.now() - startTime,
                    { provider: selectedProvider, type, language }
                );
            }

            this.emit('code-generated', response);
            return response;

        } catch (error) {
            if (this.telemetryService) {
                this.telemetryService.trackError(error, 'ai-code-generation');
            }

            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    buildEnhancedPrompt(prompt, type, language, framework) {
        let systemPrompt = '';
        
        switch (type) {
            case 'component':
                systemPrompt = `You are an expert ${language} developer. Generate a production-ready ${framework || language} component with:
- Proper TypeScript types
- Error handling
- Performance optimization  
- Accessibility features
- Comprehensive documentation
- Unit tests if applicable`;
                break;
                
            case 'api':
                systemPrompt = `You are an expert backend developer. Generate a production-ready API with:
- Proper error handling and validation
- Security best practices
- Performance optimization
- Comprehensive logging
- OpenAPI documentation
- Unit and integration tests`;
                break;
                
            case 'database':
                systemPrompt = `You are an expert database developer. Generate:
- Optimized database schema
- Proper indexing strategies
- Data validation rules
- Migration scripts
- Performance considerations`;
                break;
                
            case 'algorithm':
                systemPrompt = `You are an expert computer scientist. Generate:
- Optimized algorithm implementation
- Time and space complexity analysis
- Edge case handling
- Comprehensive test cases
- Performance benchmarks`;
                break;
                
            default:
                systemPrompt = `You are an expert ${language} developer. Generate production-ready, well-documented, and optimized code with proper error handling.`;
        }

        return `${systemPrompt}\n\nUser Request: ${prompt}\n\nGenerate complete, production-ready code:`;
    }

    selectBestProvider(type, language) {
        // Intelligent provider selection based on task type and language
        const providerRanking = {
            'component': ['anthropic', 'openai', 'ollama', 'groq'],
            'api': ['anthropic', 'openai', 'groq', 'ollama'],
            'database': ['openai', 'anthropic', 'ollama', 'groq'],
            'algorithm': ['anthropic', 'openai', 'groq', 'ollama'],
            'general': ['ollama', 'groq', 'openai', 'anthropic']
        };

        const ranking = providerRanking[type] || providerRanking.general;
        
        for (const provider of ranking) {
            if (this.providers[provider]?.available) {
                return provider;
            }
        }
        
        // Fallback to any available provider
        return Object.keys(this.providers).find(p => this.providers[p].available) || 'ollama';
    }

    async generateWithProvider(provider, prompt, options = {}) {
        switch (provider) {
            case 'ollama':
                return await this.generateWithOllama(prompt, options);
            case 'openai':
                return await this.generateWithOpenAI(prompt, options);
            case 'anthropic':
                return await this.generateWithAnthropic(prompt, options);
            case 'groq':
                return await this.generateWithGroq(prompt, options);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    async generateWithOllama(prompt, options = {}) {
        const { model = 'llama3:latest', temperature = 0.3, maxTokens = 2000 } = options;
        
        const response = await axios.post(`${this.providers.ollama.url}/api/generate`, {
            model,
            prompt,
            stream: false,
            options: {
                temperature,
                num_predict: maxTokens
            }
        }, { timeout: 120000 });

        return {
            code: response.data.response,
            model: response.data.model,
            tokens: response.data.eval_count || 0,
            cost: 0 // Local inference is free
        };
    }

    async generateWithOpenAI(prompt, options = {}) {
        // Placeholder for OpenAI integration
        throw new Error('OpenAI integration not implemented in this demo');
    }

    async generateWithAnthropic(prompt, options = {}) {
        // Placeholder for Anthropic integration  
        throw new Error('Anthropic integration not implemented in this demo');
    }

    async generateWithGroq(prompt, options = {}) {
        // Placeholder for Groq integration
        throw new Error('Groq integration not implemented in this demo');
    }

    async postProcessCode(code, type, language) {
        // Remove markdown code blocks if present
        let processedCode = code.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
        
        // Add proper imports based on detected usage
        processedCode = this.addRequiredImports(processedCode, language);
        
        // Format code
        processedCode = this.formatCode(processedCode, language);
        
        return processedCode;
    }

    addRequiredImports(code, language) {
        if (language === 'typescript' || language === 'javascript') {
            const imports = [];
            
            // Detect React usage
            if (code.includes('React.') || code.includes('useState') || code.includes('useEffect')) {
                if (!code.includes('import React')) {
                    imports.push("import React from 'react';");
                }
            }
            
            // Detect hooks usage
            if (code.includes('useState') && !code.includes('import { useState')) {
                imports.push("import { useState } from 'react';");
            }
            
            if (code.includes('useEffect') && !code.includes('import { useEffect')) {
                imports.push("import { useEffect } from 'react';");
            }
            
            if (imports.length > 0) {
                return imports.join('\n') + '\n\n' + code;
            }
        }
        
        return code;
    }

    formatCode(code, language) {
        // Basic code formatting - in production, this would use prettier or similar
        return code
            .split('\n')
            .map(line => line.trimRight())
            .join('\n');
    }

    // CODE ANALYSIS AND REVIEW
    async analyzeCode(code, language = 'typescript') {
        const startTime = Date.now();
        
        try {
            const prompt = `Analyze this ${language} code for:
1. Code quality and best practices
2. Performance issues
3. Security vulnerabilities  
4. Potential bugs
5. Improvement suggestions

Code:
\`\`\`${language}
${code}
\`\`\`

Provide detailed analysis with specific recommendations:`;

            const result = await this.generateWithProvider('anthropic', prompt, {
                temperature: 0.2,
                maxTokens: 1500
            });

            const response = {
                success: true,
                analysis: result.code,
                metadata: {
                    provider: 'anthropic',
                    language,
                    duration: Date.now() - startTime
                }
            };

            if (this.telemetryService) {
                this.telemetryService.trackAIUsage(
                    'anthropic',
                    result.model,
                    'code-analysis',
                    result.tokens,
                    result.cost
                );
            }

            return response;

        } catch (error) {
            if (this.telemetryService) {
                this.telemetryService.trackError(error, 'ai-code-analysis');
            }

            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // CODE OPTIMIZATION
    async optimizeCode(code, language = 'typescript', optimizationType = 'performance') {
        const startTime = Date.now();
        
        try {
            const optimizationPrompts = {
                performance: 'Optimize this code for maximum performance',
                readability: 'Refactor this code for better readability and maintainability',
                memory: 'Optimize this code for minimal memory usage',
                size: 'Reduce the code size while maintaining functionality'
            };

            const prompt = `${optimizationPrompts[optimizationType] || optimizationPrompts.performance}. 
Keep the same functionality but improve the implementation.

Original code:
\`\`\`${language}
${code}
\`\`\`

Return only the optimized code with comments explaining the improvements:`;

            const result = await this.generateWithProvider('openai', prompt, {
                temperature: 0.2,
                maxTokens: 2000
            });

            const response = {
                success: true,
                optimizedCode: result.code,
                optimizationType,
                metadata: {
                    provider: 'openai',
                    language,
                    duration: Date.now() - startTime
                }
            };

            if (this.telemetryService) {
                this.telemetryService.trackAIUsage(
                    'openai',
                    result.model,
                    'code-optimization',
                    result.tokens,
                    result.cost
                );
            }

            return response;

        } catch (error) {
            if (this.telemetryService) {
                this.telemetryService.trackError(error, 'ai-code-optimization');
            }

            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // TEMPLATE GENERATION
    generateTemplate(templateType, templateName, variables = {}) {
        const [category, type] = templateType.split('.');
        const template = this.codeTemplates[category]?.[type];
        
        if (!template) {
            throw new Error(`Template ${templateType} not found`);
        }

        let generatedCode = template;
        
        // Replace template variables
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            generatedCode = generatedCode.replace(regex, value);
        });

        // Auto-generate common variables
        if (variables.ComponentName) {
            const kebabCase = variables.ComponentName
                .replace(/([A-Z])/g, '-$1')
                .toLowerCase()
                .substring(1);
            generatedCode = generatedCode.replace(/{{kebab-case-name}}/g, kebabCase);
        }

        return {
            success: true,
            code: generatedCode,
            templateType,
            variables
        };
    }

    // PUBLIC API METHODS
    getAvailableProviders() {
        return Object.entries(this.providers)
            .filter(([, provider]) => provider.available)
            .map(([name, provider]) => ({
                name,
                displayName: provider.name,
                models: provider.models
            }));
    }

    getCodeTemplates() {
        return Object.keys(this.codeTemplates).reduce((acc, category) => {
            acc[category] = Object.keys(this.codeTemplates[category]);
            return acc;
        }, {});
    }

    async getUsageStats() {
        if (!this.telemetryService) return null;
        
        const report = await this.telemetryService.generateReport('24h');
        return report?.ai || null;
    }
}

module.exports = { EnterpriseAICodeAssistant };