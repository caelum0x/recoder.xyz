import type { TemplateRepo } from './types';

export const FEATURED_TEMPLATES: TemplateRepo[] = [
  // Vercel Templates
  {
    id: 'nextjs-starter',
    name: 'Next.js Starter',
    description: 'Full-stack Next.js application with TypeScript and Tailwind CSS',
    repo: 'vercel/next.js/tree/canary/examples/with-tailwindcss',
    category: 'nextjs',
    tags: ['nextjs', 'typescript', 'tailwindcss'],
    featured: true
  },
  {
    id: 'nextjs-blog',
    name: 'Next.js Blog',
    description: 'Blog template with MDX support and static generation',
    repo: 'vercel/next.js/tree/canary/examples/blog-starter',
    category: 'nextjs',
    tags: ['nextjs', 'blog', 'mdx'],
    featured: true
  },
  {
    id: 'nextjs-ecommerce',
    name: 'Next.js E-commerce',
    description: 'Complete e-commerce solution with Stripe integration',
    repo: 'vercel/commerce',
    category: 'nextjs',
    tags: ['nextjs', 'ecommerce', 'stripe'],
    featured: true
  },

  // React Templates
  {
    id: 'react-vite-starter',
    name: 'React + Vite',
    description: 'Modern React application with Vite, TypeScript and ESLint',
    repo: 'vitejs/vite/tree/main/packages/create-vite/template-react-ts',
    category: 'react',
    tags: ['react', 'vite', 'typescript'],
    featured: true
  },
  {
    id: 'react-admin-dashboard',
    name: 'React Admin Dashboard',
    description: 'Professional admin dashboard with charts and tables',
    repo: 'marmelab/react-admin',
    category: 'react',
    tags: ['react', 'admin', 'dashboard'],
    featured: false
  },

  // Vue Templates
  {
    id: 'vue-vite-starter',
    name: 'Vue 3 + Vite',
    description: 'Vue 3 application with Vite, TypeScript and Pinia',
    repo: 'vitejs/vite/tree/main/packages/create-vite/template-vue-ts',
    category: 'vue',
    tags: ['vue', 'vite', 'typescript'],
    featured: true
  },
  {
    id: 'nuxt-starter',
    name: 'Nuxt.js Starter',
    description: 'Full-stack Vue.js framework with SSR',
    repo: 'nuxt/starter',
    category: 'vue',
    tags: ['nuxt', 'vue', 'ssr'],
    featured: true
  },

  // Node.js Templates
  {
    id: 'express-api',
    name: 'Express API',
    description: 'RESTful API with Express, TypeScript and Prisma',
    repo: 'microsoft/TypeScript-Node-Starter',
    category: 'node',
    tags: ['express', 'api', 'typescript'],
    featured: true
  },
  {
    id: 'fastify-api',
    name: 'Fastify API',
    description: 'High-performance Node.js API framework',
    repo: 'fastify/fastify-cli/tree/master/templates/app-ts',
    category: 'node',
    tags: ['fastify', 'api', 'typescript'],
    featured: false
  },

  // Vanilla JavaScript
  {
    id: 'vanilla-webpack',
    name: 'Vanilla + Webpack',
    description: 'Modern vanilla JavaScript with Webpack and TypeScript',
    repo: 'webpack/webpack-cli/tree/master/packages/create-webpack-app/template',
    category: 'vanilla',
    tags: ['javascript', 'webpack', 'typescript'],
    featured: false
  }
];

export const GOOGLE_TEMPLATES: TemplateRepo[] = [
  {
    id: 'pwa-starter',
    name: 'PWA Starter',
    description: 'Progressive Web App with Workbox and offline support',
    repo: 'GoogleChrome/workbox/tree/v6/packages/workbox-cli/src/lib/templates',
    category: 'vanilla',
    tags: ['pwa', 'workbox', 'offline'],
    featured: true
  },
  {
    id: 'web-components',
    name: 'Web Components',
    description: 'Modern web components with Lit and TypeScript',
    repo: 'lit/lit-element-starter-ts',
    category: 'vanilla',
    tags: ['web-components', 'lit', 'typescript'],
    featured: true
  }
];

export function getTemplatesByCategory(category: string): TemplateRepo[] {
  return FEATURED_TEMPLATES.filter(template => template.category === category);
}

export function getFeaturedTemplates(): TemplateRepo[] {
  return FEATURED_TEMPLATES.filter(template => template.featured);
}

export function searchTemplates(query: string): TemplateRepo[] {
  const lowercaseQuery = query.toLowerCase();
  return FEATURED_TEMPLATES.filter(template =>
    template.name.toLowerCase().includes(lowercaseQuery) ||
    template.description.toLowerCase().includes(lowercaseQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
}