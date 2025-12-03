/**
 * Starter Templates Integration
 * Maps user requests to existing /starters directory
 * Achieves 80-95% cost reduction by using pre-built templates
 */

// Conditionally import fs only in Node.js environment
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Simple path joining utility for cross-platform compatibility
function joinPath(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\\/g, '/');
}

export interface StarterTemplate {
  id: string;
  name: string;
  path: string;
  description: string;
  keywords: string[];
  framework: string;
  category: string;
  files: string[];
  packageJson?: any;
}

/**
 * Load all starter templates from /starters directory
 */
// Cache loaded templates to avoid re-scanning directory
let cachedTemplates: StarterTemplate[] | null = null;
let loadAttempted = false;

// Get dynamic starters path relative to project root
function getStartersPath(): string {
  // Try to use process.cwd() to get project root
  if (typeof process !== 'undefined' && process.cwd) {
    return `${process.cwd()}/starters`;
  }
  // Fallback for different environments
  return '/Users/arhansubasi/bolt.new/starters';
}

export function loadStarterTemplates(startersPath: string = getStartersPath()): StarterTemplate[] {
  // If we already tried and failed, return empty silently
  if (loadAttempted && cachedTemplates === null) {
    return [];
  }

  // If not in Node.js environment, return empty array (will use API fallback)
  if (!isNode) {
    loadAttempted = true;
    return [];
  }

  // Return cached templates if available
  if (cachedTemplates) {
    return cachedTemplates;
  }

  loadAttempted = true;
  const templates: StarterTemplate[] = [];

  try {
    // Try to import fs - this will only work in actual Node.js environment
    // During Vite bundling or client-side execution, this will fail gracefully
    let fs;
    try {
      // Use eval to prevent bundlers from trying to polyfill or bundle fs
      fs = eval('require')('node:fs');
    } catch {
      // fs not available - likely in browser or bundled context
      console.log('→ Using static template definitions (file system unavailable)');
      return [];
    }

    const { readFileSync, readdirSync, statSync } = fs;

    const dirs = readdirSync(startersPath).filter((name: string) => {
      const fullPath = joinPath(startersPath, name);
      return statSync(fullPath).isDirectory() && !name.startsWith('.');
    });

    for (const dir of dirs) {
      const templatePath = joinPath(startersPath, dir);

      // Load package.json if exists
      let packageJson;
      try {
        const pkgPath = joinPath(templatePath, 'package.json');
        packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      } catch {
        packageJson = null;
      }

      // Detect framework and keywords
      const { framework, keywords, description } = detectFrameworkAndKeywords(dir, packageJson);

      // Get all files in template
      const files = getAllFiles(templatePath);

      templates.push({
        id: dir,
        name: formatTemplateName(dir),
        path: templatePath,
        description,
        keywords,
        framework,
        category: detectCategory(dir, packageJson),
        files,
        packageJson
      });
    }

    console.log(`✅ Loaded ${templates.length} starter templates`);

    // Cache the results
    cachedTemplates = templates;

    return templates;
  } catch (error) {
    console.error('Failed to load starter templates:', error);
    return [];
  }
}

/**
 * Detect framework and keywords from template
 */
function detectFrameworkAndKeywords(dirName: string, packageJson: any): {
  framework: string;
  keywords: string[];
  description: string;
} {
  const name = dirName.toLowerCase();
  let framework = 'unknown';
  let keywords: string[] = [dirName];
  let description = '';

  // Next.js templates
  if (name.includes('next')) {
    framework = 'nextjs';
    keywords.push('next.js', 'next', 'react', 'ssr');
    description = 'Next.js application';

    if (name.includes('shadcn')) {
      keywords.push('shadcn', 'ui', 'components', 'tailwind');
      description = 'Next.js with shadcn/ui components';
    }
  }
  // React templates
  else if (name.includes('react') || name.includes('vite')) {
    framework = 'react';
    keywords.push('react', 'vite', 'spa');
    description = 'React application';

    if (name.includes('vite')) {
      keywords.push('vite', 'fast', 'hmr');
      description = 'Vite + React application';
    }
    if (name.includes('shadcn')) {
      keywords.push('shadcn', 'ui', 'tailwind');
      description = 'React with shadcn/ui components';
    }
  }
  // Vue templates
  else if (name.includes('vue')) {
    framework = 'vue';
    keywords.push('vue', 'vue.js', 'composition');
    description = 'Vue.js application';
  }
  // Svelte templates
  else if (name.includes('svelte')) {
    framework = 'svelte';
    keywords.push('svelte', 'sveltekit');
    description = 'SvelteKit application';
  }
  // Angular templates
  else if (name.includes('angular')) {
    framework = 'angular';
    keywords.push('angular', 'typescript', 'rxjs');
    description = 'Angular application';
  }
  // Astro templates
  else if (name.includes('astro')) {
    framework = 'astro';
    keywords.push('astro', 'static', 'islands');
    description = 'Astro static site';
  }
  // Node.js templates
  else if (name.includes('express') || name.includes('node') || name.includes('hono') || name.includes('koa')) {
    framework = 'node';
    keywords.push('node', 'backend', 'api', 'server');

    if (name.includes('express')) {
      keywords.push('express', 'rest');
      description = 'Express.js API server';
    } else if (name.includes('hono')) {
      keywords.push('hono', 'fast', 'edge');
      description = 'Hono.js fast backend';
    }
  }
  // GSAP animation templates
  else if (name.includes('gsap')) {
    keywords.push('gsap', 'animation', 'motion');
    description = 'GSAP animation project';

    if (name.includes('next')) framework = 'nextjs';
    else if (name.includes('react')) framework = 'react';
    else if (name.includes('vue')) framework = 'vue';
    else if (name.includes('svelte')) framework = 'svelte';
  }
  // Three.js templates
  else if (name.includes('tres') || name.includes('three')) {
    keywords.push('three.js', '3d', 'webgl', 'graphics');
    framework = 'vue'; // tres is Vue-based
    description = 'Three.js 3D graphics';
  }
  // React Native
  else if (name.includes('expo')) {
    framework = 'react-native';
    keywords.push('react-native', 'expo', 'mobile', 'ios', 'android');
    description = 'React Native mobile app';
  }
  // Static/Vanilla
  else if (name.includes('static') || name.includes('html')) {
    framework = 'vanilla';
    keywords.push('html', 'css', 'javascript', 'static');
    description = 'Static HTML/CSS/JS website';
  }
  // Bootstrap
  else if (name.includes('bootstrap')) {
    framework = 'vanilla';
    keywords.push('bootstrap', 'css', 'responsive');
    description = 'Bootstrap 5 website';
  }
  // Quasar
  else if (name.includes('quasar')) {
    framework = 'vue';
    keywords.push('quasar', 'material', 'ui');
    description = 'Quasar Vue framework';
  }

  // Add package.json dependencies as keywords
  if (packageJson?.dependencies) {
    Object.keys(packageJson.dependencies).forEach(dep => {
      keywords.push(dep);
    });
  }

  return { framework, keywords: [...new Set(keywords)], description };
}

/**
 * Detect template category
 */
function detectCategory(dirName: string, packageJson: any): string {
  const name = dirName.toLowerCase();

  if (name.includes('api') || name.includes('server') || name.includes('express') ||
      name.includes('hono') || name.includes('koa') || name.includes('graphql')) {
    return 'backend';
  }

  if (name.includes('next') || name.includes('remix') || name.includes('sveltekit')) {
    return 'fullstack';
  }

  if (name.includes('gsap') || name.includes('three') || name.includes('tres')) {
    return 'animation';
  }

  if (name.includes('mobile') || name.includes('expo')) {
    return 'mobile';
  }

  if (name.includes('slidev')) {
    return 'presentation';
  }

  return 'frontend';
}

/**
 * Format template name for display
 */
function formatTemplateName(dirName: string): string {
  return dirName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dirPath: string, relativePath: string = ''): string[] {
  const files: string[] = [];

  if (!isNode) {
    return files;
  }

  try {
    // Try to import fs - use eval to prevent bundlers from trying to polyfill
    let fs;
    try {
      fs = eval('require')('node:fs');
    } catch {
      return files;
    }
    const { readdirSync, statSync } = fs;

    const items = readdirSync(dirPath);

    for (const item of items) {
      // Skip node_modules, .git, and other common excludes
      if (item === 'node_modules' || item === '.git' || item === 'dist' ||
          item === '.next' || item.startsWith('.')) {
        continue;
      }

      const fullPath = joinPath(dirPath, item);
      const relPath = relativePath ? joinPath(relativePath, item) : item;

      if (statSync(fullPath).isDirectory()) {
        files.push(...getAllFiles(fullPath, relPath));
      } else {
        files.push(relPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
}

/**
 * Match user request to best template
 */
export function matchUserRequestToTemplate(
  userMessage: string,
  templates: StarterTemplate[]
): { template: StarterTemplate; confidence: number; reasoning: string } | null {
  const message = userMessage.toLowerCase();
  let bestMatch: { template: StarterTemplate; confidence: number; reasoning: string } | null = null;
  let highestScore = 0;

  for (const template of templates) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Keyword matching
    for (const keyword of template.keywords) {
      if (message.includes(keyword.toLowerCase())) {
        score += 10;
        matchedKeywords.push(keyword);

        // Bonus for exact word match
        const words = message.split(/\s+/);
        if (words.includes(keyword.toLowerCase())) {
          score += 5;
        }
      }
    }

    // Framework-specific patterns
    if (message.includes(template.framework)) {
      score += 20;
    }

    // Common project patterns
    const patterns: Record<string, RegExp[]> = {
      'nextjs-shadcn': [/dashboard/, /admin/, /saas/, /crud/, /full.*stack/],
      'recoder-vite-react-ts': [/simple.*react/, /quick.*react/, /basic.*spa/],
      'express-simple': [/rest.*api/, /backend/, /api.*server/],
      'static': [/landing.*page/, /portfolio/, /simple.*site/],
      'bolt-expo': [/mobile/, /ios.*android/, /react.*native/],
      'gsap': [/animation/, /animated/, /motion/],
      'sveltekit': [/svelte/, /full.*stack.*svelte/]
    };

    if (patterns[template.id]) {
      for (const pattern of patterns[template.id]) {
        if (pattern.test(message)) {
          score += 25;
        }
      }
    }

    // shadcn/ui specific
    if (template.id.includes('shadcn') &&
        (message.includes('component') || message.includes('ui') || message.includes('design system'))) {
      score += 15;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = {
        template,
        confidence: Math.min(100, score),
        reasoning: `Matched ${template.name} (${matchedKeywords.length} keywords: ${matchedKeywords.slice(0, 3).join(', ')})`
      };
    }
  }

  // Only return if confidence is reasonable
  return (bestMatch && bestMatch.confidence >= 25) ? bestMatch : null;
}

/**
 * Generate customization prompt for template
 */
export function generateTemplateCustomizationPrompt(
  template: StarterTemplate,
  userRequest: string
): string {
  return `You are customizing the ${template.name} starter template.

TEMPLATE INFO:
- Framework: ${template.framework}
- Category: ${template.category}
- Base path: ${template.path}
- Files: ${template.files.length} files included

BASE TEMPLATE INCLUDES:
${template.packageJson ? `- Dependencies: ${Object.keys(template.packageJson.dependencies || {}).slice(0, 10).join(', ')}` : ''}
- Structure: ${template.files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')).length} component files
- Styling: ${template.files.some(f => f.includes('tailwind') || f.includes('style')) ? 'Tailwind CSS' : 'Standard CSS'}

USER REQUEST: ${userRequest}

INSTRUCTIONS:
1. Use the existing template structure as the foundation
2. Only modify/add files necessary for the user's specific request
3. Maintain the template's architecture and patterns
4. Keep all existing dependencies unless replacement is needed

ARTIFACT FORMAT (CRITICAL):
You MUST use the following format to create/modify files:

<recoderArtifact id="customization" title="Template Customization">
  <recoderAction type="file" filePath="relative/path/to/file.ext">
    // file content here
  </recoderAction>

  <recoderAction type="shell">
    npm install && npm run dev
  </recoderAction>
</recoderArtifact>

IMPORTANT:
- Every file action MUST have a filePath attribute: filePath="path/to/file.ext"
- All paths must be relative to project root
- Include FULL file content, never use placeholders

COST OPTIMIZATION:
- Template provides 80% of the code for FREE
- Only generate the 20% that's unique to this request
- Reference existing template files instead of recreating them

Generate ONLY the necessary customizations using the artifact format above.`;
}
