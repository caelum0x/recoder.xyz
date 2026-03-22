import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// React 18.3.1 paths - used for deduplication
const REACT_18_PATH = resolve(__dirname, 'node_modules/react');
const REACT_DOM_18_PATH = resolve(__dirname, 'node_modules/react-dom');

export default defineConfig((config) => {
  const isDev = config.mode === 'development';
  const isProduction = config.mode === 'production';

  return {
    json: {
      stringify: true,
    },
    resolve: {
      // Prefer TS sources over adjacent generated JS files in shared/ to avoid CJS export mismatches.
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      // Force single React instance - point to recoder-web's React 18.3.1
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: {
        // Do NOT alias React here - it breaks SSR (CJS vs ESM conflict)
        // Instead, rely on dedupe + correct node_modules resolution
        // Force Node builtins for SSR resolution.
        crypto: 'node:crypto',
        stream: 'node:stream',
        // Skip ajv JSON schema files that cause build issues
        'ajv/dist/refs/json-schema-draft-07.json': resolve(__dirname, 'app/lib/empty-json.js'),
        // Resolve vault polyfill shims to real Node.js modules for SSR
        'vite-plugin-node-polyfills/shims/buffer': 'node:buffer',
        'vite-plugin-node-polyfills/shims/process': 'node:process',
      },
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        external: [
          /ajv.*\.json$/,
          /@modelcontextprotocol\/sdk/,
          'defuddle/node',
        ],
        output: {
          manualChunks(id: string) {
            if (id.includes('@codemirror/') || id.includes('@lezer/')) {
              return 'codemirror';
            }
            if (id.includes('@xterm/')) {
              return 'terminal';
            }
            if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('rehype-')) {
              return 'markdown';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('react-toastify')) {
              return 'ui';
            }
          },
        },
      },
    },
    assetsInclude: ['**/*.json'],
    // Add cache busting in development
    cacheDir: 'node_modules/.vite',
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
    optimizeDeps: {
      // Force optimization on startup to prevent runtime discovery
      force: isDev ? true : false,
      // Increase the optimization timeout
      esbuildOptions: {
        // Keep names for better debugging
        keepNames: true,
      },
      // Explicitly include ALL problematic dependencies that cause 504 errors
      // We must include everything to prevent runtime discovery and re-optimization
      include: [
        // React - optimize but dedupe to ensure single instance
        'react',
        'react-dom',
        'react-dom/client',
        // Remix utilities
        'remix-utils/client-only',
        'remix-island',
        '@remix-run/react',
        '@remix-run/cloudflare',
        // Polyfills
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/process',
        // CodeMirror
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/lang-cpp',
        '@codemirror/lang-css',
        '@codemirror/lang-html',
        '@codemirror/lang-javascript',
        '@codemirror/lang-json',
        '@codemirror/lang-markdown',
        '@codemirror/lang-python',
        '@codemirror/lang-sass',
        '@codemirror/lang-wast',
        '@lezer/highlight',
        '@uiw/codemirror-theme-vscode',
        // Terminal
        '@xterm/xterm',
        '@xterm/addon-fit',
        '@xterm/addon-web-links',
        // UI Libraries
        'react-resizable-panels',
        'date-fns',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        'framer-motion',
        'react-hotkeys-hook',
        'lucide-react',
        'react-toastify',
        // WebContainer
        '@webcontainer/api',
        // Markdown
        'react-markdown',
        'remark-gfm',
        'rehype-raw',
        'rehype-sanitize',
        'unist-util-visit',
        // State Management
        'nanostores',
        '@nanostores/react',
        // Utilities
        'diff',
        'isbot',
      ],
      exclude: [
        // Server-side packages
        'fs',
        'path',
        'os',
        'crypto',
        'shiki',
        'knex',
        'pg',
        'better-sqlite3',
        'ajv',
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0', // Force IPv4 binding for Playwright tests
      allowedHosts: ['web.recoder.xyz', 'localhost'],
      // HMR configuration - use localhost for dev, production for deployed
      hmr: isProduction ? {
        protocol: 'wss',
        host: 'web.recoder.xyz',
        port: 443,
        overlay: true,
      } : {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        overlay: true,
      },
      // Watch options to prevent issues
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/.vite/**'],
      },
      // Prevent premature optimization
      preTransformRequests: true,
      // Better middleware handling
      middlewareMode: false,
      // Ensure dependencies are resolved before serving
      fs: {
        strict: false,
        allow: ['..'],
      },
    },
    ssr: {
      target: 'node',
      // Externalize backend-specific packages for SSR (NOT React - causes duplicate instance)
      external: [
        'knex',
        'pg',
        'better-sqlite3',
        'ajv',
        'ajv-formats',
        '@modelcontextprotocol/sdk',
        'vite-plugin-node-polyfills',
        'jsdom',
        'defuddle',
        'defuddle/node',
      ],
      // Don't externalize these in SSR - they need to be bundled
      noExternal: [
        'remix-island',
        'set-cookie-parser',
        'extend',
        'unified',
        'istextorbinary',
        'secure-json-parse',
        '@ai-sdk/provider-utils',
        'react-markdown',
        'rehype-raw',
        'rehype-sanitize',
        'remark-gfm',
        'unist-util-visit',
        '@recoder/vault',
        'vite-plugin-node-polyfills',
      ],
      resolve: {
        conditions: ['node'],
        externalConditions: ['node'],
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(config.mode || 'development'),
      global: 'globalThis',
    },
    plugins: [
      nodePolyfills({
        include: ['buffer'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: false,
      }),
      // Cloudflare proxy removed for Node.js deployment
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
        serverModuleFormat: 'esm',
        buildEnd: async () => {
          // Build completed
        },
        // Provide context for dev mode
        buildDirectory: 'build',
        serverBuildFile: 'index.js',
      }),
      UnoCSS(),
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
      chrome129IssuePlugin(),
      fix504ErrorsPlugin(),
      largeJsonPlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
  };
});

function largeJsonPlugin() {
  return {
    name: 'large-json-loader',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      // Intercept imports of starters-bundle.json
      if (source.includes('starters-bundle.json') || source.endsWith('starters-bundle.json')) {
        return '\0virtual:starters-bundle';
      }
      // Skip ajv JSON schema files
      if (source.includes('ajv') && source.endsWith('.json')) {
        return '\0virtual:empty-json';
      }
      return null;
    },
    load(id: string) {
      // Return empty object for ajv JSON files
      if (id === '\0virtual:empty-json') {
        return { code: 'export default {};', map: null };
      }
      // Load large JSON files directly, bypassing vite:json plugin
      if (id === '\0virtual:starters-bundle') {
        try {
          console.log('✅ Loading starters-bundle.json with custom loader');
          const bundlePath = resolve(__dirname, 'app/lib/.server/llm/starters-bundle.json');
          const json = readFileSync(bundlePath, 'utf-8');
          // Return as ES module
          return {
            code: `const data = ${json};\nexport default data;`,
            map: null,
          };
        } catch (error) {
          console.error('❌ Failed to load starters-bundle.json:', error);
          // Return empty object as fallback
          return {
            code: `export default {};`,
            map: null,
          };
        }
      }

      // Polyfill istextorbinary for browser/Cloudflare Workers
      if (id.includes('istextorbinary') && id.includes('edition-browsers')) {
        return {
          code: `
            export function getEncoding(buffer, opts = {}) {
              if (!buffer || buffer.length === 0) return 'utf8';
              const chunkLength = opts.chunkLength || 100;
              const chunk = buffer.slice(0, Math.min(buffer.length, chunkLength));

              // Simple heuristic: check for null bytes
              for (let i = 0; i < chunk.length; i++) {
                if (chunk[i] === 0) return 'binary';
              }
              return 'utf8';
            }

            export function isText(filename, buffer) {
              return getEncoding(buffer) === 'utf8';
            }

            export function isBinary(filename, buffer) {
              return getEncoding(buffer) === 'binary';
            }

            export default { getEncoding, isText, isBinary };
          `,
          map: null,
        };
      }

      return null;
    },
  };
}

function fix504ErrorsPlugin() {
  let optimizationComplete = false;
  let pendingRequests: Array<() => void> = [];
  let server: ViteDevServer;
  let isReoptimizing = false;

  return {
    name: 'fix-504-errors',
    enforce: 'pre' as const,
    configureServer(_server: ViteDevServer) {
      server = _server;

      // Listen for Vite's optimization events
      const waitForOptimization = async () => {
        console.log('⏳ Waiting for dependency optimization to complete...');
        isReoptimizing = true;
        optimizationComplete = false;

        // Wait for Vite's optimizer to finish
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Try to trigger optimization by pre-loading modules
        try {
          await server.warmupRequest('/@vite/client');
        } catch (e) {
          // Ignore errors during warmup
        }

        // Wait additional time for all optimizations to settle
        await new Promise(resolve => setTimeout(resolve, 15000));

        optimizationComplete = true;
        isReoptimizing = false;
        console.log('✅ Optimization complete, releasing pending requests...');
        pendingRequests.forEach(resolve => resolve());
        pendingRequests = [];
      };

      // Wait for server to be fully ready and optimization to complete
      server.httpServer?.once('listening', waitForOptimization);

      // Add middleware BEFORE Vite's transform middleware
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        
        // Prevent caching of optimized dependencies and modules
        if (url.includes('node_modules') || 
            url.includes('/@vite/') || 
            url.includes('/@fs/') || 
            url.includes('/app/') ||
            url.includes('/deps/') ||
            url.includes('?v=')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        
        // Block ALL requests until optimization is complete
        if (!optimizationComplete) {
          await new Promise<void>(resolve => {
            if (optimizationComplete) {
              resolve();
            } else {
              pendingRequests.push(resolve);
              // Safety timeout - release after 45 seconds max
              setTimeout(resolve, 45000);
            }
          });
        }
        
        next();
      });

      // Handle module resolution errors
      const originalSsrLoad = server.ssrLoadModule.bind(server);
      server.ssrLoadModule = async (url, opts) => {
        try {
          return await originalSsrLoad(url, opts);
        } catch (error: any) {
          if (error?.message?.includes('504') || error?.message?.includes('Outdated Optimize Dep')) {
            console.log('🔄 Detected outdated dependency, triggering re-optimization...');
            // Force module graph invalidation
            const mod = server.moduleGraph.getModuleById(url);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 100));
            return await originalSsrLoad(url, opts);
          }
          throw error;
        }
      };
    },
    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      // Clear module cache on changes to prevent stale dependencies
      if (file.includes('node_modules')) {
        const mods = server.moduleGraph.getModulesByFile(file);
        if (mods) {
          mods.forEach(mod => server.moduleGraph.invalidateModule(mod));
        }
      }
    },
  };
}

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        // Only add COOP/COEP if NOT using Docker runtime (WebContainer needs them)
        const useDocker = process.env.VITE_RUNTIME_MODE === 'docker';
        if (!useDocker) {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        }

        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development.</p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        // Add cache control headers for development to prevent 504 errors
        if (req.url?.includes('/@vite/') || req.url?.includes('/node_modules/')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }

        next();
      });
    },
  };
}
