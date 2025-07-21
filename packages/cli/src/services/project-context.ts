/**
 * Project Context Understanding System
 * Reads and analyzes project documentation and configuration
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { AIHub, TaskContext } from './ai-hub';

export interface ProjectContext {
  path: string;
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'general';
  framework?: string;
  architecture?: string;
  techStack: string[];
  dependencies: string[];
  configuration: ProjectConfiguration;
  documentation: ProjectDocumentation;
  preferences: AIPreferences;
}

export interface ProjectConfiguration {
  packageJson?: any;
  hasTypeScript: boolean;
  hasTesting: boolean;
  hasLinting: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  buildTool?: string;
  deployment?: string[];
}

export interface ProjectDocumentation {
  readme?: string;
  knowledgeMd?: string;
  architecture?: string;
  conventions?: string;
  apiDocs?: string;
}

export interface AIPreferences {
  preferredModels: string[];
  agentConfigurations: Record<string, any>;
  customInstructions?: string;
  excludedFeatures: string[];
  securityLevel: 'low' | 'medium' | 'high';
  codeStyle: 'minimal' | 'standard' | 'detailed';
}

export class ProjectContextAnalyzer {
  private aiHub: AIHub;

  constructor() {
    this.aiHub = AIHub.getInstance();
  }

  /**
   * Analyze project context from directory
   */
  async analyzeProject(projectPath: string): Promise<ProjectContext> {
    Logger.info(`🔍 Analyzing project context at: ${projectPath}`);

    const context: ProjectContext = {
      path: projectPath,
      type: 'general',
      techStack: [],
      dependencies: [],
      configuration: {
        hasTypeScript: false,
        hasTesting: false,
        hasLinting: false,
        hasDocker: false,
        hasCI: false
      },
      documentation: {},
      preferences: {
        preferredModels: ['groq', 'claude'],
        agentConfigurations: {},
        excludedFeatures: [],
        securityLevel: 'medium',
        codeStyle: 'standard'
      }
    };

    try {
      // Read configuration files
      await this.readProjectConfiguration(projectPath, context);
      
      // Read documentation
      await this.readProjectDocumentation(projectPath, context);
      
      // Read AI preferences
      await this.readAIPreferences(projectPath, context);
      
      // Infer project type and details
      await this.inferProjectDetails(context);
      
      Logger.info(`✅ Project analysis complete: ${context.type} project with ${context.techStack.length} technologies`);
      
      return context;

    } catch (error: any) {
      Logger.error(`❌ Project analysis failed: ${error.message}`);
      return context; // Return basic context even if analysis fails
    }
  }

  /**
   * Read project configuration files
   */
  private async readProjectConfiguration(projectPath: string, context: ProjectContext): Promise<void> {
    // Read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      context.configuration.packageJson = await fs.readJson(packageJsonPath);
      
      // Extract dependencies
      const deps = context.configuration.packageJson.dependencies || {};
      const devDeps = context.configuration.packageJson.devDependencies || {};
      context.dependencies = [...Object.keys(deps), ...Object.keys(devDeps)];
    }

    // Check for TypeScript
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    context.configuration.hasTypeScript = await fs.pathExists(tsConfigPath);

    // Check for testing
    const jestConfigPath = path.join(projectPath, 'jest.config.js');
    const vitestConfigPath = path.join(projectPath, 'vitest.config.ts');
    context.configuration.hasTesting = 
      await fs.pathExists(jestConfigPath) || 
      await fs.pathExists(vitestConfigPath) ||
      context.dependencies.some(dep => dep.includes('jest') || dep.includes('vitest') || dep.includes('mocha'));

    // Check for linting
    const eslintConfigPath = path.join(projectPath, '.eslintrc.js');
    const eslintConfigJsonPath = path.join(projectPath, '.eslintrc.json');
    context.configuration.hasLinting = 
      await fs.pathExists(eslintConfigPath) || 
      await fs.pathExists(eslintConfigJsonPath) ||
      context.dependencies.some(dep => dep.includes('eslint'));

    // Check for Docker
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    const dockerComposePath = path.join(projectPath, 'docker-compose.yml');
    context.configuration.hasDocker = 
      await fs.pathExists(dockerfilePath) || 
      await fs.pathExists(dockerComposePath);

    // Check for CI/CD
    const githubActionsPath = path.join(projectPath, '.github', 'workflows');
    const gitlabCIPath = path.join(projectPath, '.gitlab-ci.yml');
    context.configuration.hasCI = 
      await fs.pathExists(githubActionsPath) || 
      await fs.pathExists(gitlabCIPath);

    // Determine build tool
    if (context.dependencies.includes('vite')) {
      context.configuration.buildTool = 'vite';
    } else if (context.dependencies.includes('webpack')) {
      context.configuration.buildTool = 'webpack';
    } else if (context.dependencies.includes('next')) {
      context.configuration.buildTool = 'next';
    } else if (context.dependencies.includes('nuxt')) {
      context.configuration.buildTool = 'nuxt';
    }
  }

  /**
   * Read project documentation files
   */
  private async readProjectDocumentation(projectPath: string, context: ProjectContext): Promise<void> {
    // Read README.md
    const readmePath = path.join(projectPath, 'README.md');
    if (await fs.pathExists(readmePath)) {
      context.documentation.readme = await fs.readFile(readmePath, 'utf8');
    }

    // Read knowledge.md - Project docs, architecture, conventions
    const knowledgePath = path.join(projectPath, 'knowledge.md');
    if (await fs.pathExists(knowledgePath)) {
      context.documentation.knowledgeMd = await fs.readFile(knowledgePath, 'utf8');
      Logger.info('📖 Found knowledge.md - project documentation');
    }

    // Read architecture documentation
    const archPaths = [
      path.join(projectPath, 'ARCHITECTURE.md'),
      path.join(projectPath, 'docs', 'architecture.md'),
      path.join(projectPath, 'docs', 'ARCHITECTURE.md')
    ];

    for (const archPath of archPaths) {
      if (await fs.pathExists(archPath)) {
        context.documentation.architecture = await fs.readFile(archPath, 'utf8');
        break;
      }
    }

    // Read API documentation
    const apiPaths = [
      path.join(projectPath, 'API.md'),
      path.join(projectPath, 'docs', 'api.md'),
      path.join(projectPath, 'docs', 'API.md')
    ];

    for (const apiPath of apiPaths) {
      if (await fs.pathExists(apiPath)) {
        context.documentation.apiDocs = await fs.readFile(apiPath, 'utf8');
        break;
      }
    }
  }

  /**
   * Read AI preferences from recoder.md
   */
  private async readAIPreferences(projectPath: string, context: ProjectContext): Promise<void> {
    // Read recoder.md - AI preferences, agent configurations
    const recoderPath = path.join(projectPath, 'recoder.md');
    if (await fs.pathExists(recoderPath)) {
      const content = await fs.readFile(recoderPath, 'utf8');
      Logger.info('🤖 Found recoder.md - AI preferences and agent configurations');
      
      // Parse AI preferences from the file
      context.preferences = this.parseAIPreferences(content);
    }
  }

  /**
   * Parse AI preferences from recoder.md content
   */
  private parseAIPreferences(content: string): AIPreferences {
    const preferences: AIPreferences = {
      preferredModels: ['groq', 'claude'],
      agentConfigurations: {},
      excludedFeatures: [],
      securityLevel: 'medium',
      codeStyle: 'standard'
    };

    try {
      // Extract preferred models
      const modelsMatch = content.match(/preferred[_\s]*models?\s*:?\s*\[([^\]]+)\]/i);
      if (modelsMatch) {
        preferences.preferredModels = modelsMatch[1]
          .split(',')
          .map(m => m.trim().replace(/['"]/g, ''))
          .filter(Boolean);
      }

      // Extract security level
      const securityMatch = content.match(/security[_\s]*level\s*:?\s*(low|medium|high)/i);
      if (securityMatch) {
        preferences.securityLevel = securityMatch[1] as 'low' | 'medium' | 'high';
      }

      // Extract code style
      const styleMatch = content.match(/code[_\s]*style\s*:?\s*(minimal|standard|detailed)/i);
      if (styleMatch) {
        preferences.codeStyle = styleMatch[1] as 'minimal' | 'standard' | 'detailed';
      }

      // Extract custom instructions
      const instructionsMatch = content.match(/custom[_\s]*instructions?\s*:?\s*[\r\n]+([^#]+)/i);
      if (instructionsMatch) {
        preferences.customInstructions = instructionsMatch[1].trim();
      }

      // Extract excluded features
      const excludedMatch = content.match(/excluded[_\s]*features?\s*:?\s*\[([^\]]+)\]/i);
      if (excludedMatch) {
        preferences.excludedFeatures = excludedMatch[1]
          .split(',')
          .map(f => f.trim().replace(/['"]/g, ''))
          .filter(Boolean);
      }

    } catch (error) {
      Logger.warn('⚠️ Could not fully parse recoder.md preferences');
    }

    return preferences;
  }

  /**
   * Infer project type and framework from dependencies and structure
   */
  private async inferProjectDetails(context: ProjectContext): Promise<void> {
    const deps = context.dependencies;

    // Determine project type
    if (deps.includes('@solana/web3.js') || deps.includes('@coral-xyz/anchor') || deps.includes('ethers') || deps.includes('web3')) {
      context.type = 'blockchain';
      if (deps.includes('@solana/web3.js')) {
        context.framework = 'solana';
      } else if (deps.includes('ethers') || deps.includes('web3')) {
        context.framework = 'ethereum';
      }
    } else if (deps.includes('react') || deps.includes('next') || deps.includes('vue') || deps.includes('svelte')) {
      context.type = 'web';
      if (deps.includes('next')) {
        context.framework = 'nextjs';
      } else if (deps.includes('vue')) {
        context.framework = 'vue';
      } else if (deps.includes('svelte')) {
        context.framework = 'svelte';
      } else if (deps.includes('react')) {
        context.framework = 'react';
      }
    } else if (deps.includes('react-native') || deps.includes('@expo/cli')) {
      context.type = 'mobile';
      context.framework = 'react-native';
    } else if (deps.includes('express') || deps.includes('fastify') || deps.includes('koa') || deps.includes('@nestjs/core')) {
      context.type = 'backend';
      if (deps.includes('@nestjs/core')) {
        context.framework = 'nestjs';
      } else if (deps.includes('express')) {
        context.framework = 'express';
      } else if (deps.includes('fastify')) {
        context.framework = 'fastify';
      }
    } else if (deps.includes('openai') || deps.includes('@anthropic-ai/sdk') || deps.includes('@google/generative-ai')) {
      context.type = 'ai';
    }

    // Build tech stack
    context.techStack = [];
    
    if (context.configuration.hasTypeScript) context.techStack.push('TypeScript');
    if (context.framework) context.techStack.push(context.framework);
    if (context.configuration.buildTool) context.techStack.push(context.configuration.buildTool);
    if (context.configuration.hasTesting) context.techStack.push('Testing');
    if (context.configuration.hasDocker) context.techStack.push('Docker');
    
    // Add database technologies
    if (deps.includes('prisma')) context.techStack.push('Prisma');
    if (deps.includes('mongoose')) context.techStack.push('MongoDB');
    if (deps.includes('pg') || deps.includes('postgres')) context.techStack.push('PostgreSQL');
    if (deps.includes('mysql2')) context.techStack.push('MySQL');

    // Add other technologies
    if (deps.includes('stripe')) context.techStack.push('Stripe');
    if (deps.includes('graphql')) context.techStack.push('GraphQL');
    if (deps.includes('redis')) context.techStack.push('Redis');
    if (deps.includes('socket.io')) context.techStack.push('Socket.IO');
  }

  /**
   * Get project-specific system prompt for AI
   */
  getProjectSystemPrompt(context: ProjectContext): string {
    let prompt = `You are working on a ${context.type} project`;
    
    if (context.framework) {
      prompt += ` using ${context.framework}`;
    }

    if (context.techStack.length > 0) {
      prompt += ` with the following tech stack: ${context.techStack.join(', ')}`;
    }

    prompt += '.\n\n';

    // Add project documentation context
    if (context.documentation.knowledgeMd) {
      prompt += `PROJECT DOCUMENTATION:\n${context.documentation.knowledgeMd}\n\n`;
    }

    if (context.documentation.architecture) {
      prompt += `ARCHITECTURE:\n${context.documentation.architecture}\n\n`;
    }

    // Add AI preferences
    if (context.preferences.customInstructions) {
      prompt += `CUSTOM INSTRUCTIONS:\n${context.preferences.customInstructions}\n\n`;
    }

    // Add code style preferences
    prompt += `CODE STYLE: ${context.preferences.codeStyle}\n`;
    prompt += `SECURITY LEVEL: ${context.preferences.securityLevel}\n`;

    if (context.preferences.excludedFeatures.length > 0) {
      prompt += `EXCLUDED FEATURES: ${context.preferences.excludedFeatures.join(', ')}\n`;
    }

    // Add project-specific rules
    prompt += '\nIMPORTANT PROJECT RULES:\n';
    prompt += `- This is a ${context.type} project - generate code appropriate for this domain\n`;
    prompt += `- Follow the existing architecture and patterns shown in the project\n`;
    prompt += `- Use the established tech stack: ${context.techStack.join(', ')}\n`;
    
    if (context.configuration.hasTypeScript) {
      prompt += '- Use TypeScript with proper typing\n';
    }
    
    if (context.configuration.hasTesting) {
      prompt += '- Include appropriate tests for new functionality\n';
    }

    return prompt;
  }

  /**
   * Create example recoder.md file
   */
  async createExampleRecoderConfig(projectPath: string): Promise<void> {
    const recoderPath = path.join(projectPath, 'recoder.md');
    
    const exampleContent = `# Recoder AI Configuration

## AI Preferences

### Preferred Models
preferred_models: ["claude", "groq", "gemini"]

### Security Level
security_level: medium

### Code Style
code_style: standard

### Custom Instructions
\`\`\`
- Always include error handling and proper logging
- Use functional programming patterns where appropriate
- Prioritize code readability and maintainability
- Include comprehensive documentation for complex functions
- Follow existing naming conventions in the project
\`\`\`

### Agent Configurations

#### Blockchain Agent
- Specialization: Solana, Ethereum smart contracts
- Security: high
- Code style: detailed
- Focus: gas optimization, security audits

#### Web Agent  
- Specialization: React, Next.js, responsive design
- Security: medium
- Code style: standard
- Focus: performance, accessibility, SEO

#### Backend Agent
- Specialization: APIs, databases, authentication
- Security: high  
- Code style: detailed
- Focus: scalability, security, monitoring

### Excluded Features
excluded_features: ["experimental-apis", "deprecated-libraries"]

## Project Context

This configuration helps Recoder understand your project preferences and generate code that fits your specific requirements and coding standards.
`;

    await fs.writeFile(recoderPath, exampleContent, 'utf8');
    Logger.info('✅ Created example recoder.md configuration file');
  }
}