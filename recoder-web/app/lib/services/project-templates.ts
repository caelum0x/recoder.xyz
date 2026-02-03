/**
 * Project Templates Service
 * Provides template definitions, metadata, and initialization logic for new projects
 * Inspired by December's template selection pattern
 */

import { dockerPost, dockerWriteFiles } from './docker-api';

// ==================== INTERFACES ====================

/**
 * Template category types
 */
export type TemplateCategory = 'all' | 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'other';

/**
 * Template difficulty levels
 */
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Icon identifier - using Phosphor icons pattern (e.g., 'i-ph:atom')
 */
export type TemplateIcon = string;

/**
 * Starter file definition for templates
 */
export interface StarterFile {
  path: string;
  content: string;
}

/**
 * Template definition interface
 */
export interface ProjectTemplate {
  /** Unique template identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for filtering */
  category: TemplateCategory;
  /** Phosphor icon class */
  icon: TemplateIcon;
  /** List of technologies/frameworks used */
  technologies: string[];
  /** Key features of this template */
  features: string[];
  /** Path to starter template in starters directory */
  starterPath?: string;
  /** Preview image URL (optional) */
  previewImage?: string;
  /** Difficulty level */
  difficulty: TemplateDifficulty;
  /** Whether this is a popular/recommended template */
  isPopular?: boolean;
  /** Recommended use cases */
  recommendedFor?: string[];
  /** Inline starter files (for simple templates without starterPath) */
  starterFiles?: StarterFile[];
  /** Default package.json dependencies */
  dependencies?: Record<string, string>;
  /** Default package.json devDependencies */
  devDependencies?: Record<string, string>;
  /** Default scripts to add to package.json */
  scripts?: Record<string, string>;
}

/**
 * Category definition for UI
 */
export interface TemplateCategory_ {
  id: TemplateCategory;
  name: string;
  icon: TemplateIcon;
  description?: string;
}

/**
 * Result of initializing a project from template
 */
export interface TemplateInitResult {
  success: boolean;
  filesCreated: number;
  errors?: Array<{ path: string; error: string }>;
  starterPath?: string;
}

// ==================== TEMPLATE DEFINITIONS ====================

/**
 * All available project templates
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // Blank Project
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with an empty project. Perfect for when you have a specific vision in mind.',
    category: 'other',
    icon: 'i-ph:file-plus',
    technologies: [],
    features: ['Empty canvas', 'Full flexibility', 'No dependencies'],
    difficulty: 'beginner',
    recommendedFor: ['Custom projects', 'Experimentation', 'Learning'],
  },

  // ==================== FRONTEND TEMPLATES ====================

  {
    id: 'vite-react-ts',
    name: 'React + TypeScript',
    description: 'Modern React application with TypeScript, Vite, and Tailwind CSS. Fast development with hot module replacement.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'TypeScript', 'Vite', 'Tailwind CSS'],
    features: ['Hot Module Replacement', 'TypeScript Support', 'ESLint configured', 'Tailwind CSS'],
    starterPath: 'recoder-vite-react-ts',
    difficulty: 'beginner',
    isPopular: true,
    recommendedFor: ['Web applications', 'Single Page Apps', 'Dashboards'],
  },

  {
    id: 'vite-shadcn',
    name: 'React + shadcn/ui',
    description: 'React app with shadcn/ui components, Radix UI primitives, and Tailwind. Beautiful, accessible components.',
    category: 'frontend',
    icon: 'i-ph:paint-brush',
    technologies: ['React', 'TypeScript', 'shadcn/ui', 'Radix UI', 'Tailwind CSS'],
    features: ['Pre-built UI Components', 'Dark Mode', 'Accessible', 'Customizable'],
    starterPath: 'vite-shadcn',
    difficulty: 'beginner',
    isPopular: true,
    recommendedFor: ['Admin panels', 'Marketing sites', 'Production apps'],
  },

  {
    id: 'vite-vue',
    name: 'Vue.js',
    description: 'Progressive JavaScript framework for building user interfaces. Easy to learn and highly adaptable.',
    category: 'frontend',
    icon: 'i-ph:code',
    technologies: ['Vue 3', 'JavaScript', 'Vite'],
    features: ['Composition API', 'Reactive', 'Component-based'],
    starterPath: 'vue',
    difficulty: 'beginner',
    recommendedFor: ['Web applications', 'Interactive UIs', 'Progressive web apps'],
  },

  {
    id: 'react',
    name: 'React (JavaScript)',
    description: 'Simple React setup with JavaScript. Great for quick prototypes and learning.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'JavaScript', 'Vite'],
    features: ['Lightweight', 'Quick setup', 'No TypeScript'],
    starterPath: 'react',
    difficulty: 'beginner',
    recommendedFor: ['Prototypes', 'Learning React', 'Simple apps'],
  },

  {
    id: 'react-ts',
    name: 'React + TypeScript (Minimal)',
    description: 'Minimal React TypeScript setup without additional styling frameworks.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'TypeScript', 'Vite'],
    features: ['TypeScript', 'Minimal setup', 'No styling framework'],
    starterPath: 'react-ts',
    difficulty: 'beginner',
    recommendedFor: ['Custom styling solutions', 'CSS-in-JS experiments'],
  },

  {
    id: 'angular',
    name: 'Angular',
    description: 'Full-featured framework by Google for building scalable web applications.',
    category: 'frontend',
    icon: 'i-ph:shield-check',
    technologies: ['Angular', 'TypeScript', 'RxJS'],
    features: ['Full framework', 'CLI tools', 'Dependency injection'],
    starterPath: 'angular',
    difficulty: 'intermediate',
    recommendedFor: ['Enterprise apps', 'Large teams', 'Complex applications'],
  },

  {
    id: 'svelte',
    name: 'SvelteKit',
    description: 'Modern framework for building high-performance web apps with Svelte.',
    category: 'frontend',
    icon: 'i-ph:flame',
    technologies: ['Svelte', 'SvelteKit', 'TypeScript'],
    features: ['No virtual DOM', 'Server-side rendering', 'File-based routing'],
    starterPath: 'sveltekit',
    difficulty: 'intermediate',
    recommendedFor: ['Performance-critical apps', 'Blogs', 'Marketing sites'],
  },

  // ==================== FULL STACK TEMPLATES ====================

  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework with server-side rendering, API routes, and static generation.',
    category: 'fullstack',
    icon: 'i-ph:stack',
    technologies: ['Next.js', 'React', 'TypeScript'],
    features: ['Server-side rendering', 'API routes', 'File-based routing', 'Static generation'],
    starterPath: 'nextjs',
    difficulty: 'intermediate',
    isPopular: true,
    recommendedFor: ['Production web apps', 'E-commerce', 'Content sites'],
  },

  {
    id: 'nextjs-shadcn',
    name: 'Next.js + shadcn/ui',
    description: 'Next.js with shadcn/ui components. Production-ready full-stack setup.',
    category: 'fullstack',
    icon: 'i-ph:stack',
    technologies: ['Next.js', 'React', 'TypeScript', 'shadcn/ui', 'Tailwind CSS'],
    features: ['Full component library', 'Dark mode', 'SSR', 'API routes'],
    starterPath: 'nextjs-shadcn',
    difficulty: 'intermediate',
    isPopular: true,
    recommendedFor: ['SaaS applications', 'Dashboards', 'Admin panels'],
  },

  // ==================== BACKEND TEMPLATES ====================

  {
    id: 'express-ts',
    name: 'Express + TypeScript',
    description: 'Production-ready Express.js API with TypeScript, validation, and OpenAPI docs.',
    category: 'backend',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'TypeScript', 'Zod', 'Swagger'],
    features: ['OpenAPI documentation', 'Input validation', 'Rate limiting', 'Security headers'],
    starterPath: 'express-typescript',
    difficulty: 'intermediate',
    isPopular: true,
    recommendedFor: ['REST APIs', 'Microservices', 'Backend services'],
  },

  {
    id: 'express-simple',
    name: 'Express.js (Simple)',
    description: 'Minimal Express.js setup for quick API development.',
    category: 'backend',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'JavaScript', 'Node.js'],
    features: ['Minimal setup', 'Quick start', 'No TypeScript'],
    starterPath: 'express-simple',
    difficulty: 'beginner',
    recommendedFor: ['Quick prototypes', 'Simple APIs', 'Learning Node.js'],
  },

  {
    id: 'express-react',
    name: 'Express + React',
    description: 'Full-stack setup with Express backend and React frontend. Monorepo structure.',
    category: 'fullstack',
    icon: 'i-ph:stack',
    technologies: ['Express', 'React', 'TypeScript', 'Node.js'],
    features: ['Full-stack', 'API + Frontend', 'Monorepo', 'TypeScript'],
    starterPath: 'express-react',
    difficulty: 'intermediate',
    recommendedFor: ['Full-stack apps', 'Custom backends', 'Monorepo projects'],
  },

  // ==================== MOBILE TEMPLATES ====================

  {
    id: 'expo',
    name: 'Expo (React Native)',
    description: 'React Native mobile app with Expo for building cross-platform iOS and Android applications.',
    category: 'mobile',
    icon: 'i-ph:device-mobile',
    technologies: ['React Native', 'Expo', 'TypeScript'],
    features: ['Cross-platform', 'OTA updates', 'Native APIs', 'Easy testing'],
    starterPath: 'recoder-expo',
    difficulty: 'intermediate',
    recommendedFor: ['Mobile apps', 'Cross-platform development', 'Prototyping mobile UIs'],
  },

  // ==================== OTHER TEMPLATES ====================

  {
    id: 'static',
    name: 'Plain HTML/CSS/JS',
    description: 'Classic static website with HTML, CSS, and JavaScript. No build tools needed.',
    category: 'other',
    icon: 'i-ph:code',
    technologies: ['HTML', 'CSS', 'JavaScript'],
    features: ['No build tools', 'Simple deployment', 'Browser-native'],
    starterPath: 'static',
    difficulty: 'beginner',
    recommendedFor: ['Simple websites', 'Landing pages', 'Learning web basics'],
    starterFiles: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Welcome to My Website</h1>
    <nav>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <main>
    <section id="about">
      <h2>About</h2>
      <p>This is a simple static website built with HTML, CSS, and JavaScript.</p>
    </section>

    <section id="contact">
      <h2>Contact</h2>
      <p>Get in touch!</p>
    </section>
  </main>

  <footer>
    <p>&copy; 2024 My Website</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `/* Reset and base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

/* Header */
header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  text-align: center;
}

header h1 {
  margin-bottom: 1rem;
}

nav {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

nav a:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

/* Main content */
main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

section h2 {
  color: #667eea;
  margin-bottom: 1rem;
}

/* Footer */
footer {
  text-align: center;
  padding: 2rem;
  background: #333;
  color: white;
}`,
      },
      {
        path: 'script.js',
        content: `// Main JavaScript file

document.addEventListener('DOMContentLoaded', () => {
  console.log('Website loaded!');

  // Smooth scrolling for navigation links
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});`,
      },
    ],
  },
];

/**
 * Category definitions for the UI
 */
export const TEMPLATE_CATEGORIES: TemplateCategory_[] = [
  { id: 'all', name: 'All Templates', icon: 'i-ph:squares-four', description: 'Browse all available templates' },
  { id: 'frontend', name: 'Frontend', icon: 'i-ph:browser', description: 'Client-side web applications' },
  { id: 'backend', name: 'Backend', icon: 'i-ph:server', description: 'Server-side APIs and services' },
  { id: 'fullstack', name: 'Full Stack', icon: 'i-ph:stack', description: 'Complete frontend and backend' },
  { id: 'mobile', name: 'Mobile', icon: 'i-ph:device-mobile', description: 'Mobile applications' },
  { id: 'other', name: 'Other', icon: 'i-ph:dots-three', description: 'Specialized and experimental' },
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): ProjectTemplate[] {
  if (category === 'all') {
    return PROJECT_TEMPLATES;
  }
  return PROJECT_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get popular templates
 */
export function getPopularTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(t => t.isPopular);
}

/**
 * Get templates by difficulty
 */
export function getTemplatesByDifficulty(difficulty: TemplateDifficulty): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(t => t.difficulty === difficulty);
}

/**
 * Search templates by query
 */
export function searchTemplates(query: string): ProjectTemplate[] {
  if (!query.trim()) {
    return PROJECT_TEMPLATES;
  }

  const lowerQuery = query.toLowerCase();
  return PROJECT_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.technologies.some(tech => tech.toLowerCase().includes(lowerQuery)) ||
    t.features.some(feature => feature.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Filter templates by multiple criteria
 */
export function filterTemplates(options: {
  category?: TemplateCategory;
  difficulty?: TemplateDifficulty;
  technologies?: string[];
  query?: string;
  popularOnly?: boolean;
}): ProjectTemplate[] {
  let templates = [...PROJECT_TEMPLATES];

  if (options.category && options.category !== 'all') {
    templates = templates.filter(t => t.category === options.category);
  }

  if (options.difficulty) {
    templates = templates.filter(t => t.difficulty === options.difficulty);
  }

  if (options.technologies && options.technologies.length > 0) {
    templates = templates.filter(t =>
      options.technologies!.some(tech =>
        t.technologies.map(tt => tt.toLowerCase()).includes(tech.toLowerCase())
      )
    );
  }

  if (options.query) {
    const lowerQuery = options.query.toLowerCase();
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.technologies.some(tech => tech.toLowerCase().includes(lowerQuery))
    );
  }

  if (options.popularOnly) {
    templates = templates.filter(t => t.isPopular);
  }

  return templates;
}

/**
 * Get all unique technologies across templates
 */
export function getAllTechnologies(): string[] {
  const techs = new Set<string>();
  PROJECT_TEMPLATES.forEach(t => {
    t.technologies.forEach(tech => techs.add(tech));
  });
  return Array.from(techs).sort();
}

/**
 * Get difficulty color class
 */
export function getDifficultyColor(difficulty: TemplateDifficulty): string {
  switch (difficulty) {
    case 'beginner':
      return 'text-green-400 bg-green-400/10';
    case 'intermediate':
      return 'text-yellow-400 bg-yellow-400/10';
    case 'advanced':
      return 'text-red-400 bg-red-400/10';
  }
}

/**
 * Get category info
 */
export function getCategoryInfo(categoryId: TemplateCategory): TemplateCategory_ | undefined {
  return TEMPLATE_CATEGORIES.find(c => c.id === categoryId);
}

// ==================== INITIALIZATION ====================

/**
 * Initialize a project from a template
 * Either uses starterPath (preferred) or inline starterFiles
 */
export async function initializeFromTemplate(
  projectId: string,
  template: ProjectTemplate
): Promise<TemplateInitResult> {
  // If template has a starterPath, the container will use that
  // The starter files are loaded by the docker-backend
  if (template.starterPath) {
    return {
      success: true,
      filesCreated: 0,
      starterPath: template.starterPath,
    };
  }

  // For templates with inline starterFiles, write them directly
  if (template.starterFiles && template.starterFiles.length > 0) {
    const filesToWrite = template.starterFiles.map(f => ({
      path: f.path,
      content: f.content,
    }));

    const result = await dockerWriteFiles(projectId, filesToWrite, {
      continueOnError: true,
    });

    return {
      success: result.success,
      filesCreated: result.completed,
      errors: result.failed.length > 0 ? result.failed : undefined,
    };
  }

  // Blank template - nothing to initialize
  return {
    success: true,
    filesCreated: 0,
  };
}

/**
 * Get template metadata for project creation
 */
export function getTemplateMetadata(template: ProjectTemplate): {
  framework?: string;
  language?: string;
  templateId: string;
  starterPath?: string;
} {
  const framework = template.technologies[0] || undefined;
  const language = template.technologies.includes('TypeScript')
    ? 'TypeScript'
    : template.technologies.includes('JavaScript')
      ? 'JavaScript'
      : undefined;

  return {
    framework,
    language,
    templateId: template.id,
    starterPath: template.starterPath,
  };
}

/**
 * Validate a template configuration
 */
export function validateTemplate(template: Partial<ProjectTemplate>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!template.id) {
    errors.push('Template ID is required');
  }

  if (!template.name) {
    errors.push('Template name is required');
  }

  if (!template.description) {
    errors.push('Template description is required');
  }

  if (!template.category) {
    errors.push('Template category is required');
  }

  if (!template.icon) {
    errors.push('Template icon is required');
  }

  if (!template.difficulty) {
    errors.push('Template difficulty is required');
  }

  // Either starterPath or starterFiles should be provided (or neither for blank)
  if (template.starterPath && template.starterFiles && template.starterFiles.length > 0) {
    errors.push('Template should have either starterPath or starterFiles, not both');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
