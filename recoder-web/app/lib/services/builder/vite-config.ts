/**
 * Vite Configuration Service
 *
 * Generates and manages Vite configuration for builds.
 * Supports React, Vue, Svelte, Solid, and vanilla JavaScript projects.
 */

import type { BuildConfig } from './build-service';

// ============================================
// Types
// ============================================

export interface ViteServerConfig {
  /** Server host */
  host?: string | boolean;
  /** Server port */
  port?: number;
  /** Strict port */
  strictPort?: boolean;
  /** Enable HTTPS */
  https?: boolean;
  /** Open browser on start */
  open?: boolean | string;
  /** CORS configuration */
  cors?: boolean | object;
  /** Allowed hosts */
  allowedHosts?: boolean | string[];
  /** HMR options */
  hmr?:
    | boolean
    | {
        protocol?: string;
        host?: string;
        port?: number;
        clientPort?: number;
        timeout?: number;
        overlay?: boolean;
      };
  /** Proxy configuration */
  proxy?: Record<string, string | object>;
}

export interface ViteBuildConfig {
  /** Output directory */
  outDir?: string;
  /** Assets directory (relative to outDir) */
  assetsDir?: string;
  /** Inline asset size limit */
  assetsInlineLimit?: number;
  /** CSS code splitting */
  cssCodeSplit?: boolean;
  /** CSS minify */
  cssMinify?: boolean | 'esbuild' | 'lightningcss';
  /** Source map generation */
  sourcemap?: boolean | 'inline' | 'hidden';
  /** Minify options */
  minify?: boolean | 'esbuild' | 'terser';
  /** Target browsers */
  target?: string | string[];
  /** Module format */
  modulePreload?: boolean | { polyfill?: boolean };
  /** Chunk size warning limit */
  chunkSizeWarningLimit?: number;
  /** Report compressed size */
  reportCompressedSize?: boolean;
  /** Empty outDir on build */
  emptyOutDir?: boolean;
  /** Library mode configuration */
  lib?: {
    entry: string | string[] | Record<string, string>;
    name?: string;
    formats?: Array<'es' | 'cjs' | 'umd' | 'iife'>;
    fileName?: string | ((format: string) => string);
  };
  /** Rollup options */
  rollupOptions?: {
    input?: string | string[] | Record<string, string>;
    external?: string[] | ((id: string) => boolean);
    output?: {
      format?: 'es' | 'cjs' | 'umd' | 'iife';
      dir?: string;
      entryFileNames?: string;
      chunkFileNames?: string;
      assetFileNames?: string;
      manualChunks?: Record<string, string[]> | ((id: string) => string | undefined);
    };
  };
}

export interface ViteResolveConfig {
  /** Path aliases */
  alias?: Record<string, string> | Array<{ find: string | RegExp; replacement: string }>;
  /** Extensions to resolve */
  extensions?: string[];
  /** Dedupe packages */
  dedupe?: string[];
  /** Preserve symlinks */
  preserveSymlinks?: boolean;
}

export interface VitePluginConfig {
  /** Plugin name */
  name: string;
  /** Plugin package name for import */
  package?: string;
  /** Plugin options */
  options?: Record<string, unknown>;
  /** When to apply (serve/build/both) */
  apply?: 'serve' | 'build';
  /** Plugin priority */
  enforce?: 'pre' | 'post';
}

export interface ViteConfig {
  /** Configuration root */
  root?: string;
  /** Base public path */
  base?: string;
  /** Build mode */
  mode?: 'development' | 'production';
  /** Define global constants */
  define?: Record<string, string>;
  /** Environment variable prefix */
  envPrefix?: string | string[];
  /** Public directory */
  publicDir?: string;
  /** Server configuration */
  server?: ViteServerConfig;
  /** Build configuration */
  build?: ViteBuildConfig;
  /** Resolve configuration */
  resolve?: ViteResolveConfig;
  /** Plugins configuration */
  plugins?: VitePluginConfig[];
  /** CSS options */
  css?: {
    modules?: {
      localsConvention?: 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly';
      scopeBehaviour?: 'global' | 'local';
      generateScopedName?: string;
    };
    postcss?: string | object;
    preprocessorOptions?: Record<string, object>;
  };
  /** Optimization options */
  optimizeDeps?: {
    include?: string[];
    exclude?: string[];
    esbuildOptions?: Record<string, unknown>;
  };
  /** ESBuild options */
  esbuild?: {
    jsxFactory?: string;
    jsxFragment?: string;
    jsxInject?: string;
    target?: string | string[];
  };
  /** JSON options */
  json?: {
    namedExports?: boolean;
    stringify?: boolean;
  };
}

// ============================================
// Default Configurations
// ============================================

const DEFAULT_SERVER_CONFIG: ViteServerConfig = {
  host: '::',
  port: 5173,
  strictPort: false,
  open: false,
  cors: true,
  allowedHosts: true,
  hmr: {
    overlay: true,
  },
};

const DEFAULT_BUILD_CONFIG: ViteBuildConfig = {
  outDir: 'dist',
  assetsDir: 'assets',
  assetsInlineLimit: 4096,
  cssCodeSplit: true,
  sourcemap: false,
  minify: 'esbuild',
  target: 'es2020',
  chunkSizeWarningLimit: 500,
  reportCompressedSize: true,
  emptyOutDir: true,
};

const DEFAULT_RESOLVE_CONFIG: ViteResolveConfig = {
  alias: {
    '@': './src',
  },
  extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
};

// ============================================
// Framework-Specific Plugins
// ============================================

const FRAMEWORK_PLUGINS: Record<string, VitePluginConfig[]> = {
  react: [
    {
      name: 'react',
      package: '@vitejs/plugin-react-swc',
      options: {},
    },
  ],
  vue: [
    {
      name: 'vue',
      package: '@vitejs/plugin-vue',
      options: {},
    },
  ],
  svelte: [
    {
      name: 'svelte',
      package: '@sveltejs/vite-plugin-svelte',
      options: {},
    },
  ],
  solid: [
    {
      name: 'solid',
      package: 'vite-plugin-solid',
      options: {},
    },
  ],
  vanilla: [],
};

const COMMON_PLUGINS: VitePluginConfig[] = [
  {
    name: 'tailwindcss',
    package: '@tailwindcss/vite',
    options: {},
  },
];

// ============================================
// Configuration Generators
// ============================================

/**
 * Get the default Vite configuration
 */
export function getDefaultViteConfig(): ViteConfig {
  return {
    root: '.',
    base: '/',
    mode: 'development',
    envPrefix: 'VITE_',
    publicDir: 'public',
    server: { ...DEFAULT_SERVER_CONFIG },
    build: { ...DEFAULT_BUILD_CONFIG },
    resolve: { ...DEFAULT_RESOLVE_CONFIG },
    plugins: [],
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
        scopeBehaviour: 'local',
      },
    },
    optimizeDeps: {
      include: [],
      exclude: [],
    },
    json: {
      namedExports: true,
      stringify: false,
    },
  };
}

/**
 * Create a Vite configuration from build options
 */
export function createViteConfig(buildConfig: BuildConfig): ViteConfig {
  const config = getDefaultViteConfig();

  // Set mode
  config.mode = buildConfig.mode || 'production';

  // Set build options
  if (config.build) {
    config.build.outDir = buildConfig.outDir || 'dist';
    config.build.sourcemap = buildConfig.sourcemap ?? false;
    config.build.minify = buildConfig.minify ?? (config.mode === 'production');
  }

  // Set resolve alias for project root
  if (config.resolve) {
    config.resolve.alias = {
      '@': buildConfig.rootDir ? `${buildConfig.rootDir}/src` : './src',
    };
  }

  // Add framework-specific plugins
  const framework = buildConfig.framework || 'react';
  config.plugins = [
    ...(FRAMEWORK_PLUGINS[framework] || []),
    ...COMMON_PLUGINS,
  ];

  // Add environment variables
  if (buildConfig.env) {
    config.define = {};
    for (const [key, value] of Object.entries(buildConfig.env)) {
      config.define[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }

  // Merge custom Vite config
  if (buildConfig.viteConfig) {
    return mergeViteConfigs(config, buildConfig.viteConfig as Partial<ViteConfig>);
  }

  return config;
}

/**
 * Deep merge two Vite configurations
 */
export function mergeViteConfigs(base: ViteConfig, override: Partial<ViteConfig>): ViteConfig {
  const merged: ViteConfig = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    const typedKey = key as keyof ViteConfig;
    const baseValue = merged[typedKey];

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      // Deep merge objects
      (merged as Record<string, unknown>)[key] = { ...baseValue, ...value };
    } else if (Array.isArray(value) && Array.isArray(baseValue)) {
      // Concatenate arrays
      (merged as Record<string, unknown>)[key] = [...baseValue, ...value];
    } else {
      // Direct override
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}

/**
 * Validate a Vite configuration
 */
export function validateViteConfig(config: Partial<ViteConfig>): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate server config
  if (config.server) {
    if (config.server.port && (config.server.port < 1 || config.server.port > 65535)) {
      errors.push('Server port must be between 1 and 65535');
    }
  }

  // Validate build config
  if (config.build) {
    if (config.build.chunkSizeWarningLimit && config.build.chunkSizeWarningLimit < 0) {
      errors.push('Chunk size warning limit must be positive');
    }

    if (config.build.target) {
      const targets = Array.isArray(config.build.target)
        ? config.build.target
        : [config.build.target];

      for (const target of targets) {
        if (!/^(es\d{4}|chrome\d+|firefox\d+|safari\d+|edge\d+|node\d+|esnext)$/i.test(target)) {
          warnings.push(`Unknown build target: ${target}`);
        }
      }
    }
  }

  // Validate resolve config
  if (config.resolve?.alias) {
    if (Array.isArray(config.resolve.alias)) {
      for (const alias of config.resolve.alias) {
        if (!alias.find || !alias.replacement) {
          errors.push('Alias entries must have "find" and "replacement" properties');
        }
      }
    }
  }

  // Validate plugins
  if (config.plugins) {
    for (const plugin of config.plugins) {
      if (!plugin.name) {
        errors.push('Each plugin must have a name');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get Vite plugins for a framework
 */
export function getVitePlugins(framework: string): VitePluginConfig[] {
  const frameworkPlugins = FRAMEWORK_PLUGINS[framework] || [];
  return [...frameworkPlugins, ...COMMON_PLUGINS];
}

/**
 * Generate Vite config file content
 */
export function generateViteConfigContent(config: ViteConfig): string {
  const imports: string[] = [];
  const pluginSetup: string[] = [];

  // Generate plugin imports
  if (config.plugins) {
    for (const plugin of config.plugins) {
      if (plugin.package) {
        const importName = plugin.name.replace(/-/g, '');
        imports.push(`import ${importName} from '${plugin.package}'`);
        pluginSetup.push(
          plugin.options && Object.keys(plugin.options).length > 0
            ? `${importName}(${JSON.stringify(plugin.options)})`
            : `${importName}()`
        );
      }
    }
  }

  // Generate path import for alias
  imports.unshift("import path from 'node:path'");
  imports.unshift("import { defineConfig } from 'vite'");

  // Build config object
  const configObj: Record<string, unknown> = {};

  if (config.server) {
    configObj.server = config.server;
  }

  if (config.build) {
    configObj.build = config.build;
  }

  if (config.resolve?.alias) {
    configObj.resolve = {
      alias: {
        '@': "path.resolve(__dirname, './src')",
      },
    };
  }

  if (pluginSetup.length > 0) {
    configObj.plugins = pluginSetup;
  }

  if (config.define) {
    configObj.define = config.define;
  }

  // Generate the config string
  let configStr = JSON.stringify(configObj, null, 2);

  // Replace quoted path.resolve with actual call
  configStr = configStr.replace(
    /"path\.resolve\(__dirname, '\.\/src'\)"/g,
    "path.resolve(__dirname, './src')"
  );

  // Replace quoted plugin calls with actual calls
  for (const setup of pluginSetup) {
    configStr = configStr.replace(`"${setup}"`, setup);
  }

  // Generate final file content
  return `${imports.join('\n')}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return ${configStr};
});
`;
}

/**
 * Parse an existing vite.config file
 */
export function parseViteConfigFile(content: string): Partial<ViteConfig> {
  const config: Partial<ViteConfig> = {};

  // Extract server config
  const serverMatch = content.match(/server:\s*(\{[\s\S]*?\})\s*,/);
  if (serverMatch) {
    try {
      // This is a simplified parser - in production, use a proper JS parser
      const serverConfig = serverMatch[1]
        .replace(/(['"])?(\w+)(['"])?:/g, '"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}');
      config.server = JSON.parse(serverConfig);
    } catch {
      // Ignore parse errors
    }
  }

  // Extract build config
  const buildMatch = content.match(/build:\s*(\{[\s\S]*?\})\s*,/);
  if (buildMatch) {
    try {
      const buildConfig = buildMatch[1]
        .replace(/(['"])?(\w+)(['"])?:/g, '"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}');
      config.build = JSON.parse(buildConfig);
    } catch {
      // Ignore parse errors
    }
  }

  // Detect plugins
  const plugins: VitePluginConfig[] = [];

  if (content.includes('@vitejs/plugin-react')) {
    plugins.push({ name: 'react', package: '@vitejs/plugin-react-swc' });
  }
  if (content.includes('@vitejs/plugin-vue')) {
    plugins.push({ name: 'vue', package: '@vitejs/plugin-vue' });
  }
  if (content.includes('@sveltejs/vite-plugin-svelte')) {
    plugins.push({ name: 'svelte', package: '@sveltejs/vite-plugin-svelte' });
  }
  if (content.includes('vite-plugin-solid')) {
    plugins.push({ name: 'solid', package: 'vite-plugin-solid' });
  }
  if (content.includes('@tailwindcss/vite')) {
    plugins.push({ name: 'tailwindcss', package: '@tailwindcss/vite' });
  }

  if (plugins.length > 0) {
    config.plugins = plugins;
  }

  return config;
}
