/**
 * Framework-specific AI skills loaded on demand.
 * Only sends relevant framework instructions to the LLM based on project detection.
 * Saves ~2000-5000 tokens per request by not sending irrelevant framework docs.
 *
 * Detection is based on actual file paths and package.json dependencies —
 * much more reliable than scanning message text for framework name mentions.
 */

export type FrameworkType =
  | 'react' | 'nextjs' | 'remix' | 'vue' | 'nuxt' | 'svelte' | 'sveltekit'
  | 'astro' | 'angular' | 'expo' | 'react-native' | 'express' | 'fastify'
  | 'django' | 'flask' | 'python'
  | 'unknown';

interface FrameworkSkill {
  type: FrameworkType;
  name: string;
  instructions: string;
  /** File patterns that indicate this framework */
  detectionPatterns: string[];
  /** Package names that indicate this framework (checked against package.json deps) */
  detectionPackages: string[];
}

const FRAMEWORK_SKILLS: FrameworkSkill[] = [
  // --- Mobile ---
  {
    type: 'expo',
    name: 'React Native / Expo',
    detectionPatterns: ['app.json', 'metro.config.js', 'babel.config.js'],
    detectionPackages: ['expo', 'react-native', 'expo-router'],
    instructions: `<framework_skills>
PROJECT: Expo / React Native

- Use React Native components (View, Text, ScrollView, Pressable, FlatList) — NOT HTML elements.
- Use Expo SDK modules (@expo/vector-icons, expo-router, expo-camera, expo-location, etc.)
- NO HTML elements (div, span, p) — use View, Text instead.
- NO CSS — use StyleSheet.create() or inline styles. NO Tailwind.
- Use Expo Router for navigation (file-based routing in app/ directory).
- Use useSafeAreaInsets() for safe area handling.
- For animations use react-native-reanimated.
- Test with Expo Go on physical device or simulator.
</framework_skills>`,
  },
  // --- React meta-frameworks (check before plain React) ---
  {
    type: 'nextjs',
    name: 'Next.js',
    detectionPatterns: ['next.config.js', 'next.config.mjs', 'next.config.ts', 'app/layout.tsx', 'pages/_app.tsx'],
    detectionPackages: ['next'],
    instructions: `<framework_skills>
PROJECT: Next.js

- Use App Router (app/) for new projects, Pages Router (pages/) for existing ones.
- Server Components by default; add 'use client' only when needed (interactivity, hooks, browser APIs).
- Use next/image for images, next/link for navigation, next/font for fonts.
- API routes in app/api/ using route.ts with GET/POST exports.
- Use server actions for form submissions and mutations where possible.
- Metadata API for SEO (generateMetadata).
- Loading states with loading.tsx, error boundaries with error.tsx.
- Use Tailwind CSS for styling. Keep data fetching in server components.
</framework_skills>`,
  },
  {
    type: 'remix',
    name: 'Remix',
    detectionPatterns: ['remix.config.js', 'remix.config.ts'],
    detectionPackages: ['@remix-run/react', '@remix-run/node'],
    instructions: `<framework_skills>
PROJECT: Remix

- Use loader/action functions for data loading and mutations.
- Use Form component for mutations (progressive enhancement).
- File-based routing in app/routes/.
- Use useLoaderData, useActionData, useFetcher hooks.
- Nested routes and layouts are first-class.
- Error boundaries with ErrorBoundary export.
</framework_skills>`,
  },
  // --- Plain React ---
  {
    type: 'react',
    name: 'React',
    detectionPatterns: ['src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'src/main.jsx'],
    detectionPackages: ['react', 'react-dom'],
    instructions: `<framework_skills>
PROJECT: React + Vite + TypeScript

- Use functional components with hooks (useState, useEffect, useCallback, useMemo).
- Use TypeScript with proper typing for props, state, and events.
- Use Tailwind CSS for styling — no CSS modules or styled-components.
- Use lucide-react for icons.
- Use HashRouter for client-side routing (not BrowserRouter — Vite dev server does not handle SPA fallback).
- Component file naming: PascalCase.tsx (e.g., UserProfile.tsx).
- Keep components small (<200 lines). Extract hooks for logic reuse.
- For forms: use controlled components with useState or react-hook-form.
- Use Zustand or React Context for state management when needed.
</framework_skills>`,
  },
  // --- Vue ecosystem ---
  {
    type: 'nuxt',
    name: 'Nuxt',
    detectionPatterns: ['nuxt.config.ts', 'nuxt.config.js'],
    detectionPackages: ['nuxt'],
    instructions: `<framework_skills>
PROJECT: Nuxt 3

- Use Composition API with <script setup> syntax.
- File-based routing in pages/ directory.
- Auto-imports for Vue APIs, composables, and components.
- Use useFetch/useAsyncData for data fetching.
- Server routes in server/api/ directory.
- Use Nuxt modules for common functionality.
</framework_skills>`,
  },
  {
    type: 'vue',
    name: 'Vue.js',
    detectionPatterns: ['src/App.vue', 'src/main.ts'],
    detectionPackages: ['vue'],
    instructions: `<framework_skills>
PROJECT: Vue 3 + Composition API

- Use <script setup> syntax for single-file components.
- Use Pinia for state management (defineStore with setup syntax).
- Use Vue Router with createRouter and createWebHashHistory.
- Reactive state with ref() and reactive(), computed(), watch().
- Use Tailwind CSS or scoped styles.
- Type props with defineProps<T>() and emits with defineEmits<T>().
</framework_skills>`,
  },
  // --- Svelte ecosystem ---
  {
    type: 'sveltekit',
    name: 'SvelteKit',
    detectionPatterns: ['svelte.config.js', 'src/routes/+page.svelte', 'src/routes/+layout.svelte'],
    detectionPackages: ['@sveltejs/kit'],
    instructions: `<framework_skills>
PROJECT: SvelteKit

- Use Svelte 5 runes ($state, $derived, $effect) for reactivity.
- File-based routing with +page.svelte, +layout.svelte, +server.ts.
- Use load functions for data fetching (+page.ts/+page.server.ts).
- Form actions for mutations (+page.server.ts actions).
- Scoped styles by default in <style> blocks.
</framework_skills>`,
  },
  {
    type: 'svelte',
    name: 'Svelte',
    detectionPatterns: ['src/App.svelte'],
    detectionPackages: ['svelte'],
    instructions: `<framework_skills>
PROJECT: Svelte

- Use Svelte 5 runes ($state, $derived, $effect) for reactivity.
- Component files use .svelte extension.
- Use $props() for component props.
- Scoped styles by default in <style> blocks.
</framework_skills>`,
  },
  // --- Other frontend ---
  {
    type: 'astro',
    name: 'Astro',
    detectionPatterns: ['astro.config.mjs', 'astro.config.ts', 'src/pages/index.astro'],
    detectionPackages: ['astro'],
    instructions: `<framework_skills>
PROJECT: Astro

- Use .astro files for pages and components (HTML-first).
- Use islands architecture for interactive components.
- Markdown/MDX for content pages.
- File-based routing in src/pages/.
- Frontmatter between --- fences for data loading.
</framework_skills>`,
  },
  {
    type: 'angular',
    name: 'Angular',
    detectionPatterns: ['angular.json', 'src/app/app.component.ts'],
    detectionPackages: ['@angular/core'],
    instructions: `<framework_skills>
PROJECT: Angular

- Use standalone components (no NgModules for new code).
- Use signals for reactive state management.
- Use Angular CLI conventions (ng generate).
- Use RxJS for async data streams.
- Template-driven or reactive forms.
- Use Angular Router for navigation.
</framework_skills>`,
  },
  // --- Backend ---
  {
    type: 'express',
    name: 'Express / Node.js',
    detectionPatterns: ['src/server.ts', 'src/app.ts'],
    detectionPackages: ['express'],
    instructions: `<framework_skills>
PROJECT: Node.js + Express

- Use ES modules (import/export) with "type": "module" in package.json.
- Use async/await for all asynchronous operations.
- Structure: src/routes/, src/middleware/, src/models/, src/utils/.
- Add proper error handling middleware.
- Use express.json() middleware for parsing request bodies.
- Use environment variables via dotenv for configuration.
- Validate request input with zod or express-validator.
</framework_skills>`,
  },
  {
    type: 'fastify',
    name: 'Fastify',
    detectionPatterns: [],
    detectionPackages: ['fastify'],
    instructions: `<framework_skills>
PROJECT: Fastify

- Use the plugin system for modular architecture.
- Use JSON Schema for request/response validation.
- Use async/await route handlers.
- Register plugins with fastify.register().
- Use @fastify/cors, @fastify/helmet for security.
</framework_skills>`,
  },
  // --- Python ---
  {
    type: 'django',
    name: 'Django',
    detectionPatterns: ['manage.py', 'settings.py', 'urls.py'],
    detectionPackages: [],
    instructions: `<framework_skills>
PROJECT: Python Django

- Use virtual environment and requirements.txt or pyproject.toml.
- Follow Django's project/app structure: manage.py, settings.py, urls.py, views.py, models.py.
- Use Django ORM for database models, Django REST Framework for APIs.
- Use class-based views for CRUD, function-based views for simple endpoints.
- Run migrations with python manage.py makemigrations && python manage.py migrate.
</framework_skills>`,
  },
  {
    type: 'flask',
    name: 'Flask',
    detectionPatterns: [],
    detectionPackages: [],
    instructions: `<framework_skills>
PROJECT: Python Flask

- Use virtual environment and requirements.txt or pyproject.toml.
- Structure: app.py or app/__init__.py, routes/, models/, templates/, static/.
- Use Flask Blueprints for modular route organization.
- Use Flask-SQLAlchemy for database ORM, Flask-Migrate for migrations.
- Enable CORS with flask-cors when building APIs.
</framework_skills>`,
  },
];

/**
 * Detect framework from file list and package.json dependencies.
 *
 * Priority order:
 *   1. Package names in dependencies/devDependencies (most reliable)
 *   2. File path patterns (fallback when no package.json is available)
 *
 * The FRAMEWORK_SKILLS array is ordered so that more specific frameworks
 * (e.g., Next.js, Expo) are checked before generic ones (e.g., React).
 */
export function detectFramework(
  files: string[],
  packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
): FrameworkType {
  const allDeps: Record<string, string> = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const hasDeps = Object.keys(allDeps).length > 0;

  // Check each framework in order (most specific first due to array ordering)
  for (const skill of FRAMEWORK_SKILLS) {
    // Check package names first (more reliable)
    if (hasDeps && skill.detectionPackages.length > 0) {
      for (const pkg of skill.detectionPackages) {
        if (allDeps[pkg]) return skill.type;
      }
    }

    // Check file patterns
    for (const pattern of skill.detectionPatterns) {
      if (files.some(f => f === pattern || f.endsWith(`/${pattern}`))) {
        return skill.type;
      }
    }
  }

  return 'unknown';
}

/**
 * Get framework-specific instructions for the detected project type.
 * Returns empty string for unknown frameworks (uses default instructions).
 */
export function getFrameworkSkills(frameworkType: FrameworkType): string {
  const skill = FRAMEWORK_SKILLS.find(s => s.type === frameworkType);
  return skill?.instructions ?? '';
}

/**
 * Get framework display name
 */
export function getFrameworkName(frameworkType: FrameworkType): string {
  const skill = FRAMEWORK_SKILLS.find(s => s.type === frameworkType);
  return skill?.name ?? 'Unknown';
}

/**
 * Detect framework and return skills in one call (convenience).
 */
export function getProjectSkills(
  files: string[],
  packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
): { framework: FrameworkType; skills: string } {
  const framework = detectFramework(files, packageJson);
  const skills = getFrameworkSkills(framework);
  return { framework, skills };
}

/**
 * Try to extract a parsed package.json from a code-context string.
 * The codeContext block may contain the raw JSON of package.json among other files.
 * Returns undefined if extraction fails.
 */
export function tryExtractPackageJson(
  codeContext: string,
): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined {
  if (!codeContext) return undefined;

  try {
    // Pattern 1: look for a <file path="package.json"> block
    const fileBlockMatch = codeContext.match(
      /<file[^>]*path="[^"]*package\.json"[^>]*>([\s\S]*?)<\/file>/,
    );
    if (fileBlockMatch?.[1]) {
      return JSON.parse(fileBlockMatch[1].trim());
    }

    // Pattern 2: look for raw JSON that looks like package.json
    const jsonMatch = codeContext.match(
      /\{[\s\S]*?"(?:dependencies|devDependencies)"[\s\S]*?\}/,
    );
    if (jsonMatch?.[0]) {
      // Attempt to parse — this may fail on partial matches
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.dependencies || parsed.devDependencies) {
        return parsed;
      }
    }
  } catch {
    // Parsing failed — return undefined
  }

  return undefined;
}
