/**
 * Backend Template Registry
 * Centralized registry for backend starter templates
 * Used by LLM to select appropriate backend scaffolding
 */

export interface BackendTemplate {
  id: string;
  name: string;
  description: string;
  path: string;
  framework: string;
  database?: string;
  features: string[];
  useCases: string[];
  complexity: 'simple' | 'moderate' | 'advanced';
  setupInstructions: string;
  envVariables: string[];
  dependencies: string[];
}

export const BACKEND_TEMPLATES: BackendTemplate[] = [
  {
    id: 'express-simple',
    name: 'Express Simple',
    description: 'Minimal Express.js server for quick prototypes',
    path: '/starters/express-simple',
    framework: 'express',
    complexity: 'simple',
    features: [
      'Basic Express server',
      'Static file serving',
      'Simple routing'
    ],
    useCases: [
      'Quick prototypes',
      'Learning projects',
      'Static file servers',
      'Simple APIs'
    ],
    setupInstructions: 'npm install && npm start',
    envVariables: [],
    dependencies: ['express']
  },
  {
    id: 'express-typescript',
    name: 'Express TypeScript API',
    description: 'Production-ready REST API with TypeScript, validation, and OpenAPI docs',
    path: '/starters/express-typescript',
    framework: 'express',
    complexity: 'moderate',
    features: [
      'TypeScript with strict mode',
      'Zod schema validation',
      'OpenAPI/Swagger documentation',
      'Rate limiting',
      'Security headers (Helmet)',
      'CORS configuration',
      'Pino structured logging',
      'Vitest for testing',
      'Biome for linting',
      'Clean architecture (Controller-Service-Repository)',
      'Docker support',
      'Path aliases for imports'
    ],
    useCases: [
      'REST APIs',
      'Microservices',
      'API gateways',
      'Backend for web apps',
      'Mobile app backends',
      'Scalable services'
    ],
    setupInstructions: 'pnpm install && pnpm start:dev',
    envVariables: [
      'NODE_ENV',
      'PORT',
      'HOST',
      'CORS_ORIGIN'
    ],
    dependencies: [
      'express',
      'zod',
      'helmet',
      'cors',
      'pino',
      'pino-http',
      'swagger-ui-express',
      'express-rate-limit'
    ]
  },
  {
    id: 'express-typescript-auth',
    name: 'Express TypeScript with Authentication',
    description: 'Complete authentication service with JWT, email verification, and password management',
    path: '/starters/express-typescript-auth',
    framework: 'express',
    database: 'PostgreSQL (Prisma)',
    complexity: 'advanced',
    features: [
      'JWT authentication',
      'Refresh token rotation',
      'Email verification',
      'Password reset flow',
      'Prisma ORM',
      'Nodemailer integration',
      'Cookie-based sessions',
      'XSS protection',
      'Rate limiting for auth endpoints',
      'Bcrypt password hashing',
      'TypeScript strict mode',
      'Comprehensive error handling',
      'Email templates'
    ],
    useCases: [
      'User authentication systems',
      'SaaS applications',
      'Multi-user platforms',
      'Secure APIs',
      'Member portals',
      'Applications requiring user accounts'
    ],
    setupInstructions: 'npm install && npx prisma generate && npx prisma migrate dev && npm run dev',
    envVariables: [
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'CLIENT_URL',
      'NODE_ENV'
    ],
    dependencies: [
      'express',
      '@prisma/client',
      'jsonwebtoken',
      'bcrypt',
      'nodemailer',
      'cookie-parser',
      'express-rate-limit',
      'helmet',
      'cors'
    ]
  },
  {
    id: 'express-mongodb-api',
    name: 'Express MongoDB REST API',
    description: 'Full-featured backend with MongoDB, auth, file uploads, and email templates',
    path: '/starters/express-mongodb-api',
    framework: 'express',
    database: 'MongoDB (Mongoose)',
    complexity: 'advanced',
    features: [
      'MongoDB with Mongoose ODM',
      'Complete authentication system',
      'File upload with Multer',
      'Image processing with Sharp',
      'Email templates',
      'Redis caching',
      'i18n internationalization',
      'JWT authentication',
      'Bcrypt password hashing',
      'Winston logger',
      'CORS & security middleware',
      'TypeScript support',
      'Docker configuration',
      'Seed data scripts'
    ],
    useCases: [
      'Full-stack web applications',
      'Content management systems',
      'Social media platforms',
      'E-commerce backends',
      'Applications with file uploads',
      'Multi-language applications',
      'Applications requiring caching'
    ],
    setupInstructions: 'npm install && npm run watch',
    envVariables: [
      'MONGO_URI',
      'REDIS_URL',
      'JWT_SECRET',
      'JWT_EXPIRATION',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'NODE_ENV',
      'PORT'
    ],
    dependencies: [
      'express',
      'mongoose',
      'jsonwebtoken',
      'bcrypt',
      'multer',
      'sharp',
      'nodemailer',
      'email-templates',
      'redis',
      'winston',
      'cors',
      'i18next',
      'validator'
    ]
  }
];

/**
 * Get backend template by ID
 */
export function getBackendTemplate(id: string): BackendTemplate | undefined {
  return BACKEND_TEMPLATES.find(t => t.id === id);
}

/**
 * Find backend template based on requirements
 */
export function findBackendTemplate(requirements: {
  needsAuth?: boolean;
  needsDatabase?: boolean;
  preferredDb?: 'mongodb' | 'postgresql' | 'sqlite';
  needsFileUpload?: boolean;
  needsEmail?: boolean;
  needsCaching?: boolean;
  complexity?: 'simple' | 'moderate' | 'advanced';
}): BackendTemplate {
  const {
    needsAuth = false,
    needsDatabase = false,
    preferredDb,
    needsFileUpload = false,
    needsEmail = false,
    needsCaching = false,
    complexity = 'moderate'
  } = requirements;

  // Auth service with email verification
  if (needsAuth && needsEmail && !needsFileUpload) {
    return BACKEND_TEMPLATES.find(t => t.id === 'express-typescript-auth')!;
  }

  // Full-featured with MongoDB
  if (needsDatabase && (preferredDb === 'mongodb' || needsFileUpload || needsCaching)) {
    return BACKEND_TEMPLATES.find(t => t.id === 'express-mongodb-api')!;
  }

  // Auth with any database
  if (needsAuth && needsDatabase) {
    return BACKEND_TEMPLATES.find(t => t.id === 'express-typescript-auth')!;
  }

  // Simple backend
  if (complexity === 'simple' || (!needsAuth && !needsDatabase)) {
    return BACKEND_TEMPLATES.find(t => t.id === 'express-simple')!;
  }

  // Default to TypeScript API
  return BACKEND_TEMPLATES.find(t => t.id === 'express-typescript')!;
}

/**
 * Generate setup instructions for selected template
 */
export function generateSetupGuide(template: BackendTemplate): string {
  let guide = `# ${template.name} Setup Guide\n\n`;
  
  guide += `## Description\n${template.description}\n\n`;
  
  guide += `## Features\n`;
  template.features.forEach(feature => {
    guide += `- ${feature}\n`;
  });
  
  guide += `\n## Installation\n\`\`\`bash\n${template.setupInstructions}\n\`\`\`\n\n`;
  
  if (template.envVariables.length > 0) {
    guide += `## Environment Variables\n`;
    guide += `Create a \`.env\` file with the following variables:\n\n`;
    guide += `\`\`\`env\n`;
    template.envVariables.forEach(varName => {
      guide += `${varName}=your_value_here\n`;
    });
    guide += `\`\`\`\n\n`;
  }
  
  guide += `## Use Cases\n`;
  template.useCases.forEach(useCase => {
    guide += `- ${useCase}\n`;
  });
  
  return guide;
}

/**
 * Get backend template recommendations based on user query
 */
export function recommendBackendTemplate(userQuery: string): BackendTemplate[] {
  const query = userQuery.toLowerCase();
  const recommendations: { template: BackendTemplate; score: number }[] = [];

  for (const template of BACKEND_TEMPLATES) {
    let score = 0;

    // Check use cases
    for (const useCase of template.useCases) {
      if (query.includes(useCase.toLowerCase())) {
        score += 10;
      }
    }

    // Check features
    for (const feature of template.features) {
      if (query.includes(feature.toLowerCase())) {
        score += 5;
      }
    }

    // Check keywords
    if (query.includes('auth') || query.includes('login') || query.includes('signup')) {
      if (template.id.includes('auth')) score += 20;
    }

    if (query.includes('mongodb') || query.includes('mongo')) {
      if (template.id.includes('mongodb')) score += 20;
    }

    if (query.includes('simple') || query.includes('basic') || query.includes('minimal')) {
      if (template.complexity === 'simple') score += 15;
    }

    if (query.includes('typescript')) {
      if (template.id.includes('typescript')) score += 10;
    }

    if (score > 0) {
      recommendations.push({ template, score });
    }
  }

  // Sort by score and return templates
  return recommendations
    .sort((a, b) => b.score - a.score)
    .map(r => r.template);
}
