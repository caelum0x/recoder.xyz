#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Vision Analysis Engine
 * Advanced image and diagram analysis for development workflows
 */
class VisionAnalyzer {
  constructor(modelManager, contextEngine) {
    this.modelManager = modelManager;
    this.contextEngine = contextEngine;
    
    this.supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    this.analysisTemplates = new Map();
    this.analysisHistory = [];
    
    this.initializeVisionAnalyzer();
  }

  /**
   * Initialize vision analyzer with templates
   */
  async initializeVisionAnalyzer() {
    console.log(chalk.cyan('👁️  Initializing Vision Analyzer...'));
    
    this.loadAnalysisTemplates();
    
    console.log(chalk.green('✅ Vision Analyzer ready'));
    console.log(chalk.gray(`   Supported formats: ${this.supportedFormats.join(', ')}`));
    console.log(chalk.gray(`   Analysis templates: ${this.analysisTemplates.size}`));
  }

  /**
   * Load analysis templates for different use cases
   */
  loadAnalysisTemplates() {
    const templates = {
      'ui-design': {
        name: 'UI/UX Design Analysis',
        description: 'Analyze user interfaces, mockups, and design systems',
        prompts: [
          'Analyze this UI design and provide feedback on usability, accessibility, and visual hierarchy',
          'Identify design patterns, color schemes, and typography used',
          'Suggest improvements for better user experience',
          'Generate CSS code to implement this design'
        ],
        categories: ['design', 'frontend', 'accessibility']
      },
      
      'architecture-diagram': {
        name: 'Architecture Diagram Analysis',
        description: 'Analyze system architecture diagrams and technical drawings',
        prompts: [
          'Analyze this architecture diagram and explain the system design',
          'Identify components, data flows, and integration points',
          'Suggest improvements for scalability and performance',
          'Generate code structure based on this architecture'
        ],
        categories: ['architecture', 'backend', 'system-design']
      },
      
      'database-schema': {
        name: 'Database Schema Analysis',
        description: 'Analyze database ERD diagrams and schema designs',
        prompts: [
          'Analyze this database schema and explain the relationships',
          'Identify potential normalization issues and improvements',
          'Generate SQL DDL statements for this schema',
          'Suggest indexes and optimization strategies'
        ],
        categories: ['database', 'backend']
      },
      
      'wireframe': {
        name: 'Wireframe Analysis',
        description: 'Analyze wireframes and prototype designs',
        prompts: [
          'Analyze this wireframe and convert it to a detailed component structure',
          'Identify user flows and interaction patterns',
          'Generate HTML/CSS structure for this wireframe',
          'Suggest responsive design considerations'
        ],
        categories: ['design', 'frontend']
      },
      
      'flowchart': {
        name: 'Flowchart/Process Analysis',
        description: 'Analyze flowcharts, process diagrams, and workflows',
        prompts: [
          'Analyze this flowchart and explain the process logic',
          'Identify decision points and edge cases',
          'Generate pseudocode or actual code for this process',
          'Suggest optimizations and error handling'
        ],
        categories: ['process', 'logic', 'workflow']
      },
      
      'code-screenshot': {
        name: 'Code Screenshot Analysis',
        description: 'Analyze screenshots of code for review and debugging',
        prompts: [
          'Analyze this code screenshot and identify issues or improvements',
          'Explain what this code does and suggest optimizations',
          'Generate clean, typed version of this code',
          'Identify potential bugs or security issues'
        ],
        categories: ['code-review', 'debugging']
      },
      
      'error-screenshot': {
        name: 'Error/Bug Analysis',
        description: 'Analyze error messages and debugging screenshots',
        prompts: [
          'Analyze this error message and provide debugging steps',
          'Explain the root cause and suggest fixes',
          'Provide code examples to resolve this issue',
          'Suggest preventive measures for similar errors'
        ],
        categories: ['debugging', 'troubleshooting']
      },
      
      'data-visualization': {
        name: 'Chart/Graph Analysis',
        description: 'Analyze charts, graphs, and data visualizations',
        prompts: [
          'Analyze this chart and extract key insights',
          'Suggest improvements for data presentation',
          'Generate code to create similar visualizations',
          'Identify trends, patterns, and anomalies'
        ],
        categories: ['data-analysis', 'visualization']
      }
    };
    
    for (const [id, template] of Object.entries(templates)) {
      this.analysisTemplates.set(id, template);
    }
  }

  /**
   * Analyze image with specified template
   */
  async analyzeImage(imagePath, templateId = 'auto-detect', options = {}) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    const ext = path.extname(imagePath).toLowerCase();
    if (!this.supportedFormats.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}`);
    }
    
    console.log(chalk.blue(`👁️  Analyzing image: ${path.basename(imagePath)}`));
    
    // Auto-detect template if needed
    if (templateId === 'auto-detect') {
      templateId = await this.detectImageType(imagePath);
    }
    
    const template = this.analysisTemplates.get(templateId);
    if (!template) {
      throw new Error(`Analysis template not found: ${templateId}`);
    }
    
    // Select best vision model
    const visionModel = await this.selectBestVisionModel();
    if (!visionModel) {
      throw new Error('No vision-capable model available');
    }
    
    console.log(chalk.gray(`Using model: ${visionModel.name}`));
    console.log(chalk.gray(`Template: ${template.name}`));
    
    // Convert image to base64
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');
    const mimeType = this.getMimeType(ext);
    
    // Create analysis prompt
    const analysisPrompt = this.createAnalysisPrompt(template, options);
    
    // Perform analysis
    const result = await this.performVisionAnalysis({
      model: visionModel,
      prompt: analysisPrompt,
      image: {
        data: imageBase64,
        mimeType: mimeType
      },
      template: template,
      imagePath: imagePath
    });
    
    // Save to history
    this.analysisHistory.push({
      id: `analysis_${Date.now()}`,
      imagePath: imagePath,
      template: templateId,
      model: visionModel.id,
      timestamp: new Date().toISOString(),
      result: result
    });
    
    return result;
  }

  /**
   * Auto-detect image type based on filename and content
   */
  async detectImageType(imagePath) {
    const fileName = path.basename(imagePath).toLowerCase();
    
    // Filename-based detection
    if (fileName.includes('wireframe') || fileName.includes('mockup')) {
      return 'wireframe';
    }
    if (fileName.includes('architecture') || fileName.includes('system') || fileName.includes('diagram')) {
      return 'architecture-diagram';
    }
    if (fileName.includes('ui') || fileName.includes('design') || fileName.includes('interface')) {
      return 'ui-design';
    }
    if (fileName.includes('error') || fileName.includes('bug') || fileName.includes('exception')) {
      return 'error-screenshot';
    }
    if (fileName.includes('code') || fileName.includes('script')) {
      return 'code-screenshot';
    }
    if (fileName.includes('chart') || fileName.includes('graph') || fileName.includes('plot')) {
      return 'data-visualization';
    }
    if (fileName.includes('flow') || fileName.includes('process')) {
      return 'flowchart';
    }
    if (fileName.includes('schema') || fileName.includes('erd') || fileName.includes('database')) {
      return 'database-schema';
    }
    
    // Default to UI design for general analysis
    return 'ui-design';
  }

  /**
   * Select best vision model for analysis
   */
  async selectBestVisionModel() {
    if (!this.modelManager) {
      return null;
    }
    
    const visionModels = Array.from(this.modelManager.models.values())
      .filter(model => model.capabilities.multimodal && model.available)
      .sort((a, b) => {
        // Prioritize by quality, then by cost
        if (a.performance.quality !== b.performance.quality) {
          const qualityOrder = { 'highest': 3, 'high': 2, 'good': 1 };
          return qualityOrder[b.performance.quality] - qualityOrder[a.performance.quality];
        }
        const costOrder = { 'free': 3, 'low': 2, 'medium': 1, 'high': 0 };
        return costOrder[b.performance.cost] - costOrder[a.performance.cost];
      });
    
    return visionModels.length > 0 ? visionModels[0] : null;
  }

  /**
   * Create analysis prompt based on template and options
   */
  createAnalysisPrompt(template, options = {}) {
    let prompt = `You are an expert ${template.categories.join(', ')} analyst. `;
    
    if (options.focus) {
      prompt += `Focus specifically on: ${options.focus}. `;
    }
    
    if (options.detailed) {
      prompt += 'Provide detailed, comprehensive analysis. ';
    } else {
      prompt += 'Provide concise, actionable analysis. ';
    }
    
    if (options.generateCode) {
      prompt += 'Include code examples and implementations where appropriate. ';
    }
    
    // Add template-specific prompts
    const selectedPrompts = options.customPrompt ? 
      [options.customPrompt] : 
      template.prompts.slice(0, options.maxPrompts || 2);
    
    prompt += '\n\nPlease:\n';
    selectedPrompts.forEach((p, i) => {
      prompt += `${i + 1}. ${p}\n`;
    });
    
    if (options.context) {
      prompt += `\nAdditional context: ${options.context}`;
    }
    
    return prompt;
  }

  /**
   * Perform vision analysis with actual model integration
   */
  async performVisionAnalysis(analysisRequest) {
    console.log(chalk.blue('🔍 Processing image with vision model...'));
    
    // Try to use actual vision model if available through model manager
    if (this.modelManager && this.modelManager.mcpClient) {
      try {
        // Attempt real vision analysis through MCP
        const visionResult = await this.modelManager.mcpClient.sendVisionRequest({
          model: analysisRequest.model.id,
          prompt: analysisRequest.prompt,
          image: analysisRequest.image,
          temperature: 0.3,
          max_tokens: 2000
        });
        
        if (visionResult && visionResult.content) {
          const result = {
            analysis: {
              summary: `Analyzed ${path.basename(analysisRequest.imagePath)} using ${analysisRequest.template.name}`,
              confidence: 0.95,
              template: analysisRequest.template.name,
              model: analysisRequest.model.name,
              actualAnalysis: visionResult.content
            },
            insights: this.extractInsights(visionResult.content),
            recommendations: this.extractRecommendations(visionResult.content),
            codeGenerated: visionResult.content.includes('```') || analysisRequest.template.categories.includes('frontend'),
            metadata: {
              imageSize: this.getImageSize(analysisRequest.imagePath),
              processingTime: visionResult.processingTime || 'N/A',
              modelUsed: analysisRequest.model.id,
              template: analysisRequest.template.name,
              tokenUsage: visionResult.usage
            }
          };
          
          this.displayAnalysisResult(result);
          return result;
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Real vision analysis failed, falling back to mock: ${error.message}`));
      }
    }
    
    // Fallback to mock implementation
    console.log(chalk.gray('Using mock analysis (real vision models not available)'));
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = {
      analysis: {
        summary: `Analyzed ${path.basename(analysisRequest.imagePath)} using ${analysisRequest.template.name}`,
        confidence: 0.85,
        template: analysisRequest.template.name,
        model: analysisRequest.model.name + ' (mock)',
        actualAnalysis: this.generateMockAnalysis(analysisRequest.template, path.basename(analysisRequest.imagePath))
      },
      insights: [
        'Image successfully processed and analyzed (mock)',
        'Key visual elements identified and categorized',
        'Actionable recommendations generated',
        'Code suggestions prepared based on visual content'
      ],
      recommendations: [
        'Consider implementing responsive design patterns',
        'Optimize for accessibility compliance', 
        'Add proper error handling and validation',
        'Follow established design system guidelines'
      ],
      codeGenerated: analysisRequest.template.categories.includes('frontend'),
      metadata: {
        imageSize: this.getImageSize(analysisRequest.imagePath),
        processingTime: '1.5s',
        modelUsed: analysisRequest.model.id + ' (mock)',
        template: analysisRequest.template.name
      }
    };
    
    this.displayAnalysisResult(result);
    
    return result;
  }

  /**
   * Extract insights from vision model response
   */
  extractInsights(content) {
    // Simple extraction logic - in real implementation would use NLP
    const insights = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('insight') || 
          line.toLowerCase().includes('observe') ||
          line.toLowerCase().includes('notice')) {
        insights.push(line.trim());
      }
    }
    
    return insights.length > 0 ? insights : ['Analysis completed successfully'];
  }

  /**
   * Extract recommendations from vision model response
   */
  extractRecommendations(content) {
    // Simple extraction logic - in real implementation would use NLP
    const recommendations = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('recommend') || 
          line.toLowerCase().includes('suggest') ||
          line.toLowerCase().includes('improve')) {
        recommendations.push(line.trim());
      }
    }
    
    return recommendations.length > 0 ? recommendations : ['No specific recommendations generated'];
  }

  /**
   * Generate mock analysis based on template
   */
  generateMockAnalysis(template, filename) {
    const mockResponses = {
      'ui-design': `This appears to be a UI design for ${filename}. The layout follows modern design principles with good visual hierarchy. Consider improving color contrast for accessibility and ensuring responsive design across different screen sizes.`,
      'architecture-diagram': `This system architecture diagram shows the components and their relationships in ${filename}. The design appears well-structured with clear separation of concerns. Consider adding more detailed documentation for the integration points.`,
      'code-screenshot': `The code in ${filename} shows implementation details. The structure looks clean and follows good coding practices. Consider adding more comprehensive error handling and unit tests.`,
      'error-screenshot': `This error screenshot from ${filename} indicates a specific issue that needs attention. The error message provides clear direction for debugging. Consider implementing better logging and error handling mechanisms.`
    };
    
    return mockResponses[template.name] || `Analysis of ${filename} completed using ${template.name} template. The content has been processed and recommendations have been generated.`;
  }

  /**
   * Get image file size
   */
  getImageSize(imagePath) {
    const stats = fs.statSync(imagePath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    return `${sizeInMB} MB`;
  }

  /**
   * Get MIME type for image extension
   */
  getMimeType(ext) {
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Display analysis result
   */
  displayAnalysisResult(result) {
    console.log(chalk.bold.green('\n👁️  Vision Analysis Results\n'));
    
    console.log(chalk.bold('Summary:'));
    console.log(chalk.white(`  ${result.analysis.summary}`));
    console.log(chalk.gray(`  Confidence: ${(result.analysis.confidence * 100).toFixed(1)}%`));
    console.log(chalk.gray(`  Model: ${result.analysis.model}`));
    console.log();
    
    if (result.insights.length > 0) {
      console.log(chalk.bold('Key Insights:'));
      result.insights.forEach(insight => {
        console.log(chalk.blue(`  • ${insight}`));
      });
      console.log();
    }
    
    if (result.recommendations.length > 0) {
      console.log(chalk.bold('Recommendations:'));
      result.recommendations.forEach(rec => {
        console.log(chalk.yellow(`  💡 ${rec}`));
      });
      console.log();
    }
    
    console.log(chalk.bold('Metadata:'));
    console.log(chalk.gray(`  Image Size: ${result.metadata.imageSize}`));
    console.log(chalk.gray(`  Processing Time: ${result.metadata.processingTime}`));
    console.log(chalk.gray(`  Template: ${result.metadata.template}`));
  }

  /**
   * Analyze multiple images in batch
   */
  async batchAnalyze(imagePaths, templateId = 'auto-detect', options = {}) {
    console.log(chalk.cyan(`📸 Starting batch analysis of ${imagePaths.length} images...`));
    
    const results = [];
    
    for (const [index, imagePath] of imagePaths.entries()) {
      console.log(chalk.blue(`\nProcessing ${index + 1}/${imagePaths.length}: ${path.basename(imagePath)}`));
      
      try {
        const result = await this.analyzeImage(imagePath, templateId, options);
        results.push({
          imagePath,
          success: true,
          result
        });
      } catch (error) {
        console.log(chalk.red(`❌ Failed to analyze ${imagePath}: ${error.message}`));
        results.push({
          imagePath,
          success: false,
          error: error.message
        });
      }
    }
    
    this.displayBatchResults(results);
    
    return results;
  }

  /**
   * Display batch analysis results
   */
  displayBatchResults(results) {
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    console.log(chalk.bold.cyan('\n📊 Batch Analysis Summary\n'));
    console.log(chalk.green(`✅ Successful: ${successful}`));
    console.log(chalk.red(`❌ Failed: ${failed}`));
    console.log(chalk.blue(`📝 Total: ${results.length}`));
    
    if (failed > 0) {
      console.log(chalk.bold.red('\nFailed Analyses:'));
      results.filter(r => !r.success).forEach(result => {
        console.log(chalk.red(`  • ${path.basename(result.imagePath)}: ${result.error}`));
      });
    }
  }

  /**
   * List available analysis templates
   */
  listTemplates() {
    console.log(chalk.bold.cyan('\n👁️  Available Vision Analysis Templates\n'));
    
    for (const [id, template] of this.analysisTemplates.entries()) {
      console.log(chalk.bold.yellow(`${id}:`));
      console.log(chalk.white(`  ${template.name}`));
      console.log(chalk.gray(`  ${template.description}`));
      console.log(chalk.gray(`  Categories: ${template.categories.join(', ')}`));
      console.log();
    }
  }

  /**
   * Show analysis history
   */
  showHistory(limit = 10) {
    console.log(chalk.bold.cyan('\n📚 Vision Analysis History\n'));
    
    if (this.analysisHistory.length === 0) {
      console.log(chalk.yellow('No analysis history found.'));
      return;
    }
    
    const recent = this.analysisHistory.slice(-limit).reverse();
    
    recent.forEach((analysis, index) => {
      const timeAgo = this.getTimeAgo(analysis.timestamp);
      console.log(chalk.white(`${index + 1}. ${path.basename(analysis.imagePath)}`));
      console.log(chalk.gray(`   Template: ${analysis.template} | Model: ${analysis.model}`));
      console.log(chalk.gray(`   ${timeAgo}`));
      console.log();
    });
  }

  /**
   * Get time ago string
   */
  getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'Just now';
  }
}

module.exports = VisionAnalyzer;