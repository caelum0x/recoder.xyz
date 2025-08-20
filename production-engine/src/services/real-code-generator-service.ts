/**
 * Real Code Generator Service
 * Connects Production Engine to CLI AI Hub for real code generation
 */

import { commercialAIHubService } from './commercial-ai-hub-service';
import { logger } from '../utils/logger';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { securityIntegrationService, SecurityValidationResult } from './security-integration';
import { DataClassification, IndustryStandard, ProjectType } from '../../../packages/shared/src/security/soc2-compliance-scanner';
import { ComplianceIntegrationService, ComplianceConfig, ComplianceResult } from '../compliance/compliance-integration';

// Define GeneratedCodeContext interface specifically for this service
export interface GeneratedCodeContext {
  filePath: string;
  language: string;
  framework?: string;
  projectPath: string;
  userRequirements: string;
  generatedCode: string;
  metadata: {
    model: string;
    provider: string;
    timestamp: Date;
  };
}

export interface CodeGenerationRequest {
  description: string;
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'payments';
  framework?: string;
  features?: string[];
  outputPath: string;
  userId?: string;
  // SOC 2 Compliance Configuration
  compliance?: {
    enabled: boolean;
    enforceBlocking?: boolean;
    dataClassification?: DataClassification;
    industryStandards?: IndustryStandard[];
    autoRemediation?: boolean;
  };
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
  complianceValidation?: ComplianceResult; // SOC 2 compliance results
  blockedByCompliance?: boolean; // If generation was blocked due to compliance
  metadata: {
    provider: string;
    model: string;
    tokensUsed: number;
    generationTime: number;
    complianceScore?: number; // Overall SOC 2 compliance score
  };
}

export class RealCodeGeneratorService {
  private complianceService: ComplianceIntegrationService;

  constructor() {
    
    // Initialize SOC 2 compliance service with enterprise defaults
    const complianceConfig: ComplianceConfig = {
      enabled: true,
      enforceBlocking: false, // Start with warnings, can be enabled per request
      autoRemediation: true,
      reportGeneration: true,
      industryStandards: [IndustryStandard.SOX, IndustryStandard.ISO_27001],
      dataClassification: DataClassification.INTERNAL,
      projectType: ProjectType.WEB_APPLICATION,
      customRules: []
    };
    
    this.complianceService = new ComplianceIntegrationService(complianceConfig);
    logger.info('🏛️ SOC 2 compliance scanner initialized - MASSIVE enterprise advantage over Cursor/Copilot!');
  }

  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    logger.info(`Starting code generation for: ${request.description}`);

    try {
      // Generate code using Commercial AI Hub with OpenRouter
      const generatedCode = await commercialAIHubService.generateWithBestModel(
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

      // Perform SOC 2 compliance validation
      logger.info('🏛️ Running SOC 2 compliance validation...');
      const complianceResults = await this.validateCompliance(files, request);
      const complianceValidation = complianceResults.complianceValidation;
      const blockedByCompliance = complianceResults.blockedByCompliance;

      const generationTime = Date.now() - startTime;

      // Log results
      logger.info(`Code generation completed in ${generationTime}ms, generated ${files.length} files`);
      logger.info(`🔒 Security score: ${securityValidation.securityScore}/100`);
      if (complianceValidation) {
        logger.info(`🏛️ SOC 2 compliance score: ${complianceValidation.report.summary.overallScore}%`);
        logger.info(`🏛️ Risk level: ${complianceValidation.report.summary.riskLevel}`);
      }

      // Handle security vulnerabilities
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

      // Handle compliance violations
      if (complianceValidation && complianceValidation.report.violations.length > 0) {
        const criticalCompliance = complianceValidation.report.summary.criticalViolations;
        const highCompliance = complianceValidation.report.summary.highViolations;
        
        if (criticalCompliance > 0) {
          logger.error(`🚫 Found ${criticalCompliance} critical SOC 2 compliance violations`);
        }
        if (highCompliance > 0) {
          logger.warn(`⚠️ Found ${highCompliance} high-priority SOC 2 compliance issues`);
        }

        // Log compliance recommendations
        if (complianceValidation.recommendations.length > 0) {
          logger.info('🏛️ SOC 2 Compliance Recommendations:');
          complianceValidation.recommendations.slice(0, 5).forEach((rec, i) => {
            logger.info(`${i + 1}. ${rec}`);
          });
        }
      }

      if (blockedByCompliance) {
        logger.error('🚫 CODE GENERATION BLOCKED by SOC 2 compliance enforcement');
        return {
          success: false,
          files: [],
          instructions: '',
          error: 'Code generation blocked due to critical SOC 2 compliance violations',
          complianceValidation,
          blockedByCompliance: true,
          metadata: {
            provider: 'production-engine',
            model: 'blocked-compliance',
            tokensUsed: 0,
            generationTime,
            complianceScore: complianceValidation?.report.summary.overallScore || 0
          }
        };
      }

      return {
        success: true,
        files,
        instructions,
        securityValidation,
        complianceValidation,
        blockedByCompliance: false,
        metadata: {
          provider: 'production-engine',
          model: 'auto-selected',
          tokensUsed: Math.ceil(generatedCode.length / 4),
          generationTime,
          complianceScore: complianceValidation?.report.summary.overallScore || 100
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
    
    // Enhanced parsing to handle Ollama's format where files are structured with code blocks
    // and file paths are indicated in comments
    
    // Pattern 1: Standard format with explicit file: prefix
    const standardRegex = /```(?:(\w+)\s+)?(?:file:\s*(.+?)(?:\n|$))?([\s\S]*?)```/gi;
    let match;
    
    while ((match = standardRegex.exec(generatedCode)) !== null) {
      const [, language, filePath, content] = match;
      
      if (filePath && content) {
        const cleanPath = this.cleanFilePath(filePath);
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

    // Pattern 2: Code blocks with file paths in comments (Ollama format)
    if (files.length === 0) {
      const codeBlocks = generatedCode.split(/```/);
      
      for (let i = 1; i < codeBlocks.length; i += 2) {
        if (i + 1 >= codeBlocks.length) break;
        
        const blockHeader = codeBlocks[i];
        const blockContent = codeBlocks[i + 1];
        
        if (!blockContent || blockContent.trim().length < 20) continue;
        
        // Extract file path from comment patterns in the content
        const filePathPatterns = [
          /\/\/ ([^-\n]+\.(?:tsx?|jsx?|css|html|json|md))/i, // // src/App.tsx
          /\/\* ([^-\n]+\.(?:tsx?|jsx?|css|html|json|md))/i, // /* src/App.tsx
          /^([^-\n]+\.(?:tsx?|jsx?|css|html|json|md))/m, // src/App.tsx at start of line
        ];
        
        let detectedPath = null;
        for (const pattern of filePathPatterns) {
          const pathMatch = blockContent.match(pattern);
          if (pathMatch) {
            detectedPath = pathMatch[1];
            break;
          }
        }
        
        // If no path detected, generate one based on content
        if (!detectedPath) {
          detectedPath = this.generateFilePathFromContent(blockContent, blockHeader, files.length, request);
        }
        
        if (detectedPath) {
          files.push({
            path: this.cleanFilePath(detectedPath),
            content: blockContent.trim(),
            type: this.determineFileType(detectedPath, blockContent)
          });
        }
      }
    }

    // Pattern 3: Fallback to extracting by common patterns
    if (files.length === 0) {
      files.push(...this.extractFilesByPattern(generatedCode, request));
    }

    return files;
  }

  private generateFilePathFromContent(content: string, header: string, index: number, request: CodeGenerationRequest): string {
    const cleanContent = content.toLowerCase();
    const cleanHeader = (header || '').toLowerCase();
    
    // Determine file type and extension
    let extension = '.js';
    if (cleanHeader.includes('typescript') || cleanHeader.includes('tsx') || cleanContent.includes('interface ') || cleanContent.includes(': React.FC')) {
      extension = request.framework === 'react' ? '.tsx' : '.ts';
    } else if (cleanHeader.includes('jsx') || (cleanContent.includes('export default') && cleanContent.includes('react'))) {
      extension = '.jsx';
    } else if (cleanHeader.includes('css') || cleanContent.includes('@media') || cleanContent.includes('display:')) {
      extension = '.css';
    } else if (cleanHeader.includes('json') || (cleanContent.includes('{') && cleanContent.includes('"name":'))) {
      extension = '.json';
    } else if (cleanHeader.includes('html') || cleanContent.includes('<html') || cleanContent.includes('<!doctype')) {
      extension = '.html';
    }
    
    // Generate appropriate filename based on content
    if (cleanContent.includes('package.json') || (extension === '.json' && cleanContent.includes('"scripts"'))) {
      return 'package.json';
    }
    if (cleanContent.includes('tsconfig') || (extension === '.json' && cleanContent.includes('"compilerOptions"'))) {
      return 'tsconfig.json';
    }
    if (cleanContent.includes('function app') || cleanContent.includes('const app') || cleanContent.includes('export default app')) {
      return `src/App${extension}`;
    }
    if (cleanContent.includes('readme') || extension === '.md') {
      return 'README.md';
    }
    if (cleanContent.includes('test') || cleanContent.includes('describe(') || cleanContent.includes('it(')) {
      return `src/components/Component.test${extension}`;
    }
    
    // Default filename
    const componentName = request.type.charAt(0).toUpperCase() + request.type.slice(1);
    return `src/components/${componentName}Component${extension}`;
  }

  private cleanFilePath(rawPath: string): string {
    return rawPath
      .trim()
      .replace(/^\[|\]$/g, '') // Remove surrounding brackets
      .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
      .replace(/\/+/g, '/'); // Normalize multiple slashes
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

  private async validateCompliance(files: GeneratedFile[], request: CodeGenerationRequest): Promise<{
    complianceValidation?: ComplianceResult;
    blockedByCompliance: boolean;
  }> {
    // Skip if compliance is explicitly disabled
    if (request.compliance?.enabled === false) {
      return { blockedByCompliance: false };
    }

    try {
      // Update compliance configuration based on request
      if (request.compliance) {
        const updatedConfig: Partial<ComplianceConfig> = {};
        
        if (request.compliance.enforceBlocking !== undefined) {
          updatedConfig.enforceBlocking = request.compliance.enforceBlocking;
        }
        if (request.compliance.dataClassification) {
          updatedConfig.dataClassification = request.compliance.dataClassification;
        }
        if (request.compliance.industryStandards) {
          updatedConfig.industryStandards = request.compliance.industryStandards;
        }
        if (request.compliance.autoRemediation !== undefined) {
          updatedConfig.autoRemediation = request.compliance.autoRemediation;
        }

        // Determine project type from request type
        const projectTypeMap: Record<string, ProjectType> = {
          'web': ProjectType.WEB_APPLICATION,
          'backend': ProjectType.API_SERVICE,
          'blockchain': ProjectType.FINANCIAL_SYSTEM,
          'payments': ProjectType.PAYMENT_SYSTEM,
          'mobile': ProjectType.WEB_APPLICATION,
          'ai': ProjectType.WEB_APPLICATION
        };
        updatedConfig.projectType = projectTypeMap[request.type] || ProjectType.WEB_APPLICATION;

        this.complianceService.updateConfiguration(updatedConfig);
      }

      // Validate each generated file
      let overallPassed = true;
      let overallBlocked = false;
      const allViolations: any[] = [];
      const allRecommendations: string[] = [];
      let worstReport: any = null;
      let worstScore = 100;

      for (const file of files.filter(f => f.type === 'code')) {
        const context: GeneratedCodeContext = {
          filePath: file.path,
          language: this.determineLanguageFromPath(file.path),
          framework: request.framework,
          projectPath: request.outputPath,
          userRequirements: request.description,
          generatedCode: file.content,
          metadata: {
            model: 'auto-selected',
            provider: 'production-engine',
            timestamp: new Date()
          }
        };

        const result = await this.complianceService.validateSingleFile(context);
        
        if (!result.passed) {
          overallPassed = false;
        }
        
        if (result.blockedByCompliance) {
          overallBlocked = true;
        }

        // Collect all violations and recommendations
        allViolations.push(...result.report.violations);
        allRecommendations.push(...result.recommendations);

        // Track worst performing file
        if (result.report.summary.overallScore < worstScore) {
          worstScore = result.report.summary.overallScore;
          worstReport = result.report;
        }
      }

      // If no files were processed, return success
      if (!worstReport) {
        return { blockedByCompliance: false };
      }

      // Create combined compliance result
      const complianceValidation: ComplianceResult = {
        passed: overallPassed,
        report: worstReport, // Use the worst report as representative
        blockedByCompliance: overallBlocked,
        recommendations: Array.from(new Set(allRecommendations)) // Remove duplicates
      };

      return {
        complianceValidation,
        blockedByCompliance: overallBlocked
      };

    } catch (error) {
      logger.error('SOC 2 compliance validation failed:', error);
      return { blockedByCompliance: false };
    }
  }

  private determineLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'sol': 'solidity',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp'
    };
    
    return languageMap[ext || ''] || 'javascript';
  }

  // Public methods for compliance management

  async scanProjectCompliance(projectPath: string): Promise<Map<string, any>> {
    logger.info(`🏛️ Running SOC 2 compliance scan on project: ${projectPath}`);
    return await this.complianceService.scanProject(projectPath);
  }

  async generateComplianceDashboard(projectPath: string): Promise<string> {
    logger.info(`📊 Generating SOC 2 compliance dashboard for: ${projectPath}`);
    return await this.complianceService.generateProjectComplianceDashboard(projectPath);
  }

  updateComplianceConfiguration(config: Partial<ComplianceConfig>): void {
    this.complianceService.updateConfiguration(config);
    logger.info('🏛️ SOC 2 compliance configuration updated');
  }

  getComplianceConfiguration(): ComplianceConfig {
    return this.complianceService.getConfiguration();
  }

  async getAvailableProviders(): Promise<string[]> {
    return await commercialAIHubService.getAvailableProviders();
  }
}

// Export singleton instance
export const realCodeGeneratorService = new RealCodeGeneratorService();