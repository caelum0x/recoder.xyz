import { readdir, readFile } from 'fs/promises';
import { join } from 'node:path';
import type { TemplateRepo } from '../github/types';

export interface StarterTemplate extends Omit<TemplateRepo, 'repo'> {
  path: string;
  files: Record<string, string>;
}

const STARTERS_PATH = join(process.cwd(), 'starters');

// Define categories based on common frameworks and types
const CATEGORY_MAPPING: Record<string, string> = {
  'nextjs': 'nextjs',
  'nextjs-shadcn': 'nextjs',
  'react': 'react',
  'react-ts': 'react',
  'recoder-vite-react-ts': 'react',
  'vite-shadcn': 'react',
  'vue': 'vue',
  'angular': 'angular',
  'svelte': 'svelte',
  'sveltekit': 'svelte',
  'astro-shadcn': 'astro',
  'recoder-qwik': 'qwik',
  'express-simple': 'node',
  'node': 'node',
  'koa': 'node',
  'hono-nodejs-starter': 'node',
  'egg': 'node',
  'json-server': 'node',
  'json-graphql-server': 'node',
  'graphql': 'node',
  'typescript': 'vanilla',
  'js': 'vanilla',
  'static': 'vanilla',
  'web-platform': 'vanilla',
  'bootstrap-5': 'vanilla',
  'recoder-expo': 'mobile',
  'recoder-remotion': 'video',
  'slidev': 'presentation',
  'tutorialkit': 'education',
  'test': 'testing',
  'quasar': 'vue',
  'tres': 'vue',
  'gsap-react': 'react',
  'gsap-vue': 'vue',
  'gsap-svelte': 'svelte',
  'gsap-next': 'nextjs',
  'gsap-nuxt': 'vue',
  'gsap-sveltekit': 'svelte',
  'rxjs': 'vanilla',
  'nodemon': 'node'
};

const FEATURED_STARTERS = [
  'nextjs',
  'nextjs-shadcn',
  'recoder-vite-react-ts',
  'vite-shadcn',
  'express-simple',
  'vue',
  'sveltekit',
  'angular',
  'astro-shadcn'
];

export async function scanStarters(): Promise<StarterTemplate[]> {
  const templates: StarterTemplate[] = [];

  try {
    const entries = await readdir(STARTERS_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const starterPath = join(STARTERS_PATH, entry.name);

      try {
        const template = await createTemplateFromStarter(entry.name, starterPath);
        if (template) {
          templates.push(template);
        }
      } catch (error) {
        console.warn(`Failed to process starter ${entry.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to scan starters directory:', error);
  }

  return templates.sort((a, b) => {
    // Featured templates first
    const aFeatured = a.featured ? 1 : 0;
    const bFeatured = b.featured ? 1 : 0;
    if (aFeatured !== bFeatured) return bFeatured - aFeatured;

    // Then alphabetical
    return a.name.localeCompare(b.name);
  });
}

async function createTemplateFromStarter(name: string, starterPath: string): Promise<StarterTemplate | null> {
  try {
    // Read package.json for metadata
    const packageJsonPath = join(starterPath, 'package.json');
    let packageInfo: any = {};

    try {
      const packageContent = await readFile(packageJsonPath, 'utf-8');
      packageInfo = JSON.parse(packageContent);
    } catch {
      // package.json might not exist for some starters
    }

    // Read all files
    const files = await readAllFiles(starterPath);

    // Skip if no files found or too few files
    if (Object.keys(files).length === 0) {
      return null;
    }

    // Generate description based on dependencies and starter name
    const description = generateDescription(name, packageInfo);

    // Detect category
    const category = CATEGORY_MAPPING[name] || detectCategoryFromPackage(packageInfo) || 'other';

    // Generate tags
    const tags = generateTags(name, packageInfo, category);

    return {
      id: `starter-${name}`,
      name: formatName(name),
      description,
      path: starterPath,
      category: category as any,
      tags,
      featured: FEATURED_STARTERS.includes(name),
      files
    };
  } catch (error) {
    console.error(`Error creating template for ${name}:`, error);
    return null;
  }
}

async function readAllFiles(dirPath: string, relativePath = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativeFilePath = relativePath ? join(relativePath, entry.name) : entry.name;

      // Skip common directories and files we don't need
      if (shouldSkipPath(relativeFilePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively read subdirectories
        const subFiles = await readAllFiles(fullPath, relativeFilePath);
        Object.assign(files, subFiles);
      } else {
        // Read file content
        try {
          const content = await readFile(fullPath, 'utf-8');
          files[relativeFilePath] = content;
        } catch (error) {
          // Skip files that can't be read as text
          console.warn(`Skipping file ${relativeFilePath}: ${error}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
}

function shouldSkipPath(path: string): boolean {
  const skipPatterns = [
    /^node_modules/,
    /^\.git/,
    /^\.next/,
    /^dist/,
    /^build/,
    /^\.turbo/,
    /^\.cache/,
    /^coverage/,
    /\.log$/,
    /\.lock$/,
    /^\.DS_Store$/,
    /^\.env/,
    /\.webp$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.svg$/,
    /\.ico$/,
    /\.woff$/,
    /\.woff2$/,
    /\.ttf$/,
    /\.eot$/
  ];

  return skipPatterns.some(pattern => pattern.test(path));
}

function generateDescription(name: string, packageInfo: any): string {
  const baseName = name.replace(/^(bolt-|gsap-)/, '');

  // Custom descriptions for specific starters
  const customDescriptions: Record<string, string> = {
    'nextjs': 'Next.js application with TypeScript and Tailwind CSS',
    'nextjs-shadcn': 'Next.js with shadcn/ui components and modern UI patterns',
    'recoder-vite-react-ts': 'React application with Vite, TypeScript and modern tooling',
    'vite-shadcn': 'React with Vite and shadcn/ui component library',
    'express-simple': 'Simple Express.js server with basic routing',
    'react': 'React application with Create React App',
    'react-ts': 'React application with TypeScript support',
    'vue': 'Vue.js application with modern setup',
    'sveltekit': 'SvelteKit full-stack application framework',
    'angular': 'Angular application with TypeScript',
    'astro-shadcn': 'Astro static site with shadcn/ui components'
  };

  if (customDescriptions[name]) {
    return customDescriptions[name];
  }

  // Generate from package.json description
  if (packageInfo.description) {
    return packageInfo.description;
  }

  // Generate generic description
  const frameworks = detectFrameworks(packageInfo);
  if (frameworks.length > 0) {
    return `${frameworks.join(' + ')} application starter template`;
  }

  return `${baseName.charAt(0).toUpperCase() + baseName.slice(1)} starter template`;
}

function detectCategoryFromPackage(packageInfo: any): string | null {
  const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };

  if (deps['next']) return 'nextjs';
  if (deps['react']) return 'react';
  if (deps['vue']) return 'vue';
  if (deps['@angular/core']) return 'angular';
  if (deps['svelte']) return 'svelte';
  if (deps['astro']) return 'astro';
  if (deps['express']) return 'node';

  return null;
}

function detectFrameworks(packageInfo: any): string[] {
  const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };
  const frameworks: string[] = [];

  if (deps['next']) frameworks.push('Next.js');
  else if (deps['react']) frameworks.push('React');
  if (deps['vue']) frameworks.push('Vue');
  if (deps['@angular/core']) frameworks.push('Angular');
  if (deps['svelte']) frameworks.push('Svelte');
  if (deps['astro']) frameworks.push('Astro');
  if (deps['typescript']) frameworks.push('TypeScript');
  if (deps['tailwindcss']) frameworks.push('Tailwind CSS');
  if (deps['express']) frameworks.push('Express');

  return frameworks;
}

function generateTags(name: string, packageInfo: any, category: string): string[] {
  const tags = new Set<string>();

  // Add category as tag
  tags.add(category);

  // Add framework tags
  const frameworks = detectFrameworks(packageInfo);
  frameworks.forEach(fw => tags.add(fw.toLowerCase().replace(/\s+/g, '-')));

  // Add specific tags based on name
  if (name.includes('shadcn')) tags.add('shadcn');
  if (name.includes('gsap')) tags.add('gsap');
  if (name.includes('bolt')) tags.add('bolt');
  if (name.includes('ts') || packageInfo.devDependencies?.typescript) tags.add('typescript');

  // Add tags based on dependencies
  const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };
  if (deps['vite']) tags.add('vite');
  if (deps['webpack']) tags.add('webpack');
  if (deps['eslint']) tags.add('eslint');
  if (deps['prettier']) tags.add('prettier');

  return Array.from(tags);
}

function formatName(name: string): string {
  return name
    .replace(/^bolt-/, '')
    .replace(/^gsap-/, 'GSAP ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}