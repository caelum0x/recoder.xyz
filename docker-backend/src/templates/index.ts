/**
 * Container Templates - Pre-configured container templates for different project types
 *
 * Features:
 * - Project type detection
 * - Pre-configured environment variables
 * - Optimized resource allocation per project type
 * - Template validation and customization
 *
 * Inspired by patterns from open-lovable sandbox factory and libra templates
 */

import Docker from 'dockerode';

// ==================== TYPES ====================

export interface ContainerTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;

  // Container configuration
  image: string;
  workingDir: string;
  env: Record<string, string>;

  // Resource limits
  resources: ResourceConfig;

  // Port configuration
  ports: PortConfig[];

  // Startup configuration
  startup: StartupConfig;

  // File system configuration
  filesystem: FilesystemConfig;

  // Dependencies to pre-install
  dependencies?: DependencyConfig;

  // Metadata
  tags: string[];
  popularity: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateCategory =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'static'
  | 'api'
  | 'database'
  | 'mobile'
  | 'custom';

export interface ResourceConfig {
  memory: number;        // bytes
  memorySwap: number;    // bytes (0 = same as memory)
  cpuQuota: number;      // microseconds per CPU period (100000 = 100%)
  cpuPeriod: number;     // CPU period in microseconds (default 100000)
  pidsLimit: number;     // max processes
  diskQuota?: number;    // bytes (optional)
}

export interface PortConfig {
  containerPort: number;
  protocol: 'tcp' | 'udp';
  description: string;
  required: boolean;
}

export interface StartupConfig {
  command?: string[];
  entrypoint?: string[];
  healthCheck?: HealthCheckConfig;
  warmupTimeMs: number;
  readinessProbe?: ReadinessProbe;
}

export interface HealthCheckConfig {
  test: string[];
  interval: number;      // ms
  timeout: number;       // ms
  retries: number;
  startPeriod: number;   // ms
}

export interface ReadinessProbe {
  httpGet?: { path: string; port: number };
  exec?: { command: string[] };
  initialDelayMs: number;
  periodMs: number;
  timeoutMs: number;
}

export interface FilesystemConfig {
  tmpfs?: Record<string, string>;
  volumes?: VolumeMount[];
  readonlyPaths?: string[];
  writablePaths?: string[];
}

export interface VolumeMount {
  hostPath?: string;
  containerPath: string;
  readOnly: boolean;
}

export interface DependencyConfig {
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo';
  packages: string[];
  devPackages?: string[];
  installCommand?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== DEFAULT TEMPLATES ====================

const DEFAULT_RESOURCE_CONFIG: ResourceConfig = {
  memory: 2 * 1024 * 1024 * 1024,      // 2GB
  memorySwap: 2 * 1024 * 1024 * 1024,  // 2GB (no swap)
  cpuQuota: 100000,                     // 100% of 1 CPU
  cpuPeriod: 100000,
  pidsLimit: 256,
};

const DEFAULT_FILESYSTEM_CONFIG: FilesystemConfig = {
  tmpfs: {
    '/tmp': 'rw,noexec,nosuid,size=512m',
  },
};

// Pre-defined templates for common project types
export const BUILTIN_TEMPLATES: ContainerTemplate[] = [
  // React + Vite Template
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Modern React application with Vite bundler, TypeScript, and hot module replacement',
    category: 'frontend',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      VITE_PORT: '5173',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 2 * 1024 * 1024 * 1024,   // 2GB - Vite needs decent memory
    },
    ports: [
      { containerPort: 5173, protocol: 'tcp', description: 'Vite dev server', required: true },
      { containerPort: 3000, protocol: 'tcp', description: 'Alternative port', required: false },
    ],
    startup: {
      warmupTimeMs: 5000,
      healthCheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:5173'],
        interval: 10000,
        timeout: 5000,
        retries: 3,
        startPeriod: 30000,
      },
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['react', 'react-dom'],
      devPackages: ['vite', '@vitejs/plugin-react', 'typescript', '@types/react', '@types/react-dom'],
    },
    tags: ['react', 'vite', 'typescript', 'frontend', 'spa'],
    popularity: 100,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Next.js Template
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework with server-side rendering, API routes, and file-based routing',
    category: 'fullstack',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 3 * 1024 * 1024 * 1024,   // 3GB - Next.js needs more memory
    },
    ports: [
      { containerPort: 3000, protocol: 'tcp', description: 'Next.js dev server', required: true },
    ],
    startup: {
      warmupTimeMs: 10000,
      healthCheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:3000'],
        interval: 15000,
        timeout: 5000,
        retries: 3,
        startPeriod: 60000,
      },
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['next', 'react', 'react-dom'],
      devPackages: ['typescript', '@types/react', '@types/node', 'eslint', 'eslint-config-next'],
    },
    tags: ['nextjs', 'react', 'ssr', 'fullstack', 'typescript'],
    popularity: 95,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Express.js API Template
  {
    id: 'express-api',
    name: 'Express.js API',
    description: 'Node.js backend API with Express framework and TypeScript',
    category: 'backend',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 1 * 1024 * 1024 * 1024,   // 1GB - APIs are lighter
    },
    ports: [
      { containerPort: 3000, protocol: 'tcp', description: 'Express server', required: true },
    ],
    startup: {
      warmupTimeMs: 3000,
      healthCheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
        interval: 10000,
        timeout: 3000,
        retries: 3,
        startPeriod: 15000,
      },
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['express', 'cors', 'helmet'],
      devPackages: ['typescript', '@types/express', '@types/node', 'ts-node', 'nodemon'],
    },
    tags: ['express', 'nodejs', 'api', 'backend', 'typescript'],
    popularity: 85,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Static HTML/CSS/JS Template
  {
    id: 'static-html',
    name: 'Static HTML',
    description: 'Simple static website with HTML, CSS, and JavaScript',
    category: 'static',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      TERM: 'xterm-256color',
      PORT: '8080',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 512 * 1024 * 1024,        // 512MB - minimal for static
      cpuQuota: 50000,                   // 50% CPU
    },
    ports: [
      { containerPort: 8080, protocol: 'tcp', description: 'Static server', required: true },
    ],
    startup: {
      warmupTimeMs: 1000,
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    tags: ['html', 'css', 'javascript', 'static', 'beginner'],
    popularity: 70,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Python FastAPI Template
  {
    id: 'python-fastapi',
    name: 'Python FastAPI',
    description: 'Modern Python API framework with automatic OpenAPI documentation',
    category: 'api',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PORT: '8000',
      TERM: 'xterm-256color',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 1 * 1024 * 1024 * 1024,   // 1GB
    },
    ports: [
      { containerPort: 8000, protocol: 'tcp', description: 'FastAPI server', required: true },
    ],
    startup: {
      warmupTimeMs: 5000,
      healthCheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:8000/health'],
        interval: 10000,
        timeout: 3000,
        retries: 3,
        startPeriod: 20000,
      },
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'pip',
      packages: ['fastapi', 'uvicorn', 'pydantic'],
      devPackages: ['pytest', 'httpx'],
      installCommand: 'pip install',
    },
    tags: ['python', 'fastapi', 'api', 'backend'],
    popularity: 80,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Vue.js + Vite Template
  {
    id: 'vue-vite',
    name: 'Vue.js + Vite',
    description: 'Vue 3 application with Vite bundler and Composition API',
    category: 'frontend',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      VITE_PORT: '5173',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 2 * 1024 * 1024 * 1024,   // 2GB
    },
    ports: [
      { containerPort: 5173, protocol: 'tcp', description: 'Vite dev server', required: true },
    ],
    startup: {
      warmupTimeMs: 5000,
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['vue'],
      devPackages: ['vite', '@vitejs/plugin-vue', 'typescript', 'vue-tsc'],
    },
    tags: ['vue', 'vite', 'typescript', 'frontend', 'spa'],
    popularity: 75,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Svelte + Vite Template
  {
    id: 'svelte-vite',
    name: 'Svelte + Vite',
    description: 'Svelte application with Vite bundler for reactive UI',
    category: 'frontend',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      VITE_PORT: '5173',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 2 * 1024 * 1024 * 1024,   // 2GB
    },
    ports: [
      { containerPort: 5173, protocol: 'tcp', description: 'Vite dev server', required: true },
    ],
    startup: {
      warmupTimeMs: 5000,
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['svelte'],
      devPackages: ['vite', '@sveltejs/vite-plugin-svelte', 'typescript', 'svelte-check'],
    },
    tags: ['svelte', 'vite', 'typescript', 'frontend', 'spa'],
    popularity: 65,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Bun Runtime Template
  {
    id: 'bun',
    name: 'Bun Runtime',
    description: 'Fast JavaScript/TypeScript runtime with built-in bundler and package manager',
    category: 'backend',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 1 * 1024 * 1024 * 1024,   // 1GB - Bun is efficient
    },
    ports: [
      { containerPort: 3000, protocol: 'tcp', description: 'Bun server', required: true },
    ],
    startup: {
      warmupTimeMs: 2000,
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'bun',
      packages: [],
    },
    tags: ['bun', 'typescript', 'javascript', 'fast'],
    popularity: 60,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },

  // Expo React Native Template
  {
    id: 'expo-react-native',
    name: 'Expo React Native',
    description: 'React Native mobile app with Expo SDK, expo-router navigation, and TypeScript',
    category: 'mobile',
    image: 'recoder-workspace:latest',
    workingDir: '/workspace',
    env: {
      NODE_ENV: 'development',
      REACT_NATIVE_PACKAGER_HOSTNAME: 'localhost',
      EXPO_DEVTOOLS_LISTEN_ADDRESS: '0.0.0.0',
      BROWSER: 'none',
      CI: '1',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    resources: {
      ...DEFAULT_RESOURCE_CONFIG,
      memory: 2 * 1024 * 1024 * 1024,   // 2GB - RN builds need more than web
      cpuQuota: 200000,                  // 200% (2 CPUs) - metro bundler is CPU intensive
    },
    ports: [
      { containerPort: 8081, protocol: 'tcp', description: 'Metro bundler', required: true },
      { containerPort: 19006, protocol: 'tcp', description: 'Expo Web', required: false },
      { containerPort: 3000, protocol: 'tcp', description: 'Alternative port', required: false },
    ],
    startup: {
      warmupTimeMs: 10000,
      healthCheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:8081'],
        interval: 15000,
        timeout: 5000,
        retries: 3,
        startPeriod: 60000,
      },
    },
    filesystem: DEFAULT_FILESYSTEM_CONFIG,
    dependencies: {
      packageManager: 'npm',
      packages: ['expo', 'expo-router', 'react-native', 'react', 'typescript', '@expo/vector-icons', 'expo-status-bar'],
    },
    tags: ['expo', 'react-native', 'mobile', 'typescript', 'ios', 'android'],
    popularity: 70,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

// ==================== TEMPLATE MANAGER ====================

class TemplateManager {
  private templates: Map<string, ContainerTemplate> = new Map();
  private customTemplates: Map<string, ContainerTemplate> = new Map();

  constructor() {
    // Load built-in templates
    for (const template of BUILTIN_TEMPLATES) {
      this.templates.set(template.id, template);
    }

    console.log(`[TemplateManager] Loaded ${this.templates.size} built-in templates`);
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): ContainerTemplate | null {
    return this.templates.get(id) || this.customTemplates.get(id) || null;
  }

  /**
   * Get all templates
   */
  getAllTemplates(): ContainerTemplate[] {
    return [
      ...Array.from(this.templates.values()),
      ...Array.from(this.customTemplates.values()),
    ].sort((a, b) => b.popularity - a.popularity);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: TemplateCategory): ContainerTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  /**
   * Search templates by tags
   */
  searchTemplates(query: string): ContainerTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Register a custom template
   */
  registerCustomTemplate(template: ContainerTemplate): TemplateValidationResult {
    const validation = this.validateTemplate(template);

    if (!validation.valid) {
      return validation;
    }

    this.customTemplates.set(template.id, template);
    console.log(`[TemplateManager] Registered custom template: ${template.id}`);

    return validation;
  }

  /**
   * Remove a custom template
   */
  removeCustomTemplate(id: string): boolean {
    if (this.templates.has(id)) {
      console.warn(`[TemplateManager] Cannot remove built-in template: ${id}`);
      return false;
    }

    return this.customTemplates.delete(id);
  }

  /**
   * Validate a template
   */
  validateTemplate(template: ContainerTemplate): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!template.id) errors.push('Template ID is required');
    if (!template.name) errors.push('Template name is required');
    if (!template.image) errors.push('Template image is required');
    if (!template.workingDir) errors.push('Working directory is required');

    // ID format
    if (template.id && !/^[a-z0-9-]+$/.test(template.id)) {
      errors.push('Template ID must be lowercase alphanumeric with hyphens only');
    }

    // Resource limits
    if (template.resources) {
      if (template.resources.memory < 256 * 1024 * 1024) {
        warnings.push('Memory limit below 256MB may cause issues');
      }
      if (template.resources.memory > 8 * 1024 * 1024 * 1024) {
        warnings.push('Memory limit above 8GB is unusually high');
      }
      if (template.resources.pidsLimit < 32) {
        warnings.push('PID limit below 32 may be too restrictive');
      }
    }

    // Ports
    if (template.ports) {
      const portNumbers = template.ports.map(p => p.containerPort);
      const uniquePorts = new Set(portNumbers);
      if (portNumbers.length !== uniquePorts.size) {
        errors.push('Duplicate port numbers in port configuration');
      }
    }

    // Check for duplicate ID
    if (this.templates.has(template.id) || this.customTemplates.has(template.id)) {
      errors.push(`Template with ID '${template.id}' already exists`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Detect project type from files and return best matching template
   */
  detectProjectType(files: string[]): ContainerTemplate | null {
    const fileSet = new Set(files.map(f => f.toLowerCase()));
    const fileContent: Record<string, boolean> = {};

    // Check for common configuration files
    fileContent.hasPackageJson = fileSet.has('package.json');
    fileContent.hasNextConfig = files.some(f => f.match(/next\.config\.(js|ts|mjs)$/i));
    fileContent.hasViteConfig = files.some(f => f.match(/vite\.config\.(js|ts|mjs)$/i));
    fileContent.hasSvelteConfig = files.some(f => f.match(/svelte\.config\.(js|ts)$/i));
    fileContent.hasVueConfig = files.some(f => f.match(/vue\.config\.(js|ts)$/i));
    fileContent.hasRequirementsTxt = fileSet.has('requirements.txt');
    fileContent.hasPyprojectToml = fileSet.has('pyproject.toml');
    fileContent.hasBunLock = fileSet.has('bun.lockb') || fileSet.has('bun.lock');
    fileContent.hasIndexHtml = fileSet.has('index.html');
    fileContent.hasAppPy = fileSet.has('app.py') || fileSet.has('main.py');
    fileContent.hasAppJson = fileSet.has('app.json') || fileSet.has('app.config.js') || fileSet.has('app.config.ts');
    fileContent.hasExpoConfig = fileContent.hasAppJson && (fileSet.has('babel.config.js') || files.some(f => f.match(/expo/i)));

    // Priority-based detection
    if (fileContent.hasExpoConfig) {
      return this.getTemplate('expo-react-native');
    }

    if (fileContent.hasNextConfig) {
      return this.getTemplate('nextjs');
    }

    if (fileContent.hasSvelteConfig) {
      return this.getTemplate('svelte-vite');
    }

    if (fileContent.hasVueConfig || files.some(f => f.includes('.vue'))) {
      return this.getTemplate('vue-vite');
    }

    if (fileContent.hasBunLock) {
      return this.getTemplate('bun');
    }

    if (fileContent.hasViteConfig) {
      // Check if it's React or Vue
      if (files.some(f => f.includes('.tsx') || f.includes('.jsx'))) {
        return this.getTemplate('react-vite');
      }
      return this.getTemplate('react-vite'); // Default Vite to React
    }

    if (fileContent.hasRequirementsTxt || fileContent.hasPyprojectToml || fileContent.hasAppPy) {
      return this.getTemplate('python-fastapi');
    }

    if (fileContent.hasPackageJson) {
      // Check for Express indicators
      if (files.some(f => f.includes('server.') || f.includes('app.'))) {
        return this.getTemplate('express-api');
      }
      return this.getTemplate('react-vite'); // Default Node to React
    }

    if (fileContent.hasIndexHtml) {
      return this.getTemplate('static-html');
    }

    // Default to React + Vite
    return this.getTemplate('react-vite');
  }

  /**
   * Create Docker container config from template
   */
  createContainerConfig(
    template: ContainerTemplate,
    projectId: string,
    ports: { preview: number; pty: number }
  ): Docker.ContainerCreateOptions {
    // Build port bindings
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, object> = {};

    for (const port of template.ports) {
      const key = `${port.containerPort}/${port.protocol}`;
      exposedPorts[key] = {};

      // Map first required port to preview port
      if (port.required && !portBindings[key]) {
        portBindings[key] = [{ HostPort: String(ports.preview) }];
      }
    }

    // Always expose PTY port
    portBindings['9999/tcp'] = [{ HostPort: String(ports.pty) }];
    exposedPorts['9999/tcp'] = {};

    return {
      Image: template.image,
      Tty: true,
      OpenStdin: true,
      WorkingDir: template.workingDir,
      Labels: {
        'recoder.template': template.id,
        'recoder.project': projectId,
        'recoder.category': template.category,
      },
      Env: Object.entries({
        ...template.env,
        PORT: String(ports.preview),
        PTY_PORT: String(ports.pty),
        PROJECT_ID: projectId,
      }).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: template.resources.memory,
        MemorySwap: template.resources.memorySwap,
        CpuQuota: template.resources.cpuQuota,
        CpuPeriod: template.resources.cpuPeriod,
        PidsLimit: template.resources.pidsLimit,
        PortBindings: portBindings,
        SecurityOpt: ['no-new-privileges', 'seccomp=unconfined'],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
        ReadonlyRootfs: false,
        Ulimits: [
          { Name: 'nofile', Soft: 4096, Hard: 8192 },
          { Name: 'nproc', Soft: 128, Hard: 256 },
        ],
        Tmpfs: template.filesystem.tmpfs,
      },
      ExposedPorts: exposedPorts,
    };
  }

  /**
   * Get template statistics
   */
  getStats(): {
    totalTemplates: number;
    builtinTemplates: number;
    customTemplates: number;
    byCategory: Record<string, number>;
  } {
    const all = this.getAllTemplates();
    const byCategory: Record<string, number> = {};

    for (const template of all) {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;
    }

    return {
      totalTemplates: all.length,
      builtinTemplates: this.templates.size,
      customTemplates: this.customTemplates.size,
      byCategory,
    };
  }
}

// ==================== SINGLETON EXPORT ====================

export const templateManager = new TemplateManager();

export default templateManager;
