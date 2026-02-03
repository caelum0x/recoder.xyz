/**
 * Template Catalog
 * Contains all available project templates and starter kits
 */

import type { ProjectTemplate, TemplateCategory } from './types.js';

// Category metadata
export const TEMPLATE_CATEGORIES: {
  id: TemplateCategory;
  name: string;
  description: string;
  icon: string;
}[] = [
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'Client-side web applications and UI frameworks',
    icon: 'i-ph:browser',
  },
  {
    id: 'backend',
    name: 'Backend',
    description: 'Server-side APIs and services',
    icon: 'i-ph:server',
  },
  {
    id: 'fullstack',
    name: 'Full Stack',
    description: 'Complete applications with frontend and backend',
    icon: 'i-ph:stack',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    description: 'iOS and Android applications',
    icon: 'i-ph:device-mobile',
  },
  {
    id: 'ai',
    name: 'AI & ML',
    description: 'Artificial intelligence and machine learning projects',
    icon: 'i-ph:brain',
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Miscellaneous tools and utilities',
    icon: 'i-ph:dots-three',
  },
];

// Complete template catalog
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // ==================== FRONTEND TEMPLATES ====================

  // React + TypeScript + Tailwind (Most Popular)
  {
    id: 'react-vite-tailwind',
    name: 'React + Vite + Tailwind',
    description: 'Modern React application with TypeScript, Vite bundler, and Tailwind CSS for rapid UI development.',
    longDescription: `A production-ready React starter with the fastest development experience.
    Includes hot module replacement, TypeScript for type safety, Tailwind CSS for utility-first styling,
    and ESLint for code quality.`,
    category: 'frontend',
    difficulty: 'beginner',
    icon: 'i-ph:atom',
    technologies: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'ESLint'],
    tags: ['react', 'typescript', 'tailwind', 'vite', 'spa'],
    features: [
      'Hot Module Replacement (HMR)',
      'TypeScript with strict mode',
      'Tailwind CSS configured',
      'ESLint + Prettier setup',
      'Optimized production builds',
    ],
    starterPath: 'recoder-vite-react-ts',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
    isFeatured: true,
  },

  // React + shadcn/ui
  {
    id: 'react-shadcn',
    name: 'React + shadcn/ui',
    description: 'Beautiful React app with shadcn/ui components, Radix UI primitives, and dark mode support.',
    longDescription: `Build stunning interfaces with pre-built, accessible components from shadcn/ui.
    Includes all major UI components, dark mode, and is fully customizable.`,
    category: 'frontend',
    difficulty: 'beginner',
    icon: 'i-ph:paint-brush',
    technologies: ['React 18', 'TypeScript', 'shadcn/ui', 'Radix UI', 'Tailwind CSS'],
    tags: ['react', 'shadcn', 'ui-components', 'accessible', 'dark-mode'],
    features: [
      '40+ pre-built components',
      'Dark mode out of the box',
      'Accessible by default (WAI-ARIA)',
      'Customizable design system',
      'Form handling with react-hook-form',
      'Toast notifications',
    ],
    starterPath: 'vite-shadcn',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
    isFeatured: true,
  },

  // Vue 3
  {
    id: 'vue-vite',
    name: 'Vue 3 + Vite',
    description: 'Progressive Vue.js framework with Composition API and Vite for lightning-fast development.',
    category: 'frontend',
    difficulty: 'beginner',
    icon: 'i-ph:code',
    technologies: ['Vue 3', 'Composition API', 'Vite', 'JavaScript'],
    tags: ['vue', 'composition-api', 'reactive', 'vite'],
    features: [
      'Composition API ready',
      'Reactive data binding',
      'Component-based architecture',
      'Vite dev server',
      'Vue DevTools support',
    ],
    starterPath: 'vue',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=16.0.0',
    isPopular: true,
  },

  // Svelte + SvelteKit
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    description: 'High-performance web apps with Svelte and SvelteKit. No virtual DOM, minimal JavaScript.',
    category: 'frontend',
    difficulty: 'intermediate',
    icon: 'i-ph:flame',
    technologies: ['Svelte', 'SvelteKit', 'TypeScript', 'Vite'],
    tags: ['svelte', 'sveltekit', 'ssr', 'performance'],
    features: [
      'No virtual DOM overhead',
      'Server-side rendering',
      'File-based routing',
      'API routes built-in',
      'Smaller bundle sizes',
    ],
    starterPath: 'sveltekit',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
  },

  // Angular
  {
    id: 'angular',
    name: 'Angular',
    description: 'Enterprise-grade framework by Google with TypeScript, dependency injection, and powerful CLI.',
    category: 'frontend',
    difficulty: 'intermediate',
    icon: 'i-ph:shield-check',
    technologies: ['Angular', 'TypeScript', 'RxJS', 'Angular CLI'],
    tags: ['angular', 'enterprise', 'typescript', 'rxjs'],
    features: [
      'TypeScript-first development',
      'Dependency injection',
      'Powerful CLI tools',
      'RxJS for reactive programming',
      'Two-way data binding',
    ],
    starterPath: 'angular',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm start', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // Quasar Framework
  {
    id: 'quasar',
    name: 'Quasar Framework',
    description: 'Vue-based framework for building responsive websites, mobile apps, and Electron desktop apps.',
    category: 'frontend',
    difficulty: 'intermediate',
    icon: 'i-ph:layout',
    technologies: ['Vue 3', 'Quasar', 'TypeScript', 'Material Design'],
    tags: ['quasar', 'vue', 'material-design', 'cross-platform'],
    features: [
      'Material Design components',
      'Build for Web, Mobile, Desktop',
      'Rich component library',
      'Internationalization',
      'Dark mode support',
    ],
    starterPath: 'quasar',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // Astro + shadcn
  {
    id: 'astro-shadcn',
    name: 'Astro + shadcn/ui',
    description: 'Content-focused static site builder with partial hydration and shadcn/ui components.',
    category: 'frontend',
    difficulty: 'intermediate',
    icon: 'i-ph:rocket',
    technologies: ['Astro', 'React', 'shadcn/ui', 'Tailwind CSS'],
    tags: ['astro', 'static-site', 'seo', 'performance'],
    features: [
      'Zero JavaScript by default',
      'Island architecture',
      'Excellent SEO',
      'Use any UI framework',
      'Content collections',
    ],
    starterPath: 'astro-shadcn',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // React + GSAP Animations
  {
    id: 'react-gsap',
    name: 'React + GSAP',
    description: 'React application with GSAP animation library for stunning, professional animations.',
    category: 'frontend',
    difficulty: 'intermediate',
    icon: 'i-ph:magic-wand',
    technologies: ['React', 'GSAP', 'JavaScript', 'ScrollTrigger'],
    tags: ['animation', 'gsap', 'scroll-animation', 'motion'],
    features: [
      'GSAP 3 integrated',
      'ScrollTrigger plugin',
      'Timeline animations',
      'SVG animations',
      'Performance optimized',
    ],
    starterPath: 'gsap-react',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=16.0.0',
  },

  // Simple React (JavaScript)
  {
    id: 'react-js',
    name: 'React (JavaScript)',
    description: 'Simple React setup with JavaScript. Great for quick prototypes and learning React basics.',
    category: 'frontend',
    difficulty: 'beginner',
    icon: 'i-ph:atom',
    technologies: ['React 18', 'JavaScript', 'Vite'],
    tags: ['react', 'javascript', 'simple', 'beginner'],
    features: [
      'Minimal setup',
      'No TypeScript complexity',
      'Fast development',
      'Easy to understand',
    ],
    starterPath: 'react',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=16.0.0',
  },

  // ==================== FULL STACK TEMPLATES ====================

  // Next.js (App Router)
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'The React framework for production with server-side rendering, API routes, and static generation.',
    longDescription: `Build full-stack React applications with Next.js. Includes server components,
    app router, API routes, and automatic optimizations for production.`,
    category: 'fullstack',
    difficulty: 'intermediate',
    icon: 'i-ph:stack',
    technologies: ['Next.js 14', 'React 18', 'TypeScript', 'App Router'],
    tags: ['nextjs', 'react', 'ssr', 'fullstack', 'vercel'],
    features: [
      'React Server Components',
      'App Router with layouts',
      'API routes',
      'Automatic code splitting',
      'Image optimization',
      'Static & dynamic rendering',
    ],
    starterPath: 'nextjs',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.17.0',
    isPopular: true,
    isFeatured: true,
  },

  // Next.js + shadcn/ui
  {
    id: 'nextjs-shadcn',
    name: 'Next.js + shadcn/ui',
    description: 'Production-ready Next.js with shadcn/ui components. The perfect starter for modern web apps.',
    category: 'fullstack',
    difficulty: 'intermediate',
    icon: 'i-ph:stack',
    technologies: ['Next.js 14', 'React 18', 'TypeScript', 'shadcn/ui', 'Tailwind CSS'],
    tags: ['nextjs', 'shadcn', 'ui-kit', 'production-ready'],
    features: [
      'All shadcn/ui components',
      'Dark mode with next-themes',
      'Server & client components',
      'API routes ready',
      'Form validation setup',
    ],
    starterPath: 'nextjs-shadcn',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.17.0',
    isPopular: true,
    isFeatured: true,
  },

  // Next.js E-commerce
  {
    id: 'nextjs-ecommerce',
    name: 'Next.js E-commerce',
    description: 'Complete e-commerce starter with Stripe payments, product catalog, and shopping cart.',
    category: 'fullstack',
    difficulty: 'advanced',
    icon: 'i-ph:shopping-cart',
    technologies: ['Next.js', 'React', 'Stripe', 'TypeScript', 'Tailwind CSS'],
    tags: ['ecommerce', 'stripe', 'payments', 'shopping-cart'],
    features: [
      'Stripe Checkout integration',
      'Product catalog',
      'Shopping cart',
      'Secure payments',
      'Order management',
    ],
    starterPath: 'nextjs-ecommerce-stripe',
    environmentVariables: [
      {
        key: 'STRIPE_SECRET_KEY',
        description: 'Stripe secret API key',
        required: true,
        sensitive: true,
      },
      {
        key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        description: 'Stripe publishable key',
        required: true,
      },
    ],
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.17.0',
  },

  // Next.js Blog with MDX
  {
    id: 'nextjs-blog',
    name: 'Next.js Blog',
    description: 'Blog starter with MDX support for writing content in Markdown with React components.',
    category: 'fullstack',
    difficulty: 'intermediate',
    icon: 'i-ph:article',
    technologies: ['Next.js', 'MDX', 'React', 'TypeScript', 'Tailwind CSS'],
    tags: ['blog', 'mdx', 'content', 'markdown'],
    features: [
      'MDX for rich content',
      'Code syntax highlighting',
      'SEO optimized',
      'RSS feed generation',
      'Reading time estimation',
    ],
    starterPath: 'nextjs-blog-mdx',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.17.0',
  },

  // Qwik
  {
    id: 'qwik',
    name: 'Qwik',
    description: 'Resumable framework for instant-loading web applications with zero hydration.',
    category: 'fullstack',
    difficulty: 'advanced',
    icon: 'i-ph:lightning',
    technologies: ['Qwik', 'TypeScript', 'Qwik City'],
    tags: ['qwik', 'resumable', 'performance', 'instant-loading'],
    features: [
      'Resumability (no hydration)',
      'Instant interactivity',
      'Lazy loading by default',
      'Server functions',
      'Optimized for Core Web Vitals',
    ],
    starterPath: 'recoder-qwik',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isNew: true,
  },

  // ==================== BACKEND TEMPLATES ====================

  // Express + TypeScript (Production Ready)
  {
    id: 'express-typescript',
    name: 'Express + TypeScript',
    description: 'Production-ready Express.js API with TypeScript, validation, security, and OpenAPI documentation.',
    longDescription: `A robust Express.js starter with everything you need for production:
    TypeScript, Zod validation, rate limiting, security headers, and automatic OpenAPI docs.`,
    category: 'backend',
    difficulty: 'intermediate',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'TypeScript', 'Zod', 'Swagger/OpenAPI'],
    tags: ['express', 'api', 'rest', 'typescript', 'documentation'],
    features: [
      'OpenAPI/Swagger documentation',
      'Zod schema validation',
      'Rate limiting',
      'Security headers (Helmet)',
      'CORS configured',
      'Error handling middleware',
    ],
    starterPath: 'express-typescript',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
    isFeatured: true,
  },

  // Express Simple
  {
    id: 'express-simple',
    name: 'Express.js (Simple)',
    description: 'Minimal Express.js setup for quick API prototyping. No TypeScript, just JavaScript.',
    category: 'backend',
    difficulty: 'beginner',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'JavaScript', 'Node.js'],
    tags: ['express', 'simple', 'prototype', 'api'],
    features: [
      'Minimal configuration',
      'Quick to start',
      'Easy to understand',
      'No build step',
    ],
    starterPath: 'express-simple',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm start', description: 'Start server' },
    ],
    nodeVersion: '>=16.0.0',
  },

  // Express + MongoDB
  {
    id: 'express-mongodb',
    name: 'Express + MongoDB',
    description: 'Express.js API with MongoDB database using Mongoose ODM. Ready for CRUD operations.',
    category: 'backend',
    difficulty: 'intermediate',
    icon: 'i-ph:database',
    technologies: ['Express', 'MongoDB', 'Mongoose', 'TypeScript'],
    tags: ['express', 'mongodb', 'mongoose', 'database', 'crud'],
    features: [
      'Mongoose ODM configured',
      'Schema validation',
      'CRUD operations ready',
      'Connection pooling',
      'Error handling',
    ],
    starterPath: 'express-mongodb-api',
    environmentVariables: [
      {
        key: 'MONGODB_URI',
        description: 'MongoDB connection string',
        required: true,
        defaultValue: 'mongodb://localhost:27017/myapp',
      },
    ],
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // Express + Authentication
  {
    id: 'express-auth',
    name: 'Express + Auth',
    description: 'Express.js API with JWT authentication, password hashing, and protected routes.',
    category: 'backend',
    difficulty: 'intermediate',
    icon: 'i-ph:lock',
    technologies: ['Express', 'TypeScript', 'JWT', 'bcrypt'],
    tags: ['express', 'auth', 'jwt', 'security', 'login'],
    features: [
      'JWT authentication',
      'Password hashing (bcrypt)',
      'Protected route middleware',
      'Refresh tokens',
      'User registration/login',
    ],
    starterPath: 'express-typescript-auth',
    environmentVariables: [
      {
        key: 'JWT_SECRET',
        description: 'Secret key for JWT signing',
        required: true,
        sensitive: true,
      },
      {
        key: 'JWT_EXPIRES_IN',
        description: 'Token expiration time',
        required: false,
        defaultValue: '7d',
      },
    ],
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
  },

  // Hono
  {
    id: 'hono',
    name: 'Hono',
    description: 'Ultrafast web framework for the Edges. Works on Cloudflare, Deno, Bun, and Node.js.',
    category: 'backend',
    difficulty: 'intermediate',
    icon: 'i-ph:flame',
    technologies: ['Hono', 'TypeScript', 'Node.js'],
    tags: ['hono', 'edge', 'fast', 'lightweight', 'cloudflare'],
    features: [
      'Ultrafast routing',
      'Edge-first design',
      'TypeScript native',
      'Middleware support',
      'Works anywhere',
    ],
    starterPath: 'hono-nodejs-starter',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    nodeVersion: '>=18.0.0',
    isNew: true,
  },

  // GraphQL Server
  {
    id: 'graphql',
    name: 'GraphQL Server',
    description: 'GraphQL API server with schema-first design and type safety.',
    category: 'backend',
    difficulty: 'intermediate',
    icon: 'i-ph:graph',
    technologies: ['GraphQL', 'Node.js', 'Apollo Server'],
    tags: ['graphql', 'api', 'apollo', 'schema'],
    features: [
      'Schema-first development',
      'Type safety',
      'Playground included',
      'Subscription support',
      'Introspection',
    ],
    starterPath: 'graphql',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm start', description: 'Start server' },
    ],
    nodeVersion: '>=16.0.0',
  },

  // JSON Server
  {
    id: 'json-server',
    name: 'JSON Server',
    description: 'Fake REST API with zero coding in 30 seconds. Perfect for prototyping and mocking.',
    category: 'backend',
    difficulty: 'beginner',
    icon: 'i-ph:file-json',
    technologies: ['JSON Server', 'Node.js', 'REST'],
    tags: ['mock', 'prototype', 'fake-api', 'testing'],
    features: [
      'Zero configuration',
      'Full REST API',
      'CRUD operations',
      'Custom routes',
      'Static file server',
    ],
    starterPath: 'json-server',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm start', description: 'Start mock server' },
    ],
    nodeVersion: '>=14.0.0',
  },

  // ==================== MOBILE TEMPLATES ====================

  // Expo (React Native)
  {
    id: 'expo',
    name: 'Expo (React Native)',
    description: 'Build native mobile apps for iOS and Android with React Native and Expo.',
    longDescription: `Create cross-platform mobile applications using React Native with Expo.
    Includes native APIs, OTA updates, and an easy development workflow.`,
    category: 'mobile',
    difficulty: 'intermediate',
    icon: 'i-ph:device-mobile',
    technologies: ['React Native', 'Expo', 'TypeScript'],
    tags: ['mobile', 'react-native', 'expo', 'ios', 'android'],
    features: [
      'Cross-platform (iOS & Android)',
      'Over-the-air updates',
      'Native API access',
      'Expo Go for testing',
      'Easy app store publishing',
    ],
    starterPath: 'recoder-expo',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npx expo start', description: 'Start Expo dev server' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
    isFeatured: true,
  },

  // ==================== AI TEMPLATES ====================

  // AI Chatbot
  {
    id: 'ai-chatbot',
    name: 'AI Chatbot',
    description: 'Build an AI-powered chatbot with OpenAI API integration and streaming responses.',
    category: 'ai',
    difficulty: 'intermediate',
    icon: 'i-ph:robot',
    technologies: ['React', 'TypeScript', 'OpenAI', 'Vercel AI SDK'],
    tags: ['ai', 'chatbot', 'openai', 'gpt', 'streaming'],
    features: [
      'OpenAI GPT integration',
      'Streaming responses',
      'Chat history',
      'Markdown rendering',
      'Code highlighting',
    ],
    // This template uses a custom file structure
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start development server' },
    ],
    environmentVariables: [
      {
        key: 'OPENAI_API_KEY',
        description: 'OpenAI API key for GPT models',
        required: true,
        sensitive: true,
      },
    ],
    nodeVersion: '>=18.0.0',
    isFeatured: true,
    isNew: true,
  },

  // ==================== OTHER TEMPLATES ====================

  // Slidev Presentations
  {
    id: 'slidev',
    name: 'Slidev',
    description: 'Presentation slides for developers. Write in Markdown, present beautifully.',
    category: 'other',
    difficulty: 'beginner',
    icon: 'i-ph:presentation',
    technologies: ['Vue', 'Markdown', 'Slidev', 'UnoCSS'],
    tags: ['slides', 'presentation', 'markdown', 'developer'],
    features: [
      'Markdown-based slides',
      'Code syntax highlighting',
      'Live coding support',
      'LaTeX math',
      'Export to PDF',
      'Presenter mode',
    ],
    starterPath: 'slidev',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start presentation' },
    ],
    nodeVersion: '>=18.0.0',
    isPopular: true,
  },

  // Remotion Videos
  {
    id: 'remotion',
    name: 'Remotion',
    description: 'Create videos programmatically with React. Perfect for data-driven video generation.',
    category: 'other',
    difficulty: 'advanced',
    icon: 'i-ph:video',
    technologies: ['React', 'Remotion', 'TypeScript'],
    tags: ['video', 'animation', 'programmatic', 'react'],
    features: [
      'React-powered videos',
      'Programmatic generation',
      'Export to MP4/GIF',
      'Timeline control',
      'Data-driven content',
    ],
    starterPath: 'recoder-remotion',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start Remotion Studio' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // TutorialKit
  {
    id: 'tutorialkit',
    name: 'TutorialKit',
    description: 'Create interactive tutorials for teaching web development concepts.',
    category: 'other',
    difficulty: 'intermediate',
    icon: 'i-ph:graduation-cap',
    technologies: ['Astro', 'TutorialKit', 'WebContainers'],
    tags: ['tutorial', 'interactive', 'education', 'teaching'],
    features: [
      'Interactive code editor',
      'Step-by-step lessons',
      'Browser-based execution',
      'Progress tracking',
    ],
    starterPath: 'tutorialkit',
    setupCommands: [
      { command: 'npm install', description: 'Install dependencies' },
      { command: 'npm run dev', description: 'Start tutorial server' },
    ],
    nodeVersion: '>=18.0.0',
  },

  // Static HTML/CSS/JS
  {
    id: 'static',
    name: 'Static HTML/CSS/JS',
    description: 'Classic static website with HTML, CSS, and JavaScript. No build tools, just the basics.',
    category: 'other',
    difficulty: 'beginner',
    icon: 'i-ph:code',
    technologies: ['HTML5', 'CSS3', 'JavaScript'],
    tags: ['static', 'vanilla', 'simple', 'no-framework'],
    features: [
      'No build tools needed',
      'Browser-native code',
      'Easy deployment',
      'Minimal setup',
    ],
    starterPath: 'static',
    nodeVersion: undefined, // No Node.js required
  },

  // Bootstrap 5
  {
    id: 'bootstrap',
    name: 'Bootstrap 5',
    description: 'Static site with Bootstrap 5 for responsive, mobile-first web design.',
    category: 'other',
    difficulty: 'beginner',
    icon: 'i-ph:layout',
    technologies: ['HTML', 'CSS', 'Bootstrap 5', 'JavaScript'],
    tags: ['bootstrap', 'responsive', 'css-framework', 'mobile-first'],
    features: [
      'Responsive grid system',
      'Pre-built components',
      'Utility classes',
      'JavaScript plugins',
    ],
    starterPath: 'bootstrap-5',
    nodeVersion: undefined, // No Node.js required
  },

  // Blank Project
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with an empty project. Full flexibility, no constraints.',
    category: 'other',
    difficulty: 'beginner',
    icon: 'i-ph:file-plus',
    technologies: [],
    tags: ['blank', 'empty', 'scratch', 'custom'],
    features: [
      'Empty canvas',
      'Full flexibility',
      'No dependencies',
      'Complete freedom',
    ],
    nodeVersion: undefined,
  },
];

// Export helper functions
export function getTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: TemplateCategory): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.category === category);
}

export function getFeaturedTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.isFeatured);
}

export function getPopularTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.isPopular);
}

export function getNewTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.isNew);
}

export function searchTemplates(query: string): ProjectTemplate[] {
  const lowerQuery = query.toLowerCase();
  return PROJECT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.technologies.some((tech) => tech.toLowerCase().includes(lowerQuery)) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
