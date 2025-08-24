"use strict";
/**
 * Real Code Generator Service
 * Connects Production Engine to CLI AI Hub for real code generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.realCodeGeneratorService = exports.RealCodeGeneratorService = void 0;
const commercial_ai_hub_service_1 = require("./commercial-ai-hub-service");
const logger_1 = require("../utils/logger");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const fs_1 = require("fs");
const security_integration_1 = require("./security-integration");
const soc2_compliance_scanner_1 = require("../../../packages/shared/src/security/soc2-compliance-scanner");
const compliance_integration_1 = require("../compliance/compliance-integration");
class RealCodeGeneratorService {
    constructor() {
        // Initialize SOC 2 compliance service with enterprise defaults
        const complianceConfig = {
            enabled: true,
            enforceBlocking: false, // Start with warnings, can be enabled per request
            autoRemediation: true,
            reportGeneration: true,
            industryStandards: [soc2_compliance_scanner_1.IndustryStandard.SOX, soc2_compliance_scanner_1.IndustryStandard.ISO_27001],
            dataClassification: soc2_compliance_scanner_1.DataClassification.INTERNAL,
            projectType: soc2_compliance_scanner_1.ProjectType.WEB_APPLICATION,
            customRules: []
        };
        this.complianceService = new compliance_integration_1.ComplianceIntegrationService(complianceConfig);
        logger_1.logger.info('🏛️ SOC 2 compliance scanner initialized - MASSIVE enterprise advantage over Cursor/Copilot!');
    }
    async generateCode(request) {
        const startTime = Date.now();
        logger_1.logger.info(`Starting code generation for: ${request.description}`);
        try {
            // Generate code using Commercial AI Hub with OpenRouter
            const generatedCode = await commercial_ai_hub_service_1.commercialAIHubService.generateWithBestModel(this.buildPrompt(request), {
                type: request.type,
                complexity: 'medium',
                maxTokens: 8000,
                temperature: 0.3
            });
            // Parse the generated code into structured files
            const files = this.parseGeneratedCode(generatedCode, request);
            // Write files to the specified output path
            await this.writeGeneratedFiles(files, request.outputPath);
            // Extract instructions
            const instructions = this.extractInstructions(generatedCode);
            // Perform security validation
            logger_1.logger.info('🔒 Running security validation...');
            const securityValidation = await security_integration_1.securityIntegrationService.validateGeneratedCode(files, request.type);
            // Perform SOC 2 compliance validation
            logger_1.logger.info('🏛️ Running SOC 2 compliance validation...');
            const complianceResults = await this.validateCompliance(files, request);
            const complianceValidation = complianceResults.complianceValidation;
            const blockedByCompliance = complianceResults.blockedByCompliance;
            const generationTime = Date.now() - startTime;
            // Log results
            logger_1.logger.info(`Code generation completed in ${generationTime}ms, generated ${files.length} files`);
            logger_1.logger.info(`🔒 Security score: ${securityValidation.securityScore}/100`);
            if (complianceValidation) {
                logger_1.logger.info(`🏛️ SOC 2 compliance score: ${complianceValidation.report.summary.overallScore}%`);
                logger_1.logger.info(`🏛️ Risk level: ${complianceValidation.report.summary.riskLevel}`);
            }
            // Handle security vulnerabilities
            if (securityValidation.vulnerabilities.length > 0) {
                const criticalVulns = securityValidation.vulnerabilities.filter(v => v.severity === 'critical').length;
                const highVulns = securityValidation.vulnerabilities.filter(v => v.severity === 'high').length;
                if (criticalVulns > 0) {
                    logger_1.logger.warn(`⚠️ Found ${criticalVulns} critical vulnerabilities - review required before deployment`);
                }
                if (highVulns > 0) {
                    logger_1.logger.warn(`⚠️ Found ${highVulns} high-severity vulnerabilities`);
                }
            }
            if (securityValidation.secrets.length > 0) {
                logger_1.logger.warn(`🔑 Found ${securityValidation.secrets.length} potential secrets - use environment variables`);
            }
            // Handle compliance violations
            if (complianceValidation && complianceValidation.report.violations.length > 0) {
                const criticalCompliance = complianceValidation.report.summary.criticalViolations;
                const highCompliance = complianceValidation.report.summary.highViolations;
                if (criticalCompliance > 0) {
                    logger_1.logger.error(`🚫 Found ${criticalCompliance} critical SOC 2 compliance violations`);
                }
                if (highCompliance > 0) {
                    logger_1.logger.warn(`⚠️ Found ${highCompliance} high-priority SOC 2 compliance issues`);
                }
                // Log compliance recommendations
                if (complianceValidation.recommendations.length > 0) {
                    logger_1.logger.info('🏛️ SOC 2 Compliance Recommendations:');
                    complianceValidation.recommendations.slice(0, 5).forEach((rec, i) => {
                        logger_1.logger.info(`${i + 1}. ${rec}`);
                    });
                }
            }
            if (blockedByCompliance) {
                logger_1.logger.error('🚫 CODE GENERATION BLOCKED by SOC 2 compliance enforcement');
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
        }
        catch (error) {
            logger_1.logger.error(`Code generation failed: ${error.message}`);
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
    buildPrompt(request) {
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
    parseGeneratedCode(generatedCode, request) {
        const files = [];
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
                if (i + 1 >= codeBlocks.length)
                    break;
                const blockHeader = codeBlocks[i];
                const blockContent = codeBlocks[i + 1];
                if (!blockContent || blockContent.trim().length < 20)
                    continue;
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
    generateFilePathFromContent(content, header, index, request) {
        const cleanContent = content.toLowerCase();
        const cleanHeader = (header || '').toLowerCase();
        // Determine file type and extension
        let extension = '.js';
        if (cleanHeader.includes('typescript') || cleanHeader.includes('tsx') || cleanContent.includes('interface ') || cleanContent.includes(': React.FC')) {
            extension = request.framework === 'react' ? '.tsx' : '.ts';
        }
        else if (cleanHeader.includes('jsx') || (cleanContent.includes('export default') && cleanContent.includes('react'))) {
            extension = '.jsx';
        }
        else if (cleanHeader.includes('css') || cleanContent.includes('@media') || cleanContent.includes('display:')) {
            extension = '.css';
        }
        else if (cleanHeader.includes('json') || (cleanContent.includes('{') && cleanContent.includes('"name":'))) {
            extension = '.json';
        }
        else if (cleanHeader.includes('html') || cleanContent.includes('<html') || cleanContent.includes('<!doctype')) {
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
    cleanFilePath(rawPath) {
        return rawPath
            .trim()
            .replace(/^\[|\]$/g, '') // Remove surrounding brackets
            .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
            .replace(/\/+/g, '/'); // Normalize multiple slashes
    }
    extractFilesByPattern(content, request) {
        const files = [];
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
    generateFileName(content, extension, index, request) {
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
    determineFileType(filePath, content) {
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
    async writeGeneratedFiles(files, outputPath) {
        for (const file of files) {
            const fullPath = (0, path_1.join)(outputPath, file.path);
            const dir = (0, path_1.dirname)(fullPath);
            // Create directory if it doesn't exist
            if (!(0, fs_1.existsSync)(dir)) {
                await (0, promises_1.mkdir)(dir, { recursive: true });
            }
            await (0, promises_1.writeFile)(fullPath, file.content, 'utf-8');
            logger_1.logger.info(`Generated file: ${fullPath}`);
        }
    }
    extractInstructions(generatedCode) {
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
    async validateCompliance(files, request) {
        // Skip if compliance is explicitly disabled
        if (request.compliance?.enabled === false) {
            return { blockedByCompliance: false };
        }
        try {
            // Update compliance configuration based on request
            if (request.compliance) {
                const updatedConfig = {};
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
                const projectTypeMap = {
                    'web': soc2_compliance_scanner_1.ProjectType.WEB_APPLICATION,
                    'backend': soc2_compliance_scanner_1.ProjectType.API_SERVICE,
                    'blockchain': soc2_compliance_scanner_1.ProjectType.FINANCIAL_SYSTEM,
                    'payments': soc2_compliance_scanner_1.ProjectType.PAYMENT_SYSTEM,
                    'mobile': soc2_compliance_scanner_1.ProjectType.WEB_APPLICATION,
                    'ai': soc2_compliance_scanner_1.ProjectType.WEB_APPLICATION
                };
                updatedConfig.projectType = projectTypeMap[request.type] || soc2_compliance_scanner_1.ProjectType.WEB_APPLICATION;
                this.complianceService.updateConfiguration(updatedConfig);
            }
            // Validate each generated file
            let overallPassed = true;
            let overallBlocked = false;
            const allViolations = [];
            const allRecommendations = [];
            let worstReport = null;
            let worstScore = 100;
            for (const file of files.filter(f => f.type === 'code')) {
                const context = {
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
            const complianceValidation = {
                passed: overallPassed,
                report: worstReport, // Use the worst report as representative
                blockedByCompliance: overallBlocked,
                recommendations: Array.from(new Set(allRecommendations)) // Remove duplicates
            };
            return {
                complianceValidation,
                blockedByCompliance: overallBlocked
            };
        }
        catch (error) {
            logger_1.logger.error('SOC 2 compliance validation failed:', error);
            return { blockedByCompliance: false };
        }
    }
    determineLanguageFromPath(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const languageMap = {
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
    async scanProjectCompliance(projectPath) {
        logger_1.logger.info(`🏛️ Running SOC 2 compliance scan on project: ${projectPath}`);
        return await this.complianceService.scanProject(projectPath);
    }
    async generateComplianceDashboard(projectPath) {
        logger_1.logger.info(`📊 Generating SOC 2 compliance dashboard for: ${projectPath}`);
        return await this.complianceService.generateProjectComplianceDashboard(projectPath);
    }
    updateComplianceConfiguration(config) {
        this.complianceService.updateConfiguration(config);
        logger_1.logger.info('🏛️ SOC 2 compliance configuration updated');
    }
    getComplianceConfiguration() {
        return this.complianceService.getConfiguration();
    }
    async getAvailableProviders() {
        return await commercial_ai_hub_service_1.commercialAIHubService.getAvailableProviders();
    }
}
exports.RealCodeGeneratorService = RealCodeGeneratorService;
// Export singleton instance
exports.realCodeGeneratorService = new RealCodeGeneratorService();
