/**
 * Template Manager - handles template configuration and file generation
 */

import { normalizeTailwindToolchainPackageJson } from '../runtime/package-json-sanitizer';
import { fileStructure as viteShadcnFiles } from './vite-shadcn-template';
import type {
  FileStructure,
  GeneratedFile,
  TemplateConfig,
  TemplateDirectory,
  TemplateFile,
  TemplateGenerationOptions,
  TemplateMetadata,
  TemplateNode,
} from './types';

const viteShadcnDependencies: Record<string, string> = {
  '@hookform/resolvers': '^5.1.1',
  '@radix-ui/react-accordion': '^1.2.11',
  '@radix-ui/react-alert-dialog': '^1.1.14',
  '@radix-ui/react-avatar': '^1.1.10',
  '@radix-ui/react-checkbox': '^1.3.2',
  '@radix-ui/react-collapsible': '^1.1.11',
  '@radix-ui/react-dialog': '^1.1.14',
  '@radix-ui/react-dropdown-menu': '^2.1.15',
  '@radix-ui/react-icons': '^1.3.2',
  '@radix-ui/react-label': '^2.1.7',
  '@radix-ui/react-navigation-menu': '^1.2.13',
  '@radix-ui/react-popover': '^1.1.14',
  '@radix-ui/react-progress': '^1.1.7',
  '@radix-ui/react-radio-group': '^1.3.7',
  '@radix-ui/react-scroll-area': '^1.2.9',
  '@radix-ui/react-select': '^2.2.5',
  '@radix-ui/react-separator': '^1.1.7',
  '@radix-ui/react-slider': '^1.3.5',
  '@radix-ui/react-slot': '^1.2.3',
  '@radix-ui/react-switch': '^1.2.5',
  '@radix-ui/react-tabs': '^1.1.12',
  '@radix-ui/react-toast': '^1.2.14',
  '@radix-ui/react-tooltip': '^1.2.7',
  '@splinetool/react-spline': '^4.0.0',
  '@tanstack/react-query': '^5.81.5',
  'class-variance-authority': '^0.7.1',
  'clsx': '^2.1.1',
  cmdk: '^0.2.1',
  'date-fns': '^4.1.0',
  'embla-carousel-react': '^8.6.0',
  hono: '^4.8.3',
  'input-otp': '^1.4.2',
  'lucide-react': '^0.486.0',
  'next-themes': '^0.4.6',
  react: '^19.1.0',
  'react-day-picker': '^9.7.0',
  'react-dom': '^19.1.0',
  'react-hook-form': '^7.59.0',
  'react-router-dom': '^7.6.3',
  recharts: '^2.15.4',
  sonner: '^2.0.5',
  'tailwind-merge': '^3.3.1',
  vaul: '^1.1.2',
  zod: '^3.25.71',
};

const viteShadcnDevDependencies: Record<string, string> = {
  '@cloudflare/vite-plugin': '^1.9.0',
  '@cloudflare/workers-types': '^4.20250703.0',
  '@types/node': '^22.16.0',
  '@types/react': '^19.1.8',
  '@types/react-dom': '^19.1.6',
  '@vitejs/plugin-react-swc': '^3.10.2',
  autoprefixer: '^10.4.21',
  postcss: '^8.4.49',
  'sandbox-tagger': '^0.0.2',
  tailwindcss: '^3.4.17',
  'tailwindcss-animate': '^1.0.7',
  typescript: '^5.8.3',
  vite: '^6.3.5',
  wrangler: '^4.24.0',
};

const viteShadcnPackageJson = {
  name: 'vite-shadcn-template-libra',
  private: true,
  version: '1.0.0',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  dependencies: viteShadcnDependencies,
  devDependencies: viteShadcnDevDependencies,
};

const VITE_SHADCN_FILE_OVERRIDES: Record<string, string> = {
  'package.json': JSON.stringify(viteShadcnPackageJson, null, 2),
  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
  'tailwind.config.ts': `import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
`,
  'vite.config.ts': `import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { componentTagger } from 'sandbox-tagger';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  plugins: [
    react(),
    ...(mode === 'development' ? [componentTagger()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_INSPECTOR_URL': JSON.stringify('https://cdn.libra.dev'),
  },
}));
`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.625rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }
}
`,
};

function isTemplateFile(node: TemplateNode): node is TemplateFile {
  return node.type === 'file';
}

function isTemplateDirectory(node: TemplateNode): node is TemplateDirectory {
  return node.type === 'directory';
}

function flattenFileStructure(
  structure: FileStructure,
  basePath: string = ''
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const [key, node] of Object.entries(structure)) {
    const fullPath = basePath ? `${basePath}/${key}` : key;

    if (isTemplateFile(node)) {
      files.push({
        path: fullPath,
        content: node.content,
        isBinary: node.isBinary,
      });
      continue;
    }

    if (isTemplateDirectory(node)) {
      files.push(
        ...flattenFileStructure(
          node.children as unknown as FileStructure,
          basePath
        )
      );
    }
  }

  return files;
}

function normalizeGeneratedFiles(
  templateId: string,
  files: GeneratedFile[],
  options: TemplateGenerationOptions = {}
): GeneratedFile[] {
  const fileMap = new Map(files.map((file) => [file.path, { ...file }]));

  if (templateId === 'vite-shadcn') {
    for (const [path, content] of Object.entries(VITE_SHADCN_FILE_OVERRIDES)) {
      fileMap.set(path, { path, content, isBinary: false });
    }
  }

  const packageJson = fileMap.get('package.json');

  if (packageJson) {
    const parsed = JSON.parse(packageJson.content) as Record<string, unknown>;

    if (options.projectName) {
      parsed.name = options.projectName;
    }

    const normalized = normalizeTailwindToolchainPackageJson(
      JSON.stringify(parsed, null, 2)
    );
    packageJson.content = normalized.sanitized;
    fileMap.set('package.json', packageJson);
  }

  return Array.from(fileMap.values());
}

/**
 * Vite + shadcn/ui template configuration
 */
export const viteShadcnTemplate: TemplateConfig = {
  id: 'vite-shadcn',
  name: 'Vite + React + shadcn/ui',
  description:
    'A modern React template with Vite, TypeScript, Tailwind CSS, and shadcn/ui components',
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
    'Follow mobile-first responsive design patterns',
  ],
  dependencies: viteShadcnDependencies,
  devDependencies: viteShadcnDevDependencies,
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
};

export const templateRegistry: Record<string, TemplateConfig> = {
  'vite-shadcn': viteShadcnTemplate,
};

export const templateMetadataList: TemplateMetadata[] = [
  {
    id: 'vite-shadcn',
    name: 'Vite + shadcn/ui',
    description:
      'Modern React app with Vite, TypeScript, Tailwind CSS, and shadcn/ui components',
    icon: 'vite',
    tags: ['react', 'vite', 'typescript', 'tailwind', 'shadcn'],
    category: 'frontend',
  },
];

export class TemplateManager {
  private templates: Map<string, TemplateConfig>;

  constructor() {
    this.templates = new Map(Object.entries(templateRegistry));
  }

  getTemplate(templateId: string): TemplateConfig | undefined {
    return this.templates.get(templateId);
  }

  getAllTemplates(): TemplateConfig[] {
    return Array.from(this.templates.values());
  }

  getTemplateMetadata(): TemplateMetadata[] {
    return templateMetadataList;
  }

  generateFiles(
    templateId: string,
    options: TemplateGenerationOptions = {}
  ): GeneratedFile[] {
    const template = this.getTemplate(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return normalizeGeneratedFiles(
      templateId,
      flattenFileStructure(template.fileStructure),
      options
    );
  }

  getFileContent(templateId: string, filePath: string): string | undefined {
    const files = this.generateFiles(templateId);
    return files.find((file) => file.path === filePath)?.content;
  }

  getFileTree(templateId: string): string[] {
    return this.generateFiles(templateId).map((file) => file.path).sort();
  }

  getConventions(templateId: string): string[] {
    const template = this.getTemplate(templateId);
    return template?.conventions || [];
  }

  getRunCommand(templateId: string): string {
    const template = this.getTemplate(templateId);
    return template?.runCommand || 'npm run dev';
  }

  getBuildCommand(templateId: string): string {
    const template = this.getTemplate(templateId);
    return template?.buildCommand || 'npm run build';
  }

  getPreviewPort(templateId: string): number {
    const template = this.getTemplate(templateId);
    return template?.previewPort || 5173;
  }

  hasFile(templateId: string, filePath: string): boolean {
    return this.getFileContent(templateId, filePath) !== undefined;
  }

  getDependencies(templateId: string): Record<string, string> {
    const packageJson = this.getFileContent(templateId, 'package.json');

    if (packageJson) {
      try {
        return (
          JSON.parse(packageJson) as { dependencies?: Record<string, string> }
        ).dependencies || {};
      } catch {
        // Fall through to raw template config.
      }
    }

    const template = this.getTemplate(templateId);
    return template?.dependencies || {};
  }

  getDevDependencies(templateId: string): Record<string, string> {
    const packageJson = this.getFileContent(templateId, 'package.json');

    if (packageJson) {
      try {
        return (
          JSON.parse(packageJson) as {
            devDependencies?: Record<string, string>;
          }
        ).devDependencies || {};
      } catch {
        // Fall through to raw template config.
      }
    }

    const template = this.getTemplate(templateId);
    return template?.devDependencies || {};
  }

  registerTemplate(template: TemplateConfig): void {
    this.templates.set(template.id, template);
  }
}

export const templateManager = new TemplateManager();
