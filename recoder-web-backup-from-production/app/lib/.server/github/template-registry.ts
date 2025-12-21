/**
 * Template Registry
 * Manages curated templates from top open-source projects
 */

import type { TemplateRepo } from './types';

/**
 * Curated templates from top GitHub repositories
 * All templates are from real, popular open-source projects
 * PLUS local starters from /starters directory
 */
const TEMPLATE_REGISTRY: TemplateRepo[] = [
  // LOCAL STARTERS (from /starters directory)
  {
    id: 'local-blog-app',
    name: 'Blog App (React Native)',
    description: 'Full-featured blog application with React Native and Expo',
    repo: 'local:BlogApp',
    category: 'react',
    tags: ['react-native', 'expo', 'blog', 'mobile'],
    featured: true,
    isLocal: true,
  },
  {
    id: 'local-angular',
    name: 'Angular Starter',
    description: 'Modern Angular application template',
    repo: 'local:angular',
    category: 'angular',
    tags: ['angular', 'typescript'],
    featured: true,
    isLocal: true,
  },
  {
    id: 'local-astro-shadcn',
    name: 'Astro + Shadcn UI',
    description: 'Astro with Shadcn UI components',
    repo: 'local:astro-shadcn',
    category: 'astro',
    tags: ['astro', 'shadcn', 'ui'],
    featured: true,
    isLocal: true,
  },
  {
    id: 'local-bolt-expo',
    name: 'Bolt Expo',
    description: 'Bolt with Expo for mobile development',
    repo: 'local:bolt-expo',
    category: 'react',
    tags: ['expo', 'react-native', 'mobile'],
    featured: false,
    isLocal: true,
  },
  {
    id: 'local-bolt-qwik',
    name: 'Bolt Qwik',
    description: 'Bolt with Qwik for fast web apps',
    repo: 'local:bolt-qwik',
    category: 'qwik',
    tags: ['qwik', 'fast', 'performance'],
    featured: false,
    isLocal: true,
  },
  {
    id: 'local-bolt-vite-react',
    name: 'Bolt Vite React TS',
    description: 'Bolt with Vite, React, and TypeScript',
    repo: 'local:bolt-vite-react-ts',
    category: 'react',
    tags: ['vite', 'react', 'typescript'],
    featured: true,
    isLocal: true,
  },
  {
    id: 'local-express-auth',
    name: 'Express TypeScript Auth',
    description: 'Express server with TypeScript and authentication',
    repo: 'local:express-typescript-auth',
    category: 'backend',
    tags: ['express', 'typescript', 'auth', 'backend'],
    featured: true,
    isLocal: true,
  },

  // Next.js Templates (from Vercel)
  {
    id: 'nextjs-app-router',
    name: 'Next.js 14 App Router',
    description: 'Modern Next.js with App Router, TypeScript, and Tailwind CSS',
    repo: 'vercel/next.js/tree/canary/examples/app-dir-mdx',
    category: 'nextjs',
    tags: ['nextjs', 'app-router', 'typescript', 'tailwindcss'],
    featured: true,
  },
  {
    id: 'nextjs-commerce',
    name: 'Next.js Commerce',
    description: 'Full e-commerce solution with Shopify integration',
    repo: 'vercel/commerce',
    category: 'nextjs',
    tags: ['nextjs', 'ecommerce', 'shopify', 'commerce'],
    featured: true,
  },
  {
    id: 'nextjs-blog',
    name: 'Next.js Blog Starter',
    description: 'Blog with MDX, syntax highlighting, and SEO',
    repo: 'vercel/next.js/tree/canary/examples/blog-starter',
    category: 'nextjs',
    tags: ['nextjs', 'blog', 'mdx', 'seo'],
    featured: true,
  },
  {
    id: 'nextjs-dashboard',
    name: 'Next.js Admin Dashboard',
    description: 'Admin dashboard with authentication and charts',
    repo: 'vercel/next.js/tree/canary/examples/with-tailwindcss',
    category: 'nextjs',
    tags: ['nextjs', 'admin', 'dashboard', 'charts'],
    featured: false,
  },

  // React Templates
  {
    id: 'react-vite-ts',
    name: 'React + Vite + TypeScript',
    description: 'Fast React development with Vite and TypeScript',
    repo: 'vitejs/vite/tree/main/packages/create-vite/template-react-ts',
    category: 'react',
    tags: ['react', 'vite', 'typescript'],
    featured: true,
  },
  {
    id: 'react-admin',
    name: 'React Admin',
    description: 'Professional admin interface framework',
    repo: 'marmelab/react-admin',
    category: 'react',
    tags: ['react', 'admin', 'crud', 'dashboard'],
    featured: true,
  },
  {
    id: 'react-native-web',
    name: 'React Native Web',
    description: 'Cross-platform React for web and mobile',
    repo: 'necolas/react-native-web/tree/master/packages/react-native-web',
    category: 'react',
    tags: ['react', 'react-native', 'mobile', 'web'],
    featured: false,
  },

  // Vue Templates
  {
    id: 'vue3-vite',
    name: 'Vue 3 + Vite',
    description: 'Vue 3 with Vite, Pinia, and TypeScript',
    repo: 'vitejs/vite/tree/main/packages/create-vite/template-vue-ts',
    category: 'vue',
    tags: ['vue', 'vue3', 'vite', 'typescript'],
    featured: true,
  },
  {
    id: 'nuxt3',
    name: 'Nuxt 3',
    description: 'The Intuitive Vue Framework with SSR',
    repo: 'nuxt/starter',
    category: 'vue',
    tags: ['nuxt', 'vue', 'ssr', 'typescript'],
    featured: true,
  },

  // Angular Templates
  {
    id: 'angular-material',
    name: 'Angular Material',
    description: 'Angular with Material Design components',
    repo: 'angular/components/tree/main/src/material',
    category: 'angular',
    tags: ['angular', 'material', 'typescript'],
    featured: true,
  },

  // Svelte Templates
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    description: 'Fast web development with Svelte',
    repo: 'sveltejs/kit/tree/master/packages/create-svelte/templates/default',
    category: 'svelte',
    tags: ['svelte', 'sveltekit', 'typescript'],
    featured: true,
  },

  // Astro Templates
  {
    id: 'astro-starter',
    name: 'Astro Starter',
    description: 'Build faster websites with Astro',
    repo: 'withastro/astro/tree/main/examples/basics',
    category: 'astro',
    tags: ['astro', 'static', 'fast'],
    featured: true,
  },

  // Node.js Backend Templates
  {
    id: 'express-typescript',
    name: 'Express + TypeScript',
    description: 'RESTful API with Express, TypeScript, and best practices',
    repo: 'microsoft/TypeScript-Node-Starter',
    category: 'node',
    tags: ['express', 'typescript', 'api', 'rest'],
    featured: true,
  },
  {
    id: 'fastify-typescript',
    name: 'Fastify + TypeScript',
    description: 'Fast and low overhead web framework',
    repo: 'fastify/fastify-cli/tree/master/templates/app-ts',
    category: 'node',
    tags: ['fastify', 'typescript', 'api', 'performance'],
    featured: true,
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    description: 'Progressive Node.js framework for scalable apps',
    repo: 'nestjs/typescript-starter',
    category: 'node',
    tags: ['nestjs', 'typescript', 'api', 'scalable'],
    featured: true,
  },

  // Vanilla JS Templates
  {
    id: 'vanilla-vite',
    name: 'Vanilla + Vite',
    description: 'Pure JavaScript with Vite bundler',
    repo: 'vitejs/vite/tree/main/packages/create-vite/template-vanilla-ts',
    category: 'vanilla',
    tags: ['javascript', 'vite', 'typescript'],
    featured: false,
  },
  {
    id: 'web-components',
    name: 'Lit Web Components',
    description: 'Modern web components with Lit',
    repo: 'lit/lit-element-starter-ts',
    category: 'vanilla',
    tags: ['web-components', 'lit', 'typescript'],
    featured: true,
  },

  // Mobile Templates
  {
    id: 'react-native',
    name: 'React Native',
    description: 'Cross-platform mobile apps with React',
    repo: 'react-native-community/react-native-template-typescript',
    category: 'mobile',
    tags: ['react-native', 'mobile', 'ios', 'android'],
    featured: true,
  },
  {
    id: 'expo',
    name: 'Expo',
    description: 'Universal React Native apps',
    repo: 'expo/expo/tree/main/templates/expo-template-blank-typescript',
    category: 'mobile',
    tags: ['expo', 'react-native', 'mobile'],
    featured: true,
  },

  // Full-stack Templates
  {
    id: 'remix',
    name: 'Remix',
    description: 'Full-stack web framework focused on web standards',
    repo: 'remix-run/remix/tree/main/templates/remix',
    category: 'nextjs',
    tags: ['remix', 'fullstack', 'typescript'],
    featured: true,
  },
  {
    id: 't3-stack',
    name: 'T3 Stack',
    description: 'Next.js, tRPC, Prisma, and Tailwind',
    repo: 'create-t3-app/create-t3-app',
    category: 'nextjs',
    tags: ['nextjs', 'trpc', 'prisma', 'tailwind'],
    featured: true,
  },

  // Other Popular Templates
  {
    id: 'electron',
    name: 'Electron',
    description: 'Cross-platform desktop apps with web technologies',
    repo: 'electron/electron-quick-start-typescript',
    category: 'other',
    tags: ['electron', 'desktop', 'typescript'],
    featured: false,
  },
  {
    id: 'chrome-extension',
    name: 'Chrome Extension',
    description: 'Modern Chrome extension template',
    repo: 'chibat/chrome-extension-typescript-starter',
    category: 'other',
    tags: ['chrome', 'extension', 'typescript'],
    featured: false,
  },
];

/**
 * Template Registry Service
 */
class TemplateRegistry {
  private templates: TemplateRepo[] = TEMPLATE_REGISTRY;

  getAllTemplates(): TemplateRepo[] {
    return [...this.templates];
  }

  getTemplateById(id: string): TemplateRepo | undefined {
    return this.templates.find(t => t.id === id);
  }

  getTemplatesByCategory(category: string): TemplateRepo[] {
    if (category === 'all') {
      return this.getAllTemplates();
    }
    return this.templates.filter(t => t.category === category);
  }

  getFeaturedTemplates(): TemplateRepo[] {
    return this.templates.filter(t => t.featured);
  }

  searchTemplates(query: string): TemplateRepo[] {
    const lowerQuery = query.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      t.category.toLowerCase().includes(lowerQuery)
    );
  }

  getTemplatesByTags(tags: string[]): TemplateRepo[] {
    return this.templates.filter(t =>
      tags.some(tag => t.tags.includes(tag.toLowerCase()))
    );
  }

  /**
   * Add a custom template to the registry
   */
  addTemplate(template: TemplateRepo): void {
    // Check if template with same ID already exists
    if (this.templates.find(t => t.id === template.id)) {
      throw new Error(`Template with ID '${template.id}' already exists`);
    }
    this.templates.push(template);
  }

  /**
   * Get templates recommended for a specific use case
   */
  getRecommendedTemplates(useCase: string): TemplateRepo[] {
    const useCaseMap: Record<string, string[]> = {
      'ecommerce': ['nextjs-commerce', 'react-admin'],
      'blog': ['nextjs-blog', 'astro-starter'],
      'dashboard': ['nextjs-dashboard', 'react-admin'],
      'api': ['express-typescript', 'fastify-typescript', 'nestjs'],
      'mobile': ['react-native', 'expo'],
      'fullstack': ['remix', 't3-stack', 'nextjs-app-router'],
    };

    const recommendedIds = useCaseMap[useCase.toLowerCase()] || [];
    return recommendedIds
      .map(id => this.getTemplateById(id))
      .filter((t): t is TemplateRepo => t !== undefined);
  }
}

// Singleton instance
let registryInstance: TemplateRegistry | null = null;

export function getTemplateRegistry(): TemplateRegistry {
  if (!registryInstance) {
    registryInstance = new TemplateRegistry();
  }
  return registryInstance;
}

export { TemplateRegistry };
export type { TemplateRepo };
