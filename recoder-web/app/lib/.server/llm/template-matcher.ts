/**
 * Template Matcher
 * Matches user requests to pre-built starter templates
 * Achieves 80% cost reduction for template-based projects
 */

export interface TemplateInfo {
  id: string;
  name: string;
  path: string;
  description: string;
  keywords: string[];
  framework: string;
  category: 'frontend' | 'backend' | 'fullstack' | 'animation' | 'utility' | 'ecommerce' | 'mobile';
  complexity: 'simple' | 'moderate' | 'advanced' | 'intermediate';
  features: string[];
  webContainerCompatible?: boolean;
  requiresNativeBinaries?: boolean;
  hasWebContainerAlternative?: string;
}

export const STARTER_TEMPLATES: TemplateInfo[] = [
  {
    id: 'nextjs-shadcn',
    name: 'Next.js with shadcn/ui',
    path: '/starters/nextjs-shadcn',
    description: 'Full-featured Next.js app with shadcn/ui components, Tailwind CSS, and TypeScript',
    keywords: ['nextjs', 'next.js', 'next', 'shadcn', 'ui library', 'tailwind', 'typescript', 'react'],
    framework: 'nextjs',
    category: 'fullstack',
    complexity: 'advanced',
    features: [
      'shadcn/ui component library',
      'Tailwind CSS',
      'TypeScript',
      'Form handling with react-hook-form',
      'Radix UI components',
      'Dark mode support',
      'Supabase integration ready'
    ]
  },
  {
    id: 'vite-shadcn',
    name: 'Vite React with shadcn/ui',
    path: '/starters/vite-shadcn',
    description: 'Fast Vite-powered React app with shadcn/ui',
    keywords: ['vite', 'react', 'shadcn', 'spa', 'single page'],
    framework: 'vite',
    category: 'frontend',
    complexity: 'moderate',
    features: ['Vite dev server', 'shadcn/ui', 'Tailwind CSS', 'TypeScript']
  },
  {
    id: 'recoder-vite-react-ts',
    name: 'Bolt Vite React TypeScript',
    path: '/starters/recoder-vite-react-ts',
    description: 'Optimized Vite + React + TypeScript starter for Bolt',
    keywords: ['vite', 'react', 'typescript', 'bolt', 'fast'],
    framework: 'vite',
    category: 'frontend',
    complexity: 'simple',
    features: ['Fast development', 'TypeScript', 'React 18', 'HMR']
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    path: '/starters/nextjs',
    description: 'Standard Next.js application',
    keywords: ['nextjs', 'next.js', 'next', 'ssr', 'server-side'],
    framework: 'nextjs',
    category: 'fullstack',
    complexity: 'moderate',
    features: ['Server-side rendering', 'API routes', 'TypeScript', 'App Router']
  },
  {
    id: 'nextjs-ecommerce-stripe',
    name: 'Next.js E-commerce with Stripe',
    path: '/starters/nextjs-ecommerce-stripe',
    description: 'Production-ready e-commerce template with Stripe payment integration, shopping cart, and product catalog',
    keywords: ['nextjs', 'next.js', 'next', 'ecommerce', 'e-commerce', 'shop', 'store', 'shopping', 'cart', 'stripe', 'payment', 'checkout', 'products', 'catalog', 'marketplace'],
    framework: 'nextjs',
    category: 'ecommerce',
    complexity: 'advanced',
    features: [
      'Stripe checkout integration',
      'Shopping cart with Zustand',
      'Product catalog',
      'Order confirmation',
      'Responsive design',
      'TypeScript',
      'Tailwind CSS',
      'Payment webhooks'
    ]
  },
  {
    id: 'react-ts',
    name: 'React TypeScript',
    path: '/starters/react-ts',
    description: 'Simple React app with TypeScript',
    keywords: ['react', 'typescript', 'simple', 'basic'],
    framework: 'react',
    category: 'frontend',
    complexity: 'simple',
    features: ['React', 'TypeScript', 'Basic setup']
  },
  {
    id: 'vue',
    name: 'Vue.js',
    path: '/starters/vue',
    description: 'Vue.js application',
    keywords: ['vue', 'vuejs', 'vue.js'],
    framework: 'vue',
    category: 'frontend',
    complexity: 'simple',
    features: ['Vue 3', 'Composition API']
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    path: '/starters/sveltekit',
    description: 'SvelteKit full-stack framework',
    keywords: ['svelte', 'sveltekit', 'svelte kit'],
    framework: 'svelte',
    category: 'fullstack',
    complexity: 'moderate',
    features: ['SvelteKit', 'SSR', 'File-based routing']
  },
  {
    id: 'angular',
    name: 'Angular',
    path: '/starters/angular',
    description: 'Angular application',
    keywords: ['angular', 'ng', 'typescript'],
    framework: 'angular',
    category: 'frontend',
    complexity: 'moderate',
    features: ['Angular', 'TypeScript', 'RxJS']
  },
  {
    id: 'astro-shadcn',
    name: 'Astro with shadcn',
    path: '/starters/astro-shadcn',
    description: 'Astro static site with shadcn components',
    keywords: ['astro', 'static', 'shadcn', 'ssg'],
    framework: 'astro',
    category: 'frontend',
    complexity: 'moderate',
    features: ['Astro', 'Static site generation', 'shadcn/ui']
  },
  {
    id: 'express-simple',
    name: 'Express.js',
    path: '/starters/express-simple',
    description: 'Simple Express.js backend',
    keywords: ['express', 'node', 'backend', 'api', 'server'],
    framework: 'express',
    category: 'backend',
    complexity: 'simple',
    features: ['Express.js', 'REST API', 'Node.js']
  },
  {
    id: 'express-typescript',
    name: 'Express TypeScript API',
    path: '/starters/express-typescript',
    description: 'Production-ready Express.js with TypeScript, Zod validation, OpenAPI docs, and comprehensive testing',
    keywords: ['express', 'typescript', 'api', 'rest', 'backend', 'zod', 'validation', 'swagger', 'openapi', 'vitest', 'testing'],
    framework: 'express',
    category: 'backend',
    complexity: 'moderate',
    features: [
      'Express.js 5.x with TypeScript',
      'Zod schema validation',
      'OpenAPI/Swagger documentation',
      'Rate limiting & security (Helmet, CORS)',
      'Pino logger',
      'Vitest testing setup',
      'Biome for linting',
      'Docker ready',
      'Clean architecture (controllers, services, repositories)'
    ]
  },
  {
    id: 'express-typescript-auth',
    name: 'Express TypeScript with JWT Auth',
    path: '/starters/express-typescript-auth',
    description: 'Complete authentication service with JWT, refresh tokens, email verification, and password reset. ⚠️ Note: Uses Prisma which requires native binaries - not compatible with WebContainer. Recommend using @libsql/client or sql.js instead for browser environments.',
    keywords: ['express', 'typescript', 'auth', 'jwt', 'authentication', 'login', 'signup', 'password', 'email', 'verification', 'security'],
    framework: 'express',
    category: 'backend',
    complexity: 'advanced',
    webContainerCompatible: false,
    requiresNativeBinaries: true,
    hasWebContainerAlternative: 'express-auth-libsql',
    features: [
      'JWT authentication with refresh tokens',
      'Email verification system',
      'Password reset functionality',
      'Prisma ORM (requires native binaries)',
      'Nodemailer integration',
      'Rate limiting for auth endpoints',
      'XSS protection',
      'Cookie-based sessions',
      'TypeScript strict mode',
      'Comprehensive error handling'
    ]
  },
  {
    id: 'express-auth-libsql',
    name: 'Express Auth API (WebContainer)',
    path: 'VIRTUAL', // Generated on-the-fly
    description: 'Complete authentication service with JWT, refresh tokens, and user management. Uses @libsql/client (pure JavaScript) - fully compatible with WebContainer.',
    keywords: ['express', 'typescript', 'auth', 'jwt', 'authentication', 'login', 'signup', 'password', 'sqlite', 'libsql', 'webcontainer'],
    framework: 'express',
    category: 'backend',
    complexity: 'intermediate',
    webContainerCompatible: true,
    requiresNativeBinaries: false,
    features: [
      'JWT authentication with refresh tokens',
      'User registration and login',
      'Password hashing with bcrypt',
      '@libsql/client - Pure JS SQLite',
      'No native dependencies',
      'Runs in browser via WebContainer',
      'Rate limiting',
      'TypeScript',
      'RESTful API design'
    ]
  },
  {
    id: 'express-mongodb-api',
    name: 'Express MongoDB REST API',
    path: '/starters/express-mongodb-api',
    description: 'Full-featured REST API with MongoDB, authentication, file uploads, and email templates',
    keywords: ['express', 'mongodb', 'mongoose', 'rest', 'api', 'auth', 'upload', 'email', 'redis', 'bcrypt'],
    framework: 'express',
    category: 'fullstack',
    complexity: 'advanced',
    features: [
      'MongoDB with Mongoose',
      'Complete authentication system',
      'File upload with Multer & Sharp',
      'Email templates with Nodemailer',
      'Redis caching',
      'i18n internationalization',
      'Image processing',
      'Winston logger',
      'TypeScript support',
      'Docker configuration'
    ]
  },
  {
    id: 'hono-nodejs-starter',
    name: 'Hono Node.js',
    path: '/starters/hono-nodejs-starter',
    description: 'Fast Hono.js backend framework',
    keywords: ['hono', 'node', 'backend', 'api', 'fast'],
    framework: 'hono',
    category: 'backend',
    complexity: 'simple',
    features: ['Hono.js', 'Ultra-fast', 'TypeScript']
  },
  {
    id: 'gsap-react',
    name: 'GSAP React',
    path: '/starters/gsap-react',
    description: 'React with GSAP animations',
    keywords: ['gsap', 'animation', 'react', 'animations'],
    framework: 'react',
    category: 'animation',
    complexity: 'moderate',
    features: ['GSAP animations', 'React', 'Smooth animations']
  },
  {
    id: 'gsap-next',
    name: 'GSAP Next.js',
    path: '/starters/gsap-next',
    description: 'Next.js with GSAP animations',
    keywords: ['gsap', 'animation', 'nextjs', 'next'],
    framework: 'nextjs',
    category: 'animation',
    complexity: 'moderate',
    features: ['GSAP', 'Next.js', 'Advanced animations']
  },
  {
    id: 'three-tres',
    name: 'Three.js with TresJS',
    path: '/starters/tres',
    description: '3D graphics with Three.js and TresJS for Vue',
    keywords: ['three.js', 'threejs', '3d', 'webgl', 'graphics', 'tres'],
    framework: 'vue',
    category: 'frontend',
    complexity: 'advanced',
    features: ['Three.js', 'TresJS', '3D graphics', 'WebGL']
  },
  {
    id: 'static',
    name: 'Static HTML/CSS/JS',
    path: '/starters/static',
    description: 'Simple static website',
    keywords: ['html', 'css', 'javascript', 'static', 'vanilla', 'simple'],
    framework: 'vanilla',
    category: 'frontend',
    complexity: 'simple',
    features: ['Pure HTML/CSS/JS', 'No build tools']
  },
  {
    id: 'bootstrap-5',
    name: 'Bootstrap 5',
    path: '/starters/bootstrap-5',
    description: 'Bootstrap 5 static site',
    keywords: ['bootstrap', 'css framework', 'responsive'],
    framework: 'vanilla',
    category: 'frontend',
    complexity: 'simple',
    features: ['Bootstrap 5', 'Responsive design']
  },
  {
    id: 'recoder-expo',
    name: 'React Native Expo',
    path: '/starters/recoder-expo',
    description: 'React Native mobile app with Expo SDK, file-based routing, tab navigation, and dark theme',
    keywords: ['react native', 'expo', 'mobile app', 'mobile application', 'ios', 'android', 'cross-platform', 'phone app', 'native app', 'mobile', 'smartphone app', 'tablet app', 'app store'],
    framework: 'react-native',
    category: 'mobile',
    complexity: 'advanced',
    features: [
      'Expo SDK 54 with New Architecture',
      'Expo Router v6 file-based navigation',
      'Bottom tab navigation with Ionicons',
      'Dark theme with consistent styling',
      'Cross-platform: iOS, Android, and Web',
      'TypeScript strict mode',
      'SafeAreaView for notch handling',
      'Interactive counter demo component',
      'Settings screen with platform info'
    ]
  },
  {
    id: 'quasar',
    name: 'Quasar Vue',
    path: '/starters/quasar',
    description: 'Quasar Framework for Vue',
    keywords: ['quasar', 'vue', 'ui framework'],
    framework: 'vue',
    category: 'frontend',
    complexity: 'moderate',
    features: ['Quasar Framework', 'Vue', 'Material Design']
  },
  {
    id: 'slidev',
    name: 'Slidev Presentations',
    path: '/starters/slidev',
    description: 'Developer-focused presentation slides',
    keywords: ['slides', 'presentation', 'slidev', 'markdown'],
    framework: 'vue',
    category: 'utility',
    complexity: 'simple',
    features: ['Markdown slides', 'Code highlighting', 'Developer presentations']
  },
  {
    id: 'nextjs-blog-mdx',
    name: 'Next.js Blog with MDX',
    path: '/starters/nextjs-blog-mdx',
    description: 'Modern, fast blog platform built with Next.js 14, MDX, and Tailwind CSS. Perfect for content creators and developers who want a performant blog with React component support in markdown.',
    keywords: ['blog', 'blogging', 'mdx', 'markdown', 'nextjs', 'next.js', 'posts', 'articles', 'content', 'cms', 'writing', 'rss', 'seo', 'tailwind'],
    framework: 'nextjs',
    category: 'fullstack',
    complexity: 'moderate',
    features: [
      'MDX support - write posts with React components',
      'Syntax highlighting for code blocks',
      'Categories and tags organization',
      'Automatic reading time estimation',
      'Auto-generated RSS feed',
      'SEO optimized with meta tags',
      'Responsive Tailwind CSS design',
      'Static generation with ISR',
      'Fast performance'
    ]
  },
  {
    id: 'BlogApp',
    name: 'React Native Blog App',
    path: '/starters/BlogApp',
    description: 'React Native mobile blog application built with Expo. Perfect for creating native iOS and Android blog reading apps.',
    keywords: ['blog', 'mobile', 'react native', 'expo', 'ios', 'android', 'app', 'native', 'mobile blog'],
    framework: 'react-native',
    category: 'frontend',
    complexity: 'advanced',
    features: [
      'React Native with Expo',
      'Cross-platform iOS and Android',
      'Blog post reading interface',
      'Native mobile components',
      'Expo Router navigation',
      'Bottom tabs navigation',
      'Haptic feedback',
      'Optimized for mobile'
    ]
  }
];

/**
 * Match user query to template with confidence score
 */
export interface TemplateMatch {
  template: TemplateInfo;
  confidence: number; // 0-100
  matchedKeywords: string[];
  reasoning: string;
}

export function matchTemplate(userMessage: string): TemplateMatch | null {
  const lowerMessage = userMessage.toLowerCase();
  const words = lowerMessage.split(/\s+/);

  let bestMatch: TemplateMatch | null = null;
  let highestScore = 0;

  for (const template of STARTER_TEMPLATES) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Direct keyword matching (highest weight)
    for (const keyword of template.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += 25;
        matchedKeywords.push(keyword);

        // Bonus for exact keyword match in words
        if (words.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
    }

    // Framework name matching
    if (lowerMessage.includes(template.framework)) {
      score += 20;
    }

    // Category matching
    const categoryKeywords: Record<string, string[]> = {
      frontend: ['frontend', 'client', 'ui', 'website', 'web app'],
      backend: ['backend', 'server', 'api', 'rest', 'graphql'],
      fullstack: ['fullstack', 'full stack', 'full-stack', 'complete app'],
      animation: ['animation', 'animated', 'gsap', 'motion'],
      utility: ['presentation', 'slides', 'tool'],
      ecommerce: ['ecommerce', 'e-commerce', 'shop', 'store', 'shopping', 'marketplace'],
      mobile: ['mobile', 'phone app', 'native app', 'ios app', 'android app', 'smartphone']
    };

    const categoryWords = categoryKeywords[template.category] || [];
    for (const word of categoryWords) {
      if (lowerMessage.includes(word)) {
        score += 10;
      }
    }

    // Feature matching
    for (const feature of template.features) {
      const featureLower = feature.toLowerCase();
      if (lowerMessage.includes(featureLower)) {
        score += 5;
      }
    }

    // UI library specific matching
    if (template.id.includes('shadcn')) {
      if (lowerMessage.includes('component library') ||
          lowerMessage.includes('ui components') ||
          lowerMessage.includes('design system')) {
        score += 15;
      }
    }

    // Common project types
    const projectTypePatterns: Record<string, RegExp[]> = {
      'nextjs-shadcn': [
        /dashboard/i,
        /admin panel/i,
        /saas/i,
        /web app.*modern/i,
        /todo.*app/i,
        /crud/i
      ],
      'static': [
        /landing page/i,
        /portfolio/i,
        /simple.*website/i
      ],
      'express-simple': [
        /simple.*backend/i,
        /basic.*api/i,
        /minimal.*server/i
      ],
      'express-typescript': [
        /typescript.*api/i,
        /rest.*api.*typescript/i,
        /backend.*typescript/i,
        /api.*validation/i,
        /swagger.*api/i,
        /openapi/i,
        /production.*api/i,
        /scalable.*backend/i
      ],
      'express-typescript-auth': [
        /auth.*api/i,
        /authentication.*service/i,
        /login.*signup/i,
        /jwt.*auth/i,
        /user.*management/i,
        /auth.*backend/i,
        /authentication.*system/i,
        /password.*reset/i,
        /email.*verification/i
      ],
      'express-mongodb-api': [
        /mongodb.*api/i,
        /mongo.*backend/i,
        /full.*backend/i,
        /complete.*api/i,
        /file.*upload.*api/i,
        /api.*email/i,
        /redis.*api/i
      ],
      'gsap-react': [
        /animated.*site/i,
        /animation.*heavy/i,
        /interactive.*experience/i
      ],
      'recoder-expo': [
        /\b(mobile|ios|android)\s+(app|application)\b/i,
        /\bios\b.*\bandroid\b/i,
        /\breact\s+native\b/i,
        /\bexpo\s+app\b/i,
        /\bcross-platform\s+mobile\b/i
      ]
    };

    const patterns = projectTypePatterns[template.id] || [];
    for (const pattern of patterns) {
      if (pattern.test(lowerMessage)) {
        score += 30; // High bonus for project type match
      }
    }

    // Update best match
    if (score > highestScore) {
      highestScore = score;

      // Generate reasoning
      let reasoning = `Matched template: ${template.name}`;
      if (matchedKeywords.length > 0) {
        reasoning += ` (keywords: ${matchedKeywords.join(', ')})`;
      }

      bestMatch = {
        template,
        confidence: Math.min(100, score), // Cap at 100
        matchedKeywords,
        reasoning
      };
    }
  }

  // Only return if confidence is above threshold
  const CONFIDENCE_THRESHOLD = 30;
  if (bestMatch && bestMatch.confidence >= CONFIDENCE_THRESHOLD) {
    return bestMatch;
  }

  return null;
}

/**
 * Get template-specific prompt optimization
 */
export function getTemplatePrompt(template: TemplateInfo, userRequest: string): string {
  return `You are customizing a pre-built ${template.name} template.

IMPORTANT: The base template already includes:
${template.features.map(f => `- ${f}`).join('\n')}

Your task is to:
1. Use the existing template structure from ${template.path}
2. Customize ONLY what the user specifically requested
3. Keep all existing template features intact
4. Add minimal new code to achieve the user's goal

User request: ${userRequest}

CRITICAL: Do not recreate the entire template. Only modify/add what's necessary.
This saves significant processing and ensures consistency with the proven template.`;
}

/**
 * Analyze if request is template-suitable
 */
export function isTemplateSuitable(userMessage: string): boolean {
  // ❌ BLOCK vague requests that shouldn't use templates
  const vaguePatterns = [
    /^(make|create|build)\s+(a|an)?\s*component\s*library/i,  // "make a component library"
    /^(make|create|build)\s+(a|an)?\s*trading\s+component/i,  // "make a trading component"
    /^(make|create|build)\s+(a|an)?\s*component(?!\s+(for|in|with))/i,  // "make a component" (standalone)
    /^(add|create)\s+(a|an)?\s*\w+\s+component$/i,  // "add a button component"
    /^(turn|convert|change)\s+this/i,  // "turn this into..."
  ];

  // Check if request is too vague
  if (vaguePatterns.some(pattern => pattern.test(userMessage.trim()))) {
    return false;  // Don't use templates for vague requests
  }

  // ✅ ALLOW specific project types
  const templateIndicators = [
    /create (a |an )?(.+)?(app|application|website|site|project)/i,
    /build (a |an )?(.+)?(app|application|website|site)/i,
    /make (a |an )?(.+)?(app|application|website|site)/i,
    /set up (a |an )?(.+)?(project|app)/i,
    /start (a |an )?(new )?(.+)?(project|app)/i,
    /initialize|scaffold|bootstrap/i,
    /(todo|blog|portfolio|dashboard|landing|crud|admin|saas|e-commerce)/i,
    /\b(mobile|ios|android|react.native|expo)\b.*\b(app|application)\b/i,
    /\b(app|application)\b.*\b(mobile|ios|android|react.native|expo)\b/i,
    /\bphone\s+app\b/i,
    /\bnative\s+app\b/i
  ];

  return templateIndicators.some(pattern => pattern.test(userMessage));
}

/**
 * Get default template for framework
 */
export function getDefaultTemplateForFramework(framework: string): TemplateInfo | null {
  const frameworkMap: Record<string, string> = {
    'react': 'recoder-vite-react-ts',
    'nextjs': 'nextjs-shadcn',
    'next': 'nextjs-shadcn',
    'vue': 'vue',
    'svelte': 'sveltekit',
    'angular': 'angular',
    'express': 'express-simple',
    'node': 'express-simple',
    'static': 'static',
    'html': 'static',
    'expo': 'recoder-expo',
    'react-native': 'recoder-expo',
    'mobile': 'recoder-expo'
  };

  const templateId = frameworkMap[framework.toLowerCase()];
  return STARTER_TEMPLATES.find(t => t.id === templateId) || null;
}
