/**
 * Template Manager - handles template configuration and file generation
 */

import type {
  TemplateConfig,
  TemplateMetadata,
  GeneratedFile,
  TemplateGenerationOptions,
  FileStructure,
  TemplateNode,
  TemplateFile,
  TemplateDirectory
} from './types';
import { fileStructure as viteShadcnFiles } from './vite-shadcn-template';

/**
 * Vite + shadcn/ui template configuration
 */
export const viteShadcnTemplate: TemplateConfig = {
  id: 'vite-shadcn',
  name: 'Vite + React + shadcn/ui',
  description: 'A modern React template with Vite, TypeScript, Tailwind CSS, and shadcn/ui components',
  runCommand: 'npm run dev',
  devCommand: 'npm run dev',
  buildCommand: 'npm run build',
  previewPort: 5173,
  fileStructure: viteShadcnFiles as FileStructure,
  conventions: [
    'Use TypeScript for all files',
    'Use shadcn/ui components from @/components/ui',
    'Use Tailwind CSS for styling with CSS variables',
    'Use React Router for routing',
    'Use React Query for data fetching',
    'Use React Hook Form with Zod for forms',
    'Import utilities from @/lib/utils',
    'Follow mobile-first responsive design patterns'
  ],
  dependencies: {
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-icons": "^1.3.2",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@hookform/resolvers": "^5.1.1",
    "@splinetool/react-spline": "^4.0.0",
    "@tanstack/react-query": "^5.81.5",
    "class-variance-authority": "^0.7.1",
    "cmdk": "^0.2.1",
    "embla-carousel-react": "^8.6.0",
    "hono": "^4.8.3",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.486.0",
    "next-themes": "^0.4.6",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-day-picker": "^9.7.0",
    "react-hook-form": "^7.59.0",
    "react-router-dom": "^7.6.3",
    "recharts": "^2.15.4",
    "sonner": "^2.0.5",
    "tailwind-merge": "^3.3.1",
    "tw-animate-css": "^1.3.4",
    "vaul": "^1.1.2",
    "zod": "^3.25.71"
  },
  devDependencies: {
    "@cloudflare/vite-plugin": "^1.9.0",
    "@cloudflare/workers-types": "^4.20250703.0",
    "@tailwindcss/vite": "^4.1.11",
    "@types/node": "^22.16.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react-swc": "^3.10.2",
    "autoprefixer": "^10.4.21",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "postcss": "^8.5.6",
    "sandbox-tagger": "^0.0.2",
    "tailwindcss": "^4.1.11",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "wrangler": "^4.24.0"
  },
  scripts: {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
};

/**
 * Registry of all available templates
 */
export const templateRegistry: Record<string, TemplateConfig> = {
  'vite-shadcn': viteShadcnTemplate
};

/**
 * Template metadata for UI display
 */
export const templateMetadataList: TemplateMetadata[] = [
  {
    id: 'vite-shadcn',
    name: 'Vite + shadcn/ui',
    description: 'Modern React app with Vite, TypeScript, Tailwind CSS, and shadcn/ui components',
    icon: 'vite',
    tags: ['react', 'vite', 'typescript', 'tailwind', 'shadcn'],
    category: 'frontend'
  }
];

/**
 * Check if a node is a file
 */
function isTemplateFile(node: TemplateNode): node is TemplateFile {
  return node.type === 'file';
}

/**
 * Check if a node is a directory
 */
function isTemplateDirectory(node: TemplateNode): node is TemplateDirectory {
  return node.type === 'directory';
}

/**
 * Recursively flatten the file structure into a list of files with paths
 */
function flattenFileStructure(
  structure: FileStructure,
  basePath: string = ''
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const [key, node] of Object.entries(structure)) {
    // Handle nested path keys like "src/App.tsx"
    const fullPath = basePath ? `${basePath}/${key}` : key;

    if (isTemplateFile(node)) {
      files.push({
        path: fullPath,
        content: node.content,
        isBinary: node.isBinary
      });
    } else if (isTemplateDirectory(node)) {
      // Process children of the directory
      const childFiles = flattenFileStructure(
        node.children as unknown as FileStructure,
        basePath
      );
      files.push(...childFiles);
    }
  }

  return files;
}

/**
 * Template Manager class for managing project templates
 */
export class TemplateManager {
  private templates: Map<string, TemplateConfig>;

  constructor() {
    this.templates = new Map(Object.entries(templateRegistry));
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): TemplateConfig | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): TemplateConfig[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template metadata for UI display
   */
  getTemplateMetadata(): TemplateMetadata[] {
    return templateMetadataList;
  }

  /**
   * Generate files from a template
   */
  generateFiles(
    templateId: string,
    options: TemplateGenerationOptions = {}
  ): GeneratedFile[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const files = flattenFileStructure(template.fileStructure);

    // Apply customizations if provided
    if (options.projectName) {
      return files.map(file => {
        // Replace project name placeholders
        if (file.path === 'package.json') {
          const packageJson = JSON.parse(file.content);
          packageJson.name = options.projectName;
          return {
            ...file,
            content: JSON.stringify(packageJson, null, 2)
          };
        }
        return file;
      });
    }

    return files;
  }

  /**
   * Get file content for a specific file in a template
   */
  getFileContent(templateId: string, filePath: string): string | undefined {
    const template = this.getTemplate(templateId);
    if (!template) {
      return undefined;
    }

    const files = flattenFileStructure(template.fileStructure);
    const file = files.find(f => f.path === filePath);
    return file?.content;
  }

  /**
   * Get the file tree structure for a template (for UI display)
   */
  getFileTree(templateId: string): string[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      return [];
    }

    const files = flattenFileStructure(template.fileStructure);
    return files.map(f => f.path).sort();
  }

  /**
   * Get template conventions for AI prompts
   */
  getConventions(templateId: string): string[] {
    const template = this.getTemplate(templateId);
    return template?.conventions || [];
  }

  /**
   * Get run command for a template
   */
  getRunCommand(templateId: string): string {
    const template = this.getTemplate(templateId);
    return template?.runCommand || 'npm run dev';
  }

  /**
   * Get build command for a template
   */
  getBuildCommand(templateId: string): string {
    const template = this.getTemplate(templateId);
    return template?.buildCommand || 'npm run build';
  }

  /**
   * Get preview port for a template
   */
  getPreviewPort(templateId: string): number {
    const template = this.getTemplate(templateId);
    return template?.previewPort || 5173;
  }

  /**
   * Check if a file exists in the template
   */
  hasFile(templateId: string, filePath: string): boolean {
    const content = this.getFileContent(templateId, filePath);
    return content !== undefined;
  }

  /**
   * Get dependencies for a template
   */
  getDependencies(templateId: string): Record<string, string> {
    const template = this.getTemplate(templateId);
    return template?.dependencies || {};
  }

  /**
   * Get dev dependencies for a template
   */
  getDevDependencies(templateId: string): Record<string, string> {
    const template = this.getTemplate(templateId);
    return template?.devDependencies || {};
  }

  /**
   * Register a custom template
   */
  registerTemplate(template: TemplateConfig): void {
    this.templates.set(template.id, template);
  }
}

// Default instance
export const templateManager = new TemplateManager();
