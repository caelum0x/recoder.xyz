/**
 * TEMPLATE ENGINE
 * Advanced templating system with AI integration and variable substitution
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { EventEmitter } from 'events';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: RegExp | ((value: any) => boolean);
  options?: string[]; // For enum-like variables
}

export interface TemplateFile {
  path: string;
  content: string;
  variables: TemplateVariable[];
  conditional?: string; // Condition for including this file
  language: string;
  description: string;
}

export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  files: TemplateFile[];
  globalVariables: TemplateVariable[];
  hooks?: {
    preGeneration?: string;
    postGeneration?: string;
  };
  dependencies?: string[];
  devDependencies?: string[];
}

export class TemplateEngine extends EventEmitter {
  private templates = new Map<string, TemplateManifest>();
  private handlebars: typeof Handlebars;

  constructor() {
    super();
    this.handlebars = Handlebars.create();
    this.registerHelpers();
    console.log('📝 Template Engine initialized');
  }

  private registerHelpers(): void {
    // String helpers
    this.handlebars.registerHelper('camelCase', (str: string) => {
      return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      }).replace(/\s+/g, '');
    });

    this.handlebars.registerHelper('pascalCase', (str: string) => {
      return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
        return word.toUpperCase();
      }).replace(/\s+/g, '');
    });

    this.handlebars.registerHelper('kebabCase', (str: string) => {
      return str.replace(/\s+/g, '-').toLowerCase();
    });

    this.handlebars.registerHelper('snakeCase', (str: string) => {
      return str.replace(/\s+/g, '_').toLowerCase();
    });

    // Conditional helpers
    this.handlebars.registerHelper('ifEquals', function(arg1: any, arg2: any, options: any) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    this.handlebars.registerHelper('ifNotEquals', function(arg1: any, arg2: any, options: any) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    this.handlebars.registerHelper('ifContains', function(array: any[], item: any, options: any) {
      return array.includes(item) ? options.fn(this) : options.inverse(this);
    });

    // Date helpers
    this.handlebars.registerHelper('currentYear', () => new Date().getFullYear());
    this.handlebars.registerHelper('currentDate', () => new Date().toISOString().split('T')[0]);
    this.handlebars.registerHelper('timestamp', () => Date.now());

    // Code generation helpers
    this.handlebars.registerHelper('indent', function(text: string, spaces: number) {
      const indentation = ' '.repeat(spaces);
      return text.split('\n').map(line => indentation + line).join('\n');
    });

    this.handlebars.registerHelper('comment', function(text: string, language: string) {
      switch (language) {
        case 'javascript':
        case 'typescript':
        case 'java':
        case 'rust':
        case 'go':
          return `// ${text}`;
        case 'python':
        case 'bash':
          return `# ${text}`;
        case 'html':
        case 'xml':
          return `<!-- ${text} -->`;
        case 'css':
          return `/* ${text} */`;
        default:
          return `# ${text}`;
      }
    });

    this.handlebars.registerHelper('generateImports', function(dependencies: string[], language: string) {
      if (!dependencies || dependencies.length === 0) return '';
      
      switch (language) {
        case 'typescript':
        case 'javascript':
          return dependencies.map(dep => `import ${dep} from '${dep}';`).join('\n');
        case 'python':
          return dependencies.map(dep => `import ${dep}`).join('\n');
        case 'rust':
          return dependencies.map(dep => `use ${dep};`).join('\n');
        case 'go':
          return `import (\n${dependencies.map(dep => `    "${dep}"`).join('\n')}\n)`;
        default:
          return '';
      }
    });

    // File system helpers
    this.handlebars.registerHelper('fileExtension', function(language: string) {
      const extensions = {
        javascript: 'js',
        typescript: 'ts',
        python: 'py',
        rust: 'rs',
        go: 'go',
        java: 'java',
        html: 'html',
        css: 'css',
        json: 'json',
        yaml: 'yml',
        markdown: 'md'
      };
      return extensions[language] || 'txt';
    });

    console.log('🔧 Template helpers registered');
  }

  async loadTemplate(templatePath: string): Promise<TemplateManifest> {
    try {
      const manifestPath = path.join(templatePath, 'template.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: TemplateManifest = JSON.parse(manifestContent);

      // Load template files
      for (const file of manifest.files) {
        const filePath = path.join(templatePath, file.path);
        file.content = await fs.readFile(filePath, 'utf-8');
      }

      this.templates.set(manifest.id, manifest);
      console.log(`📁 Template loaded: ${manifest.id}`);
      
      return manifest;
    } catch (error) {
      console.error(`❌ Failed to load template from ${templatePath}:`, error);
      throw error;
    }
  }

  async renderTemplate(templateId: string, variables: Record<string, any>): Promise<Array<{path: string, content: string}>> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate variables
    this.validateVariables(template, variables);

    // Execute pre-generation hook if exists
    if (template.hooks?.preGeneration) {
      await this.executeHook(template.hooks.preGeneration, variables);
    }

    const renderedFiles: Array<{path: string, content: string}> = [];

    // Render each file
    for (const file of template.files) {
      // Check conditional inclusion
      if (file.conditional && !this.evaluateCondition(file.conditional, variables)) {
        continue;
      }

      try {
        // Compile template
        const compiledTemplate = this.handlebars.compile(file.content);
        
        // Render with variables
        const renderedContent = compiledTemplate({
          ...variables,
          template: template,
          file: file
        });

        // Render file path
        const compiledPath = this.handlebars.compile(file.path);
        const renderedPath = compiledPath(variables);

        renderedFiles.push({
          path: renderedPath,
          content: renderedContent
        });

        console.log(`✅ Rendered file: ${renderedPath}`);
      } catch (error) {
        console.error(`❌ Failed to render file ${file.path}:`, error);
        throw error;
      }
    }

    // Execute post-generation hook if exists
    if (template.hooks?.postGeneration) {
      await this.executeHook(template.hooks.postGeneration, { ...variables, renderedFiles });
    }

    console.log(`🎨 Template rendered: ${templateId} (${renderedFiles.length} files)`);
    return renderedFiles;
  }

  private validateVariables(template: TemplateManifest, variables: Record<string, any>): void {
    const allVariables = [
      ...template.globalVariables,
      ...template.files.flatMap(f => f.variables)
    ];

    for (const variable of allVariables) {
      const value = variables[variable.name];

      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        throw new Error(`Required variable missing: ${variable.name}`);
      }

      // Skip validation if variable is not provided and not required
      if (value === undefined || value === null) {
        // Set default value if available
        if (variable.defaultValue !== undefined) {
          variables[variable.name] = variable.defaultValue;
        }
        continue;
      }

      // Type validation
      if (!this.validateType(value, variable.type)) {
        throw new Error(`Invalid type for variable ${variable.name}: expected ${variable.type}, got ${typeof value}`);
      }

      // Custom validation
      if (variable.validation) {
        if (variable.validation instanceof RegExp) {
          if (!variable.validation.test(String(value))) {
            throw new Error(`Variable ${variable.name} does not match required pattern`);
          }
        } else if (typeof variable.validation === 'function') {
          if (!variable.validation(value)) {
            throw new Error(`Variable ${variable.name} failed custom validation`);
          }
        }
      }

      // Options validation
      if (variable.options && !variable.options.includes(value)) {
        throw new Error(`Variable ${variable.name} must be one of: ${variable.options.join(', ')}`);
      }
    }
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      // Simple condition evaluation
      // Replace variable names with their values
      let evaluableCondition = condition;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        evaluableCondition = evaluableCondition.replace(regex, JSON.stringify(value));
      }

      // Evaluate the condition (be careful with eval!)
      return Function(`"use strict"; return (${evaluableCondition})`)();
    } catch (error) {
      console.warn(`⚠️ Failed to evaluate condition "${condition}":`, error);
      return true; // Default to including the file
    }
  }

  private async executeHook(hookScript: string, context: Record<string, any>): Promise<void> {
    try {
      // Execute hook script with context
      const hookFunction = Function('context', hookScript);
      await hookFunction(context);
    } catch (error) {
      console.error('❌ Hook execution failed:', error);
      throw error;
    }
  }

  // Template creation utilities
  async createTemplate(manifest: TemplateManifest, outputPath: string): Promise<void> {
    const templateDir = path.join(outputPath, manifest.id);
    await fs.mkdir(templateDir, { recursive: true });

    // Write manifest
    const manifestPath = path.join(templateDir, 'template.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Write template files
    for (const file of manifest.files) {
      const filePath = path.join(templateDir, file.path);
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, file.content);
    }

    console.log(`✅ Template created: ${manifest.id} at ${templateDir}`);
  }

  // Utility methods
  getTemplate(templateId: string): TemplateManifest | undefined {
    return this.templates.get(templateId);
  }

  getTemplateVariables(templateId: string): TemplateVariable[] {
    const template = this.templates.get(templateId);
    if (!template) return [];

    return [
      ...template.globalVariables,
      ...template.files.flatMap(f => f.variables)
    ].filter((variable, index, array) => 
      array.findIndex(v => v.name === variable.name) === index
    );
  }

  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  async scanTemplateDirectory(directory: string): Promise<TemplateManifest[]> {
    const templates: TemplateManifest[] = [];
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const templatePath = path.join(directory, entry.name);
          const manifestPath = path.join(templatePath, 'template.json');
          
          try {
            await fs.access(manifestPath);
            const template = await this.loadTemplate(templatePath);
            templates.push(template);
          } catch (error) {
            console.warn(`⚠️ Skipping invalid template directory: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to scan template directory ${directory}:`, error);
    }

    return templates;
  }

  // Advanced features
  async mergeTemplates(templateIds: string[], mergedId: string): Promise<TemplateManifest> {
    const templates = templateIds.map(id => this.templates.get(id)).filter(Boolean) as TemplateManifest[];
    
    if (templates.length === 0) {
      throw new Error('No valid templates found for merging');
    }

    const mergedTemplate: TemplateManifest = {
      id: mergedId,
      name: `Merged Template: ${templates.map(t => t.name).join(' + ')}`,
      description: `Merged from: ${templates.map(t => t.name).join(', ')}`,
      version: '1.0.0',
      author: 'Template Engine',
      files: [],
      globalVariables: [],
      dependencies: [],
      devDependencies: []
    };

    // Merge files
    for (const template of templates) {
      mergedTemplate.files.push(...template.files);
    }

    // Merge global variables (remove duplicates)
    const variableMap = new Map<string, TemplateVariable>();
    for (const template of templates) {
      for (const variable of template.globalVariables) {
        if (!variableMap.has(variable.name)) {
          variableMap.set(variable.name, variable);
        }
      }
    }
    mergedTemplate.globalVariables = Array.from(variableMap.values());

    // Merge dependencies
    const allDeps = templates.flatMap(t => t.dependencies || []);
    const allDevDeps = templates.flatMap(t => t.devDependencies || []);
    mergedTemplate.dependencies = [...new Set(allDeps)];
    mergedTemplate.devDependencies = [...new Set(allDevDeps)];

    this.templates.set(mergedId, mergedTemplate);
    console.log(`🔗 Templates merged: ${mergedId}`);
    
    return mergedTemplate;
  }

  async validateTemplate(templateId: string): Promise<{ valid: boolean; errors: string[] }> {
    const template = this.templates.get(templateId);
    if (!template) {
      return { valid: false, errors: [`Template not found: ${templateId}`] };
    }

    const errors: string[] = [];

    // Validate manifest structure
    if (!template.id || !template.name || !template.version) {
      errors.push('Template manifest is missing required fields');
    }

    // Validate template files
    for (const file of template.files) {
      if (!file.path || !file.content) {
        errors.push(`File is missing required fields: ${file.path || 'unknown'}`);
      }

      // Try to compile template
      try {
        this.handlebars.compile(file.content);
      } catch (error) {
        errors.push(`Template compilation error in ${file.path}: ${error.message}`);
      }
    }

    // Validate variables
    for (const variable of template.globalVariables) {
      if (!variable.name || !variable.type) {
        errors.push(`Variable is missing required fields: ${variable.name || 'unknown'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Statistics and monitoring
  getUsageStats(): any {
    return {
      templatesLoaded: this.templates.size,
      helpers: Object.keys(this.handlebars.helpers).length
    };
  }

  clearTemplates(): void {
    this.templates.clear();
    console.log('🧹 All templates cleared');
  }
}

export const templateEngine = new TemplateEngine();