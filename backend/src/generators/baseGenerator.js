const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class BaseGenerator {
  constructor(options = {}) {
    this.options = {
      outputPath: process.cwd(),
      overwrite: false,
      createDirectories: true,
      validateInput: true,
      dryRun: false,
      ...options
    };
    
    this.templates = new Map();
    this.generatedFiles = [];
    this.errors = [];
  }

  async generate(input, context = {}) {
    throw new Error('generate method must be implemented by subclass');
  }

  validateInput(input, requiredFields = []) {
    if (!input) {
      throw new Error('Input is required for generation');
    }

    for (const field of requiredFields) {
      if (!(field in input)) {
        throw new Error(`Required field '${field}' is missing from input`);
      }
    }

    return true;
  }

  registerTemplate(name, template) {
    if (typeof template === 'string') {
      this.templates.set(name, { content: template, type: 'string' });
    } else if (typeof template === 'function') {
      this.templates.set(name, { content: template, type: 'function' });
    } else if (typeof template === 'object' && template.content) {
      this.templates.set(name, template);
    } else {
      throw new Error(`Invalid template format for '${name}'`);
    }
  }

  getTemplate(name) {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template '${name}' not found`);
    }
    return template;
  }

  renderTemplate(templateName, data = {}) {
    const template = this.getTemplate(templateName);
    
    if (template.type === 'function') {
      return template.content(data);
    } else if (template.type === 'string') {
      return this.interpolateTemplate(template.content, data);
    } else {
      throw new Error(`Unknown template type: ${template.type}`);
    }
  }

  interpolateTemplate(template, data) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(data, key.trim());
      return value !== undefined ? value : match;
    });
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  async writeFile(filePath, content, options = {}) {
    try {
      const fullPath = path.resolve(this.options.outputPath, filePath);
      const directory = path.dirname(fullPath);

      // Create directories if needed
      if (this.options.createDirectories && !await FileUtils.fileExists(directory)) {
        await FileUtils.createDirectory(directory);
      }

      // Check if file exists and handle overwrite
      if (await FileUtils.fileExists(fullPath) && !this.options.overwrite && !options.overwrite) {
        throw new Error(`File ${fullPath} already exists and overwrite is disabled`);
      }

      // Dry run mode - don't actually write files
      if (this.options.dryRun) {
        this.generatedFiles.push({
          path: fullPath,
          size: content.length,
          action: 'would_create'
        });
        logger.info(`[DRY RUN] Would create file: ${fullPath}`);
        return fullPath;
      }

      await FileUtils.writeFile(fullPath, content);
      
      this.generatedFiles.push({
        path: fullPath,
        size: content.length,
        action: 'created'
      });

      logger.info(`Generated file: ${fullPath}`);
      return fullPath;
    } catch (error) {
      const errorInfo = {
        file: filePath,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      this.errors.push(errorInfo);
      logger.error(`Failed to write file ${filePath}:`, error);
      throw error;
    }
  }

  async copyFile(sourcePath, destPath, options = {}) {
    try {
      const fullDestPath = path.resolve(this.options.outputPath, destPath);
      const directory = path.dirname(fullDestPath);

      if (this.options.createDirectories && !await FileUtils.fileExists(directory)) {
        await FileUtils.createDirectory(directory);
      }

      if (this.options.dryRun) {
        this.generatedFiles.push({
          path: fullDestPath,
          source: sourcePath,
          action: 'would_copy'
        });
        logger.info(`[DRY RUN] Would copy file: ${sourcePath} -> ${fullDestPath}`);
        return fullDestPath;
      }

      await FileUtils.copyFile(sourcePath, fullDestPath);
      
      this.generatedFiles.push({
        path: fullDestPath,
        source: sourcePath,
        action: 'copied'
      });

      logger.info(`Copied file: ${sourcePath} -> ${fullDestPath}`);
      return fullDestPath;
    } catch (error) {
      const errorInfo = {
        file: destPath,
        source: sourcePath,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      this.errors.push(errorInfo);
      logger.error(`Failed to copy file ${sourcePath} to ${destPath}:`, error);
      throw error;
    }
  }

  async generateFromStructure(structure, basePath = '') {
    const results = [];

    for (const [key, value] of Object.entries(structure)) {
      const currentPath = basePath ? path.join(basePath, key) : key;

      if (typeof value === 'string') {
        // It's a file content
        const filePath = await this.writeFile(currentPath, value);
        results.push({ type: 'file', path: filePath });
      } else if (typeof value === 'object' && value.template) {
        // It's a template reference
        const content = this.renderTemplate(value.template, value.data || {});
        const filePath = await this.writeFile(currentPath, content);
        results.push({ type: 'file', path: filePath, template: value.template });
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // It's a directory structure
        await FileUtils.createDirectory(path.resolve(this.options.outputPath, currentPath));
        const subResults = await this.generateFromStructure(value, currentPath);
        results.push({ type: 'directory', path: currentPath, children: subResults });
      }
    }

    return results;
  }

  createGenerationResult(success = true, metadata = {}) {
    return {
      success,
      generatedFiles: this.generatedFiles,
      errors: this.errors,
      summary: {
        totalFiles: this.generatedFiles.length,
        totalErrors: this.errors.length,
        totalSize: this.generatedFiles.reduce((sum, file) => sum + (file.size || 0), 0)
      },
      metadata: {
        generator: this.constructor.name,
        timestamp: new Date().toISOString(),
        options: this.options,
        ...metadata
      }
    };
  }

  createErrorResult(error, context = {}) {
    logger.error(`Generation failed in ${this.constructor.name}:`, {
      error: error.message,
      context
    });

    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'GENERATION_ERROR',
        generator: this.constructor.name
      },
      generatedFiles: this.generatedFiles,
      errors: this.errors,
      metadata: {
        timestamp: new Date().toISOString(),
        generator: this.constructor.name,
        context
      }
    };
  }

  async performAsyncGeneration(input, generationFunction) {
    try {
      const startTime = Date.now();
      const result = await generationFunction(input);
      const duration = Date.now() - startTime;
      
      logger.debug(`Generation completed in ${duration}ms`, {
        generator: this.constructor.name,
        filesGenerated: this.generatedFiles.length
      });
      
      return result;
    } catch (error) {
      logger.error(`Async generation failed:`, {
        generator: this.constructor.name,
        error: error.message
      });
      throw error;
    }
  }

  formatCode(code, language = 'javascript') {
    // Basic code formatting - in practice, you might use prettier or similar
    const lines = code.split('\n');
    let indentLevel = 0;
    const indentSize = 2;
    
    return lines.map(line => {
      const trimmed = line.trim();
      
      if (trimmed.includes('}') && !trimmed.includes('{')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      
      const formatted = ' '.repeat(indentLevel * indentSize) + trimmed;
      
      if (trimmed.includes('{') && !trimmed.includes('}')) {
        indentLevel++;
      }
      
      return formatted;
    }).join('\n');
  }

  generateUniqueId(prefix = 'gen') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sanitizeFileName(fileName) {
    return fileName
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  sanitizeVariableName(varName) {
    return varName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(\d)/, '_$1')
      .replace(/_{2,}/g, '_');
  }

  toCamelCase(str) {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '');
  }

  toPascalCase(str) {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase())
      .replace(/\s+/g, '');
  }

  toKebabCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  toSnakeCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  generateImports(dependencies = []) {
    return dependencies
      .map(dep => {
        if (typeof dep === 'string') {
          return `import ${dep};`;
        } else if (dep.default) {
          return `import ${dep.default} from '${dep.from}';`;
        } else if (dep.named) {
          const namedImports = Array.isArray(dep.named) ? dep.named.join(', ') : dep.named;
          return `import { ${namedImports} } from '${dep.from}';`;
        } else {
          return `import * as ${dep.as || dep.name} from '${dep.from}';`;
        }
      })
      .join('\n');
  }

  generateExports(exports = []) {
    return exports
      .map(exp => {
        if (typeof exp === 'string') {
          return `export ${exp};`;
        } else if (exp.default) {
          return `export default ${exp.default};`;
        } else if (exp.named) {
          const namedExports = Array.isArray(exp.named) ? exp.named.join(', ') : exp.named;
          return `export { ${namedExports} };`;
        }
      })
      .join('\n');
  }

  addFileHeader(content, options = {}) {
    const header = this.generateFileHeader(options);
    return header ? `${header}\n\n${content}` : content;
  }

  generateFileHeader(options = {}) {
    const {
      title,
      description,
      author,
      date = new Date().toISOString().split('T')[0],
      license,
      generated = true
    } = options;

    const lines = [];
    
    if (title || description || author || license || generated) {
      lines.push('/**');
      
      if (title) lines.push(` * ${title}`);
      if (description) lines.push(` * ${description}`);
      if (generated) lines.push(` * Generated by Craft Code Generator`);
      if (author) lines.push(` * @author ${author}`);
      if (date) lines.push(` * @date ${date}`);
      if (license) lines.push(` * @license ${license}`);
      
      lines.push(' */');
    }

    return lines.join('\n');
  }

  mergeConfigurations(...configs) {
    return configs.reduce((merged, config) => {
      if (!config) return merged;
      
      for (const [key, value] of Object.entries(config)) {
        if (Array.isArray(value)) {
          merged[key] = [...(merged[key] || []), ...value];
        } else if (typeof value === 'object' && value !== null) {
          merged[key] = { ...(merged[key] || {}), ...value };
        } else {
          merged[key] = value;
        }
      }
      
      return merged;
    }, {});
  }

  reset() {
    this.generatedFiles = [];
    this.errors = [];
    this.templates.clear();
  }

  getGenerationSummary() {
    return {
      filesGenerated: this.generatedFiles.length,
      totalSize: this.generatedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
      errors: this.errors.length,
      templates: this.templates.size,
      outputPath: this.options.outputPath
    };
  }
}

module.exports = { BaseGenerator };