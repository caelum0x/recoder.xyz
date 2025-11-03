import { promptCache } from './cache';
import type { TemplateRepo } from '../github/types';

/**
 * Enhanced template caching for expensive operations
 */
export class TemplateCacheService {
  /**
   * Create a cached prompt for template initialization
   */
  createTemplatePrompt(
    template: TemplateRepo,
    files: Record<string, string>,
    repositoryInfo?: any
  ): string {
    const fileList = Object.keys(files);
    const fileCount = fileList.length;

    // Create a structured prompt that can be cached efficiently
    const basePromptParts = [
      `Create a professional ${template.name} project.`,
      `Category: ${template.category}`,
      `Description: ${template.description}`,
      `Tags: ${template.tags.join(', ')}`
    ];

    if (repositoryInfo) {
      basePromptParts.push(`Repository: ${repositoryInfo.name}`);
      if (repositoryInfo.language) {
        basePromptParts.push(`Primary Language: ${repositoryInfo.language}`);
      }
    }

    // Add file structure information
    const fileStructure = this.generateFileStructure(files);
    basePromptParts.push(`\nProject Structure:\n${fileStructure}`);

    // Add specific instructions based on template type
    const instructions = this.getTemplateInstructions(template.category);
    basePromptParts.push(`\nInstructions:\n${instructions}`);

    const fullPrompt = basePromptParts.join('\n');

    // Cache this template prompt (it's likely to be reused)
    const cachedMessage = promptCache.createCacheableMessage(
      fullPrompt,
      'template',
      'user'
    );

    return typeof cachedMessage.content === 'string' ? cachedMessage.content : JSON.stringify(cachedMessage.content);
  }

  /**
   * Generate a concise file structure representation
   */
  private generateFileStructure(files: Record<string, string>): string {
    const paths = Object.keys(files).sort();
    const maxFilesToShow = 25; // Limit to keep prompt manageable

    if (paths.length <= maxFilesToShow) {
      return paths.map(path => `  ${path}`).join('\n');
    }

    const shownFiles = paths.slice(0, maxFilesToShow);
    const hiddenCount = paths.length - maxFilesToShow;

    return [
      ...shownFiles.map(path => `  ${path}`),
      `  ... and ${hiddenCount} more files`
    ].join('\n');
  }

  /**
   * Get specific instructions based on template category
   */
  private getTemplateInstructions(category: string): string {
    const instructions: Record<string, string> = {
      'nextjs': `
- Set up Next.js with TypeScript and Tailwind CSS
- Configure app router structure
- Include essential components and layouts
- Set up development and build scripts
- Ensure proper TypeScript configuration`,

      'react': `
- Set up React application with Vite or Create React App
- Configure TypeScript if included
- Set up component structure and routing
- Include essential development dependencies
- Configure build and development scripts`,

      'vue': `
- Set up Vue.js application with proper structure
- Configure Vue Router and state management
- Set up TypeScript if included
- Include essential Vue ecosystem tools
- Configure development and build processes`,

      'angular': `
- Set up Angular application with TypeScript
- Configure Angular CLI and routing
- Set up component architecture
- Include Angular Material if needed
- Configure development and build scripts`,

      'svelte': `
- Set up Svelte/SvelteKit application
- Configure routing and state management
- Set up TypeScript if included
- Include development tools and adapters
- Configure build and deployment scripts`,

      'node': `
- Set up Node.js server with proper structure
- Configure Express or other frameworks
- Set up TypeScript if included
- Include essential middleware and utilities
- Configure development and production scripts`,

      'vanilla': `
- Set up vanilla JavaScript/TypeScript project
- Configure build tools (Vite, Webpack, etc.)
- Set up proper module structure
- Include development dependencies
- Configure bundling and optimization`,

      'astro': `
- Set up Astro static site generator
- Configure integrations and components
- Set up content collections if needed
- Include styling and optimization
- Configure build and deployment`
    };

    return instructions[category] || `
- Set up the project with proper structure
- Install and configure necessary dependencies
- Ensure development environment is ready
- Configure build and deployment scripts
- Follow best practices for the framework`;
  }

  /**
   * Create a cached file content prompt for large files
   */
  cacheFileContent(filePath: string, content: string): string {
    if (content.length > 2000) { // Cache large files
      const cachedMessage = promptCache.createCacheableMessage(
        `File: ${filePath}\n\n${content}`,
        'template',
        'user'
      );
      return typeof cachedMessage.content === 'string' ? cachedMessage.content : JSON.stringify(cachedMessage.content);
    }
    return content;
  }

  /**
   * Get cache statistics specific to templates
   */
  getTemplateCacheStats() {
    const generalStats = promptCache.getStats();

    return {
      ...generalStats,
      templateSpecific: {
        estimatedProjectSetupSavings: generalStats.templateData * 0.5, // Rough estimate
        averageTemplateSize: '~3-5k tokens',
        cachePotentialSavings: 'Up to 90% on repeated template usage'
      }
    };
  }
}

export const templateCache = new TemplateCacheService();