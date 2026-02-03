/**
 * Build Presets
 *
 * Pre-configured build configurations for common frameworks and use cases.
 */

import type { BuildConfig } from './build-service';
import type { ViteConfig, VitePluginConfig } from './vite-config';

// ============================================
// Types
// ============================================

export type PresetName =
  | 'react-vite'
  | 'react-vite-ts'
  | 'vue-vite'
  | 'vue-vite-ts'
  | 'svelte-vite'
  | 'solid-vite'
  | 'vanilla-vite'
  | 'react-spa'
  | 'react-shadcn'
  | 'next-static'
  | 'cloudflare-worker'
  | 'cloudflare-pages'
  | 'library-esm'
  | 'library-cjs';

export interface BuildPreset {
  /** Preset name */
  name: PresetName;
  /** Display name */
  displayName: string;
  /** Description */
  description: string;
  /** Framework */
  framework: 'react' | 'vue' | 'svelte' | 'solid' | 'vanilla';
  /** Build configuration */
  buildConfig: Partial<BuildConfig>;
  /** Vite configuration overrides */
  viteConfig: Partial<ViteConfig>;
  /** Required dependencies */
  dependencies: string[];
  /** Development dependencies */
  devDependencies: string[];
  /** File templates */
  templates?: Record<string, string>;
  /** Post-build commands */
  postBuild?: string[];
}

// ============================================
// Build Presets
// ============================================

export const BUILD_PRESETS: Record<PresetName, BuildPreset> = {
  'react-vite': {
    name: 'react-vite',
    displayName: 'React + Vite',
    description: 'Standard React application with Vite bundler',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'dist',
      mode: 'production',
      minify: true,
      sourcemap: false,
    },
    viteConfig: {
      plugins: [
        { name: 'react', package: '@vitejs/plugin-react-swc' },
      ],
      build: {
        target: 'es2020',
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
            },
          },
        },
      },
    },
    dependencies: ['react', 'react-dom'],
    devDependencies: ['@vitejs/plugin-react-swc', 'vite', 'typescript', '@types/react', '@types/react-dom'],
  },

  'react-vite-ts': {
    name: 'react-vite-ts',
    displayName: 'React + Vite + TypeScript',
    description: 'TypeScript React application with Vite bundler',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'dist',
      mode: 'production',
      minify: true,
      sourcemap: false,
    },
    viteConfig: {
      plugins: [
        { name: 'react', package: '@vitejs/plugin-react-swc' },
      ],
      build: {
        target: 'es2020',
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
            },
          },
        },
      },
      esbuild: {
        target: 'es2020',
      },
    },
    dependencies: ['react', 'react-dom'],
    devDependencies: [
      '@vitejs/plugin-react-swc',
      'vite',
      'typescript',
      '@types/react',
      '@types/react-dom',
    ],
  },

  'react-shadcn': {
    name: 'react-shadcn',
    displayName: 'React + shadcn/ui',
    description: 'React with shadcn/ui components and Tailwind CSS v4',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'react', package: '@vitejs/plugin-react-swc' },
        { name: 'tailwindcss', package: '@tailwindcss/vite' },
      ],
      resolve: {
        alias: {
          '@': './src',
        },
      },
      build: {
        target: 'es2020',
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              ui: ['@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
            },
          },
        },
      },
    },
    dependencies: [
      'react',
      'react-dom',
      'react-router-dom',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'lucide-react',
    ],
    devDependencies: [
      '@vitejs/plugin-react-swc',
      '@tailwindcss/vite',
      'vite',
      'typescript',
      '@types/react',
      '@types/react-dom',
      'tailwindcss',
    ],
  },

  'react-spa': {
    name: 'react-spa',
    displayName: 'React SPA',
    description: 'Single Page Application with React Router',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'react', package: '@vitejs/plugin-react-swc' },
      ],
      build: {
        target: 'es2020',
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom', 'react-router-dom'],
            },
          },
        },
      },
    },
    dependencies: ['react', 'react-dom', 'react-router-dom'],
    devDependencies: ['@vitejs/plugin-react-swc', 'vite', 'typescript'],
  },

  'vue-vite': {
    name: 'vue-vite',
    displayName: 'Vue + Vite',
    description: 'Vue 3 application with Vite bundler',
    framework: 'vue',
    buildConfig: {
      framework: 'vue',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'vue', package: '@vitejs/plugin-vue' },
      ],
      build: {
        target: 'es2020',
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['vue'],
            },
          },
        },
      },
    },
    dependencies: ['vue'],
    devDependencies: ['@vitejs/plugin-vue', 'vite', 'typescript', 'vue-tsc'],
  },

  'vue-vite-ts': {
    name: 'vue-vite-ts',
    displayName: 'Vue + Vite + TypeScript',
    description: 'TypeScript Vue 3 application with Vite bundler',
    framework: 'vue',
    buildConfig: {
      framework: 'vue',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'vue', package: '@vitejs/plugin-vue' },
      ],
      build: {
        target: 'es2020',
      },
    },
    dependencies: ['vue'],
    devDependencies: ['@vitejs/plugin-vue', 'vite', 'typescript', 'vue-tsc'],
  },

  'svelte-vite': {
    name: 'svelte-vite',
    displayName: 'Svelte + Vite',
    description: 'Svelte application with Vite bundler',
    framework: 'svelte',
    buildConfig: {
      framework: 'svelte',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'svelte', package: '@sveltejs/vite-plugin-svelte' },
      ],
      build: {
        target: 'es2020',
      },
    },
    dependencies: ['svelte'],
    devDependencies: ['@sveltejs/vite-plugin-svelte', 'vite', 'svelte-check', 'typescript'],
  },

  'solid-vite': {
    name: 'solid-vite',
    displayName: 'Solid + Vite',
    description: 'SolidJS application with Vite bundler',
    framework: 'solid',
    buildConfig: {
      framework: 'solid',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'solid', package: 'vite-plugin-solid' },
      ],
      build: {
        target: 'es2020',
      },
    },
    dependencies: ['solid-js'],
    devDependencies: ['vite-plugin-solid', 'vite', 'typescript'],
  },

  'vanilla-vite': {
    name: 'vanilla-vite',
    displayName: 'Vanilla JavaScript + Vite',
    description: 'Plain JavaScript or TypeScript with Vite bundler',
    framework: 'vanilla',
    buildConfig: {
      framework: 'vanilla',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      build: {
        target: 'es2020',
      },
    },
    dependencies: [],
    devDependencies: ['vite', 'typescript'],
  },

  'next-static': {
    name: 'next-static',
    displayName: 'Next.js Static Export',
    description: 'Next.js with static export for deployment',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'out',
      mode: 'production',
      minify: true,
    },
    viteConfig: {},
    dependencies: ['react', 'react-dom', 'next'],
    devDependencies: ['typescript', '@types/react', '@types/react-dom'],
    postBuild: ['next build'],
    templates: {
      'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
`,
    },
  },

  'cloudflare-worker': {
    name: 'cloudflare-worker',
    displayName: 'Cloudflare Worker',
    description: 'Cloudflare Worker with Hono framework',
    framework: 'vanilla',
    buildConfig: {
      framework: 'vanilla',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      build: {
        target: 'es2022',
        lib: {
          entry: 'src/worker.ts',
          formats: ['es'],
          fileName: 'worker',
        },
        rollupOptions: {
          external: ['__STATIC_CONTENT_MANIFEST'],
        },
      },
    },
    dependencies: ['hono'],
    devDependencies: ['wrangler', '@cloudflare/workers-types', 'typescript'],
    templates: {
      'src/worker.ts': `import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
`,
      'wrangler.jsonc': `{
  "name": "my-worker",
  "main": "dist/worker.js",
  "compatibility_date": "2024-01-01",
  "assets": {
    "directory": "dist",
    "binding": "ASSETS"
  }
}
`,
    },
  },

  'cloudflare-pages': {
    name: 'cloudflare-pages',
    displayName: 'Cloudflare Pages',
    description: 'Static site for Cloudflare Pages with optional Functions',
    framework: 'react',
    buildConfig: {
      framework: 'react',
      outDir: 'dist',
      mode: 'production',
      minify: true,
    },
    viteConfig: {
      plugins: [
        { name: 'react', package: '@vitejs/plugin-react-swc' },
      ],
      build: {
        target: 'es2020',
      },
    },
    dependencies: ['react', 'react-dom'],
    devDependencies: ['@vitejs/plugin-react-swc', 'vite', 'typescript', 'wrangler'],
  },

  'library-esm': {
    name: 'library-esm',
    displayName: 'ES Module Library',
    description: 'JavaScript/TypeScript library with ESM output',
    framework: 'vanilla',
    buildConfig: {
      framework: 'vanilla',
      outDir: 'dist',
      mode: 'production',
      minify: false,
      sourcemap: true,
    },
    viteConfig: {
      build: {
        target: 'es2020',
        lib: {
          entry: 'src/index.ts',
          formats: ['es'],
          fileName: 'index',
        },
        rollupOptions: {
          external: [],
        },
      },
    },
    dependencies: [],
    devDependencies: ['vite', 'typescript'],
  },

  'library-cjs': {
    name: 'library-cjs',
    displayName: 'CommonJS Library',
    description: 'JavaScript/TypeScript library with CommonJS output',
    framework: 'vanilla',
    buildConfig: {
      framework: 'vanilla',
      outDir: 'dist',
      mode: 'production',
      minify: false,
      sourcemap: true,
    },
    viteConfig: {
      build: {
        target: 'node18',
        lib: {
          entry: 'src/index.ts',
          formats: ['cjs'],
          fileName: 'index',
        },
      },
    },
    dependencies: [],
    devDependencies: ['vite', 'typescript'],
  },
};

// ============================================
// Preset Functions
// ============================================

/**
 * Get a build preset by name
 */
export function getPresetConfig(name: PresetName): BuildPreset | undefined {
  return BUILD_PRESETS[name];
}

/**
 * Get the best preset for a framework
 */
export function getPresetForFramework(
  framework: 'react' | 'vue' | 'svelte' | 'solid' | 'vanilla',
  options: { typescript?: boolean; tailwind?: boolean } = {}
): PresetName {
  switch (framework) {
    case 'react':
      if (options.tailwind) return 'react-shadcn';
      if (options.typescript) return 'react-vite-ts';
      return 'react-vite';

    case 'vue':
      if (options.typescript) return 'vue-vite-ts';
      return 'vue-vite';

    case 'svelte':
      return 'svelte-vite';

    case 'solid':
      return 'solid-vite';

    case 'vanilla':
    default:
      return 'vanilla-vite';
  }
}

/**
 * Get all available preset names
 */
export function listAvailablePresets(): Array<{
  name: PresetName;
  displayName: string;
  description: string;
  framework: string;
}> {
  return Object.values(BUILD_PRESETS).map((preset) => ({
    name: preset.name,
    displayName: preset.displayName,
    description: preset.description,
    framework: preset.framework,
  }));
}

/**
 * Detect the best preset for a project based on package.json
 */
export function detectPresetFromPackageJson(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): PresetName {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // Check for specific frameworks
  if (deps['next']) {
    return 'next-static';
  }

  if (deps['@sveltejs/kit'] || deps['svelte']) {
    return 'svelte-vite';
  }

  if (deps['vue']) {
    return deps['typescript'] || deps['vue-tsc'] ? 'vue-vite-ts' : 'vue-vite';
  }

  if (deps['solid-js']) {
    return 'solid-vite';
  }

  if (deps['react']) {
    // Check for shadcn/tailwind
    if (deps['tailwindcss'] || deps['@tailwindcss/vite']) {
      return 'react-shadcn';
    }
    // Check for react-router (SPA)
    if (deps['react-router-dom']) {
      return 'react-spa';
    }
    // Check for TypeScript
    if (deps['typescript']) {
      return 'react-vite-ts';
    }
    return 'react-vite';
  }

  if (deps['hono'] || deps['wrangler']) {
    return 'cloudflare-worker';
  }

  return 'vanilla-vite';
}

/**
 * Merge preset configuration with custom overrides
 */
export function mergePresetWithOverrides(
  preset: BuildPreset,
  overrides: {
    buildConfig?: Partial<BuildConfig>;
    viteConfig?: Partial<ViteConfig>;
    additionalDeps?: string[];
    additionalDevDeps?: string[];
  }
): BuildPreset {
  return {
    ...preset,
    buildConfig: {
      ...preset.buildConfig,
      ...overrides.buildConfig,
    },
    viteConfig: {
      ...preset.viteConfig,
      ...overrides.viteConfig,
      plugins: [
        ...(preset.viteConfig.plugins || []),
        ...((overrides.viteConfig?.plugins as VitePluginConfig[]) || []),
      ],
    },
    dependencies: [
      ...preset.dependencies,
      ...(overrides.additionalDeps || []),
    ],
    devDependencies: [
      ...preset.devDependencies,
      ...(overrides.additionalDevDeps || []),
    ],
  };
}

/**
 * Generate package.json dependencies from a preset
 */
export function generateDependenciesFromPreset(preset: BuildPreset): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  // Use latest for all packages
  for (const dep of preset.dependencies) {
    dependencies[dep] = 'latest';
  }

  for (const dep of preset.devDependencies) {
    devDependencies[dep] = 'latest';
  }

  return { dependencies, devDependencies };
}
