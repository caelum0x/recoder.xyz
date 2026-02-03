/**
 * Shell action utilities - extracted from action-runner.ts
 * Contains framework detection, package.json generation, and shell command parsing.
 *
 * Note: The main #runShellAction and #runAutoInstall have deep integration
 * with ActionRunner's private state (npm install coordination, dev server management)
 * and remain in action-runner.ts.
 */

import { createScopedLogger } from '~/utils/logger';
import { dockerExec } from './docker-operations';

const logger = createScopedLogger('ShellActions');

/**
 * Command detection patterns
 */
export const SHELL_PATTERNS = {
  devServer: /npm\s+(run\s+)?dev\b|yarn\s+dev\b|pnpm\s+dev\b|bun\s+(run\s+)?dev\b|npx\s+vite\b|npm\s+start\b|yarn\s+start\b|pnpm\s+start\b|next\s+dev\b|remix\s+dev\b/,
  installCommand: /npm\s+(install|i\b)|yarn\s+(install|add)\b|pnpm\s+(install|add)\b|bun\s+(install|add)\b/,
  npmCommand: /npm|yarn|pnpm|bun/,
  installAndDev: /\b(npm|yarn|pnpm)\s+(install|i\b)[^&]*&&.*\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/,
  npmRun: /npm\s+run/,
};

/**
 * Detect if a command is a dev server command
 */
export function isDevServerCommand(content: string): boolean {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  return SHELL_PATTERNS.devServer.test(normalized);
}

/**
 * Detect if a command is an install command
 */
export function isInstallCommand(content: string): boolean {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  return SHELL_PATTERNS.installCommand.test(normalized);
}

/**
 * Detect if a command involves npm/yarn/pnpm/bun
 */
export function isNpmCommand(content: string): boolean {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  return SHELL_PATTERNS.npmCommand.test(normalized);
}

/**
 * Detect if a command is install + dev combined
 */
export function isInstallAndDevCommand(content: string): boolean {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  return SHELL_PATTERNS.installAndDev.test(normalized);
}

/**
 * Detect if a command needs dependencies (dev server or npm run)
 */
export function needsDependencies(content: string): boolean {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  return isDevServerCommand(content) || SHELL_PATTERNS.npmRun.test(normalized);
}

/**
 * Framework detection based on file structure
 */
export async function detectFramework(projectId: string): Promise<string> {
  try {
    const files = await dockerExec(projectId, 'find . -maxdepth 3 -type f -o -type d 2>/dev/null');
    const fileList = files.toLowerCase();

    // Next.js detection
    if (fileList.includes('app/page.') || fileList.includes('app/layout.') || fileList.includes('next.config')) {
      return 'nextjs';
    }

    // Remix detection
    if (fileList.includes('remix.config')) {
      return 'remix';
    }

    // Astro detection
    if (fileList.includes('astro.config')) {
      return 'astro';
    }

    // SvelteKit detection
    if (fileList.includes('svelte.config')) {
      return 'sveltekit';
    }

    // Vue detection (Nuxt or plain Vue)
    if (fileList.includes('nuxt.config')) {
      return 'nuxt';
    }

    // Angular detection
    if (fileList.includes('angular.json')) {
      return 'angular';
    }

    // Python/Flask/Django detection
    if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml')) {
      if (fileList.includes('manage.py')) return 'django';
      if (fileList.includes('app.py') || fileList.includes('wsgi.py')) return 'flask';
      return 'python';
    }

    // Go detection
    if (fileList.includes('go.mod')) {
      return 'go';
    }

    // Rust detection
    if (fileList.includes('cargo.toml')) {
      return 'rust';
    }

    // Java detection
    if (fileList.includes('pom.xml') || fileList.includes('build.gradle')) {
      // Check for Spring Boot
      if (fileList.includes('spring-boot') || fileList.includes('application.properties') || fileList.includes('application.yml')) {
        return 'java-spring';
      }
      return 'java';
    }

    // FastAPI detection (Python with main.py containing FastAPI)
    if (fileList.includes('main.py') && (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml'))) {
      return 'fastapi';
    }

    // Default to Vite for React/Vue/Svelte
    return 'vite';
  } catch (e) {
    return 'vite';
  }
}

/**
 * Generate package.json for a framework
 */
export function generatePackageJson(framework: string): Record<string, any> {
  const base = {
    name: "project",
    version: "1.0.0"
  };

  switch (framework) {
    case 'nextjs':
      return {
        ...base,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start"
        },
        dependencies: {
          next: "^14.2.0",
          react: "^18.3.1",
          "react-dom": "^18.3.1"
        },
        devDependencies: {
          "@types/node": "^20.0.0",
          "@types/react": "^18.3.0",
          "@types/react-dom": "^18.3.0",
          typescript: "^5.5.0"
        }
      };

    case 'remix':
      return {
        ...base,
        scripts: {
          dev: "remix dev",
          build: "remix build",
          start: "remix-serve build"
        },
        dependencies: {
          "@remix-run/node": "^2.0.0",
          "@remix-run/react": "^2.0.0",
          "@remix-run/serve": "^2.0.0",
          react: "^18.3.1",
          "react-dom": "^18.3.1"
        },
        devDependencies: {
          "@remix-run/dev": "^2.0.0",
          typescript: "^5.5.0"
        }
      };

    case 'astro':
      return {
        ...base,
        type: "module",
        scripts: {
          dev: "astro dev",
          build: "astro build",
          preview: "astro preview"
        },
        dependencies: {
          astro: "^4.0.0"
        }
      };

    case 'sveltekit':
      return {
        ...base,
        type: "module",
        scripts: {
          dev: "vite dev",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          "@sveltejs/kit": "^2.0.0"
        },
        devDependencies: {
          "@sveltejs/adapter-auto": "^3.0.0",
          "@sveltejs/vite-plugin-svelte": "^3.0.0",
          svelte: "^4.0.0",
          vite: "^5.4.0"
        }
      };

    case 'nuxt':
      return {
        ...base,
        type: "module",
        scripts: {
          dev: "nuxt dev",
          build: "nuxt build",
          preview: "nuxt preview"
        },
        dependencies: {
          nuxt: "^3.0.0",
          vue: "^3.4.0"
        }
      };

    case 'angular':
      return {
        ...base,
        scripts: {
          dev: "ng serve",
          build: "ng build",
          start: "ng serve"
        },
        dependencies: {
          "@angular/animations": "^17.0.0",
          "@angular/common": "^17.0.0",
          "@angular/compiler": "^17.0.0",
          "@angular/core": "^17.0.0",
          "@angular/platform-browser": "^17.0.0",
          "@angular/platform-browser-dynamic": "^17.0.0"
        },
        devDependencies: {
          "@angular-devkit/build-angular": "^17.0.0",
          "@angular/cli": "^17.0.0",
          "@angular/compiler-cli": "^17.0.0",
          typescript: "^5.2.0"
        }
      };

    case 'vite':
    default:
      return {
        ...base,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1"
        },
        devDependencies: {
          "@types/react": "^18.3.0",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.0",
          typescript: "^5.5.0",
          vite: "^5.4.0"
        }
      };
  }
}

/**
 * Common backend server entry points to check
 */
export const BACKEND_SERVER_PATHS = [
  'src/server/index.ts',
  'src/server/index.js',
  'server/index.ts',
  'server/index.js',
  'src/api/server.ts',
  'src/api/server.js',
  'backend/index.ts',
  'backend/index.js',
  'server.ts',
  'server.js',
];

/**
 * Check if a file contains server listen code
 */
export function isServerFile(content: string): boolean {
  return content.includes('.listen(') || content.includes('createServer');
}

/**
 * Determine the command to run a backend file
 */
export function getBackendRunCommand(
  backendFile: string,
  packageJsonContent: string
): string {
  const isTsx = backendFile.endsWith('.ts');
  const hasTsx = packageJsonContent.includes('"tsx"');
  const hasTsNode = packageJsonContent.includes('"ts-node"');

  if (isTsx && hasTsx) {
    return `npx tsx /workspace/${backendFile}`;
  } else if (isTsx && hasTsNode) {
    return `npx ts-node /workspace/${backendFile}`;
  } else if (isTsx) {
    // No TypeScript runner available - needs tsx installation
    return `npx tsx /workspace/${backendFile}`;
  } else {
    // JavaScript file
    return `node /workspace/${backendFile}`;
  }
}
