/**
 * API Route: POST /api/create-sandbox
 *
 * Creates or initializes a Docker sandbox for a project.
 * This is the equivalent of the Next.js create-ai-sandbox-v2 route,
 * adapted for Docker containers via docker-backend.
 *
 * Features:
 * 1. Creates or gets an existing Docker container
 * 2. Initializes with a Vite React TypeScript template
 * 3. Sets up Tailwind CSS
 * 4. Generates initial package.json
 * 5. Returns sandbox URL and status
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  DockerHttpError,
  createDockerProxyHeaders,
  dockerFetchJson,
  getDockerBackendUrl,
} from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CreateSandbox');

// Get the public Docker backend URL for client access
function getPublicDockerUrl(context: ActionFunctionArgs['context']): string {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } }).cloudflare?.env;
  return env?.VITE_DOCKER_BACKEND_URL || process.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
}

/**
 * Vite React TypeScript template files with Tailwind CSS
 * Based on the recoder-vite-react-ts starter template
 */
const VITE_REACT_TEMPLATE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'vite-react-typescript-starter',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      lint: 'eslint .',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit -p tsconfig.app.json',
    },
    dependencies: {
      'lucide-react': '^0.344.0',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@eslint/js': '^9.9.1',
      '@types/react': '^18.3.5',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      autoprefixer: '^10.4.18',
      eslint: '^9.9.1',
      'eslint-plugin-react-hooks': '^5.1.0-rc.0',
      'eslint-plugin-react-refresh': '^0.4.11',
      globals: '^15.9.0',
      postcss: '^8.4.35',
      tailwindcss: '^3.4.1',
      typescript: '^5.5.3',
      'typescript-eslint': '^8.3.0',
      vite: '^5.4.2',
    },
  }, null, 2),

  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
`,

  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,

  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,

  'tsconfig.json': JSON.stringify({
    files: [],
    references: [
      { path: './tsconfig.app.json' },
      { path: './tsconfig.node.json' },
    ],
  }, null, 2),

  'tsconfig.app.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
  }, null, 2),

  'tsconfig.node.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['vite.config.ts'],
  }, null, 2),

  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,

  'src/App.tsx': `function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-xl text-gray-700">Start prompting (or editing) to see magic happen :)</p>
    </div>
  );
}

export default App;
`,

  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
`,

  'src/vite-env.d.ts': `/// <reference types="vite/client" />
`,

  '.gitignore': `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`,
};

interface CreateSandboxResponse {
  success: boolean;
  sandboxId?: string;
  containerId?: string;
  url?: string;
  previewUrl?: string;
  viteUrl?: string;
  ptyUrl?: string;
  ports?: {
    preview: number;
    vite: number;
    pty: number;
  };
  provider?: string;
  message?: string;
  error?: string;
  details?: string;
  provider?: string;
  canRetry?: boolean;
}

interface ContainerResponse {
  containerId: string;
  reused: boolean;
  fromPool?: boolean;
  port: number;
  ptyPort?: number;
  daytona?: boolean;
  ports?: {
    preview: number;
    vite: number;
    other: number;
    pty: number;
  };
  urls?: {
    preview?: string;
    vite?: string;
    pty?: string;
  };
}

function extractDockerErrorPayload(error: DockerHttpError): {
  error: string;
  details?: string;
  provider?: string;
  canRetry?: boolean;
} {
  const payload = error.payload as
    | string
    | {
        error?: string;
        message?: string;
        details?: string;
        provider?: string;
        canRetry?: boolean;
      }
    | null;

  if (typeof payload === 'string') {
    return {
      error: error.message || 'Docker backend request failed',
      details: payload,
    };
  }

  return {
    error: payload?.error || payload?.message || error.message || 'Docker backend request failed',
    details: payload?.details,
    provider: payload?.provider,
    canRetry: payload?.canRetry,
  };
}

/**
 * POST /api/create-sandbox
 *
 * Request body:
 * - projectId (required): The project ID for the sandbox
 * - template (optional): Template to initialize with (default: 'vite-react-ts')
 * - skipInit (optional): Skip template initialization if true
 *
 * Response:
 * - success: boolean
 * - sandboxId: The project/sandbox ID
 * - containerId: Docker container ID
 * - url: Main preview URL
 * - previewUrl: Preview URL (port 3000)
 * - viteUrl: Vite dev server URL (port 5173)
 * - ptyUrl: PTY WebSocket URL
 * - ports: Port numbers
 * - provider: 'docker'
 * - message: Status message
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json<CreateSandboxResponse>(
      { success: false, error: 'Method not allowed' },
      { status: 405 }
    );
  }

  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json<CreateSandboxResponse>(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    logger.info('Creating sandbox...');

    const body = await request.json() as {
      projectId?: string;
      framework?: string;
      templateId?: string;
      template?: string;
      skipInit?: boolean;
    };

    const { projectId, framework, templateId, skipInit = false } = body;

    if (!projectId) {
      return json<CreateSandboxResponse>(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    const dockerUrl = getDockerBackendUrl(context);
    const publicDockerUrl = getPublicDockerUrl(context);

    const dockerHeaders = createDockerProxyHeaders(request);

    // Step 1: Create or get container from docker-backend
    logger.info(`Creating/getting container for project ${projectId}...`);

    let containerResponse: ContainerResponse;
    try {
      containerResponse = await dockerFetchJson<ContainerResponse>(
        `${dockerUrl}/api/container`,
        {
          method: 'POST',
          body: JSON.stringify({ projectId, framework, templateId }),
        },
        dockerHeaders,
      );
    } catch (error) {
      logger.error('Failed to create container, retrying once:', error);

      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        containerResponse = await dockerFetchJson<ContainerResponse>(
          `${dockerUrl}/api/container`,
          {
            method: 'POST',
            body: JSON.stringify({ projectId, framework, templateId }),
          },
          dockerHeaders,
        );
      } catch (retryError) {
        logger.error('Retry container create also failed:', retryError);
        const status = retryError instanceof DockerHttpError ? retryError.status : 503;
        const dockerError = retryError instanceof DockerHttpError
          ? extractDockerErrorPayload(retryError)
          : {
              error: 'Failed to create container',
              details: retryError instanceof Error ? retryError.message : 'Could not create Daytona sandbox',
            };

        return json<CreateSandboxResponse>(
          {
            success: false,
            error: dockerError.error,
            details: dockerError.details,
            provider: dockerError.provider,
            canRetry: dockerError.canRetry,
          },
          { status }
        );
      }

      logger.info(`Container create recovered on retry: ${containerResponse.containerId.slice(0, 12)}, port: ${containerResponse.port}`);
    }

    if (!containerResponse) {
      return json<CreateSandboxResponse>(
        {
          success: false,
          error: 'Failed to create container',
          details: 'Container response missing after retry',
        },
        { status: 503 }
      );
    }

    logger.info(`Container ready: ${containerResponse.containerId.slice(0, 12)}, port: ${containerResponse.port}`);

    // Step 2: Initialize with template files (unless skipped or container was reused with files)
    if (!skipInit && !containerResponse.reused) {
      logger.info('Setting up Vite React app...');

      try {
        // Write all template files in batch
        const files = Object.entries(VITE_REACT_TEMPLATE).map(([path, content]) => ({
          path,
          content,
        }));

        const batchWriteResponse = await dockerFetchJson<{
          success?: boolean;
          failedFiles?: Array<{ path?: string; error?: string }>;
        }>(
          `${dockerUrl}/api/files/${projectId}/batch`,
          {
            method: 'POST',
            body: JSON.stringify({ files, bootstrapPreview: false }),
          },
          dockerHeaders,
        );

        if (batchWriteResponse?.success === false) {
          const failedSummary = (batchWriteResponse.failedFiles || [])
            .slice(0, 3)
            .map((file) => `${file.path || 'unknown'}: ${file.error || 'write failed'}`)
            .join('; ');

          throw new Error(
            failedSummary
              ? `Template batch write failed: ${failedSummary}`
              : 'Template batch write failed',
          );
        }

        logger.info(`Wrote ${files.length} template files to container`);
      } catch (error) {
        logger.error('Failed to write template files:', error);
        // Non-fatal: container is created, files just weren't initialized
        // The user can still use the sandbox
      }
    } else if (containerResponse.reused) {
      logger.info('Container reused, skipping template initialization');
    }

    // Build public URLs
    // For Daytona sandboxes, use the Daytona preview URL directly.
    // For Docker, use the same-origin proxy URL.
    let previewUrl: string;
    let viteUrl: string;
    if (containerResponse.daytona && containerResponse.urls?.preview) {
      // Daytona: direct URL from daytona-proxy e.g. https://5173-{sandboxId}.sandbox.recoder.xyz
      previewUrl = containerResponse.urls.preview;
      viteUrl = previewUrl;
      logger.info(`Daytona sandbox ready at: ${previewUrl}`);
    } else {
      previewUrl = `${publicDockerUrl}/preview/${projectId}`;
      viteUrl = `${publicDockerUrl}/preview/${projectId}`;
    }
    const ptyUrl = (containerResponse.urls?.pty || '').replace('ws://localhost', 'wss://docker.recoder.xyz');

    logger.info(`Sandbox ready at: ${previewUrl}`);

    return json<CreateSandboxResponse>({
      success: true,
      sandboxId: projectId,
      containerId: containerResponse.containerId,
      url: previewUrl,
      previewUrl,
      viteUrl,
      ptyUrl,
      ports: containerResponse.ports
        ? {
            preview: containerResponse.ports.preview,
            vite: containerResponse.ports.vite,
            pty: containerResponse.ports.pty,
          }
        : undefined,
      provider: 'docker',
      message: containerResponse.reused
        ? 'Sandbox ready (reused existing container)'
        : skipInit
          ? 'Sandbox created'
          : 'Sandbox created and Vite React app initialized',
    });
  } catch (error) {
    logger.error('Error creating sandbox:', error);

    if (error instanceof DockerHttpError) {
      const dockerError = extractDockerErrorPayload(error);
      return json<CreateSandboxResponse>(
        {
          success: false,
          error: dockerError.error,
          details: dockerError.details,
          provider: dockerError.provider,
          canRetry: dockerError.canRetry,
        },
        { status: error.status }
      );
    }

    return json<CreateSandboxResponse>(
      {
        success: false,
        error: 'Failed to create sandbox',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/create-sandbox
 *
 * Health check / info endpoint
 */
export async function loader({ context }: ActionFunctionArgs) {
  const dockerUrl = getDockerBackendUrl(context);

  // Check if docker-backend is healthy
  try {
    const health = await dockerFetchJson<{ status: string; containers: number }>(
      `${dockerUrl}/health`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      },
      {},
    );

    return json({
      healthy: true,
      provider: 'docker',
      dockerUrl,
      containers: health.containers,
      availableTemplates: ['vite-react-ts'],
    });
  } catch (error) {
    return json({
      healthy: false,
      error: 'Failed to connect to docker-backend',
      dockerUrl,
    });
  }
}
