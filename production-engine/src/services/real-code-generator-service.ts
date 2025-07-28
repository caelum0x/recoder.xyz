/**
 * Real Code Generator Service
 * Connects Production Engine to CLI AI Hub for real code generation
 */

import { AIHubService } from './ai-hub-service';
import { logger } from '../utils/logger';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { securityIntegrationService, SecurityValidationResult } from './security-integration';

export interface CodeGenerationRequest {
  description: string;
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'payments';
  framework?: string;
  features?: string[];
  outputPath: string;
  userId?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'code' | 'config' | 'test' | 'documentation';
}

export interface CodeGenerationResult {
  success: boolean;
  files: GeneratedFile[];
  instructions: string;
  error?: string;
  securityValidation?: SecurityValidationResult;
  metadata: {
    provider: string;
    model: string;
    tokensUsed: number;
    generationTime: number;
  };
}

export class RealCodeGeneratorService {
  private aiHub: AIHubService;

  constructor() {
    this.aiHub = new AIHubService();
  }

  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    logger.info(`Starting code generation for: ${request.description}`);

    try {
      // Generate code using AI Hub with real providers
      const generatedCode = await this.aiHub.generateWithBestModel(
        this.buildPrompt(request),
        {
          type: request.type,
          complexity: 'medium',
          maxTokens: 8000,
          temperature: 0.3
        }
      );

      // Parse the generated code into structured files
      const files = this.parseGeneratedCode(generatedCode, request);

      // Write files to the specified output path
      await this.writeGeneratedFiles(files, request.outputPath);

      // Extract instructions
      const instructions = this.extractInstructions(generatedCode);

      // Perform security validation
      logger.info('🔒 Running security validation...');
      const securityValidation = await securityIntegrationService.validateGeneratedCode(files, request.type);

      const generationTime = Date.now() - startTime;

      logger.info(`Code generation completed in ${generationTime}ms, generated ${files.length} files`);
      logger.info(`🔒 Security score: ${securityValidation.securityScore}/100`);

      if (securityValidation.vulnerabilities.length > 0) {
        const criticalVulns = securityValidation.vulnerabilities.filter(v => v.severity === 'critical').length;
        const highVulns = securityValidation.vulnerabilities.filter(v => v.severity === 'high').length;
        
        if (criticalVulns > 0) {
          logger.warn(`⚠️ Found ${criticalVulns} critical vulnerabilities - review required before deployment`);
        }
        if (highVulns > 0) {
          logger.warn(`⚠️ Found ${highVulns} high-severity vulnerabilities`);
        }
      }

      if (securityValidation.secrets.length > 0) {
        logger.warn(`🔑 Found ${securityValidation.secrets.length} potential secrets - use environment variables`);
      }

      return {
        success: true,
        files,
        instructions,
        securityValidation,
        metadata: {
          provider: 'production-engine',
          model: 'auto-selected',
          tokensUsed: Math.ceil(generatedCode.length / 4),
          generationTime
        }
      };

    } catch (error: any) {
      logger.error(`Code generation failed: ${error.message}`);
      return {
        success: false,
        files: [],
        instructions: '',
        error: error.message,
        metadata: {
          provider: 'production-engine',
          model: 'failed',
          tokensUsed: 0,
          generationTime: Date.now() - startTime
        }
      };
    }
  }

  private buildPrompt(request: CodeGenerationRequest): string {
    const basePrompt = `Generate a complete, production-ready ${request.type} application: ${request.description}

CRITICAL REQUIREMENTS:
- Generate REAL, WORKING code - no placeholders or mock implementations
- Include all necessary files (components, configs, tests, documentation)
- Use modern best practices and proper project structure
- Include real database operations, API calls, and authentication where needed
- Add comprehensive error handling and validation
- Make the code production-deployable

`;

    const typeSpecificRequirements = {
      web: `WEB APPLICATION REQUIREMENTS:
- Use ${request.framework || 'React'} with TypeScript
- Include proper component architecture and state management
- Add responsive CSS/styling (use Tailwind CSS or similar)
- Implement real API endpoints and data fetching
- Include proper routing and navigation
- Add SEO optimization and performance features`,

      blockchain: `BLOCKCHAIN APPLICATION REQUIREMENTS:
- Generate real smart contracts that compile and deploy
- Include actual token operations and DeFi functionality
- Add proper wallet integration with transaction handling
- Use Solana/Ethereum best practices
- Include security audits and gas optimization
- Add comprehensive testing for contracts`,

      backend: `BACKEND API REQUIREMENTS:
- Create real REST/GraphQL API endpoints
- Include actual database schemas and CRUD operations
- Add JWT authentication and authorization
- Implement rate limiting and security middleware
- Include proper logging and monitoring
- Add comprehensive API documentation`,

      mobile: `MOBILE APPLICATION REQUIREMENTS:
- Use React Native with TypeScript
- Include proper navigation and state management
- Add platform-specific optimizations (iOS/Android)
- Implement real device features (camera, location, etc.)
- Include app store deployment configurations
- Add comprehensive testing setup`,

      ai: `AI APPLICATION REQUIREMENTS:
- Implement real AI/ML model integrations
- Include proper data preprocessing and model serving
- Add real-time inference capabilities
- Implement model monitoring and performance tracking
- Include proper vector databases and embeddings
- Add comprehensive AI safety measures`
    };

    const specificRequirements = typeSpecificRequirements[request.type] || '';

    const featuresSection = request.features && request.features.length > 0
      ? `\nFEATURES TO INCLUDE:\n${request.features.map(f => `- ${f}`).join('\n')}\n`
      : '';

    const structureRequirements = `
PROJECT STRUCTURE REQUIREMENTS:
- Create a complete project structure with proper organization
- Include package.json with all necessary dependencies
- Add configuration files (tsconfig.json, .env.example, etc.)
- Include README.md with setup and deployment instructions
- Add proper .gitignore and development configs
- Include testing configuration and sample tests

OUTPUT FORMAT:
Please provide the code in the following format:
\`\`\`[language] file:[filepath]
[code content]
\`\`\`

For each file, specify the complete file path and include all necessary code.
Start with the main application files, then configuration, then tests and documentation.
`;

    return basePrompt + specificRequirements + featuresSection + structureRequirements;
  }

  private parseGeneratedCode(generatedCode: string, request: CodeGenerationRequest): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    
    // Extract code blocks with file paths
    const codeBlockRegex = /```(?:(\w+)\s+)?(?:file:\s*(.+?)(?:\n|$))?([\s\S]*?)```/gi;
    let match;

    while ((match = codeBlockRegex.exec(generatedCode)) !== null) {
      const [, language, filePath, content] = match;
      
      if (filePath && content) {
        const cleanPath = filePath.trim();
        const cleanContent = content.trim();
        
        if (cleanContent) {
          files.push({
            path: cleanPath,
            content: cleanContent,
            type: this.determineFileType(cleanPath, cleanContent)
          });
        }
      }
    }

    // If no files with paths found, try to extract files by common patterns
    if (files.length === 0) {
      files.push(...this.extractFilesByPattern(generatedCode, request));
    }

    return files;
  }

  private extractFilesByPattern(content: string, request: CodeGenerationRequest): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    
    // Extract different code blocks and infer file names
    const patterns = [
      { regex: /```(?:typescript|ts|jsx|tsx)([\s\S]*?)```/gi, ext: request.framework === 'react' ? '.tsx' : '.ts' },
      { regex: /```(?:javascript|js)([\s\S]*?)```/gi, ext: '.js' },
      { regex: /```(?:json)([\s\S]*?)```/gi, ext: '.json' },
      { regex: /```(?:css|scss)([\s\S]*?)```/gi, ext: '.css' },
      { regex: /```(?:html)([\s\S]*?)```/gi, ext: '.html' },
      { regex: /```(?:markdown|md)([\s\S]*?)```/gi, ext: '.md' }
    ];

    let fileIndex = 0;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const codeContent = match[1].trim();
        if (codeContent) {
          const fileName = this.generateFileName(codeContent, pattern.ext, fileIndex++, request);
          files.push({
            path: fileName,
            content: codeContent,
            type: this.determineFileType(fileName, codeContent)
          });
        }
      }
    }

    return files;
  }

  private generateFileName(content: string, extension: string, index: number, request: CodeGenerationRequest): string {
    // Try to determine filename from content
    if (content.includes('package.json') || extension === '.json') {
      return 'package.json';
    }
    if (content.includes('README') || extension === '.md') {
      return 'README.md';
    }
    if (content.includes('export default') && extension.includes('ts')) {
      return `${request.type}-app${extension}`;
    }
    if (content.includes('function App') || content.includes('const App')) {
      return `App${extension}`;
    }
    if (content.includes('test') || content.includes('describe')) {
      return `test-${index}${extension}`;
    }
    
    return `generated-file-${index}${extension}`;
  }

  private determineFileType(filePath: string, content: string): 'code' | 'config' | 'test' | 'documentation' {
    const path = filePath.toLowerCase();
    
    if (path.includes('test') || path.includes('.spec.') || content.includes('describe(') || content.includes('it(')) {
      return 'test';
    }
    if (path.includes('package.json') || path.includes('tsconfig') || path.includes('.env') || path.includes('config')) {
      return 'config';
    }
    if (path.includes('readme') || path.includes('.md') || path.includes('doc')) {
      return 'documentation';
    }
    return 'code';
  }

  private async writeGeneratedFiles(files: GeneratedFile[], outputPath: string): Promise<void> {
    for (const file of files) {
      const fullPath = join(outputPath, file.path);
      const dir = dirname(fullPath);
      
      // Create directory if it doesn't exist
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(fullPath, file.content, 'utf-8');
      logger.info(`Generated file: ${fullPath}`);
    }
  }

  private extractInstructions(generatedCode: string): string {
    // Extract setup/installation instructions from the generated code
    const instructionPatterns = [
      /## Setup(?:[\s\S]*?)(?=##|$)/i,
      /## Installation(?:[\s\S]*?)(?=##|$)/i,
      /## Getting Started(?:[\s\S]*?)(?=##|$)/i,
      /## Usage(?:[\s\S]*?)(?=##|$)/i,
      /# Setup(?:[\s\S]*?)(?=#|$)/i,
      /Instructions?:?([\s\S]*?)(?=\n\n|$)/i
    ];

    for (const pattern of instructionPatterns) {
      const match = generatedCode.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    // Generate basic instructions if none found
    return `## Setup Instructions

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Open your browser and navigate to the application.

For production deployment, run:
\`\`\`bash
npm run build
\`\`\``;
  }

  async getAvailableProviders(): Promise<string[]> {
    return await this.aiHub.getAvailableProviders();
  }
}

// Export singleton instance
export const realCodeGeneratorService = new RealCodeGeneratorService();