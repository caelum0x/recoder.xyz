import Docker from 'dockerode';
import http from 'http';
import { autoRestoreManager } from './auto-restore.js';

const docker = new Docker();

// ── Expo public hostname (set by server.ts at startup) ──────────────
let expoPublicHostname = process.env.PUBLIC_HOSTNAME || 'localhost';

/**
 * Set the public hostname used for Expo's REACT_NATIVE_PACKAGER_HOSTNAME.
 * Called from server.ts after detecting the external IP.
 */
export function setExpoPublicHostname(hostname: string): void {
  expoPublicHostname = hostname;
  console.log(`[DevServer] Expo public hostname set to: ${hostname}`);
}

interface DevServerInfo {
  projectId: string;
  pid?: number;
  port?: number;
  framework: string;
  startedAt: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

/**
 * Dev Server Manager - handles background dev server processes
 * Keeps dev server logs separate from interactive terminals
 */
export class DevServerManager {
  private servers = new Map<string, DevServerInfo>();

  /**
   * Start a dev server in background for a project
   */
  async start(
    containerId: string, 
    projectId: string, 
    framework: string = 'vite',
    ports: number[]
  ): Promise<{ ready: boolean; port?: number; logs?: string }> {
    const container = docker.getContainer(containerId);
    const command = this.getStartCommand(framework);

    console.log(`[DevServer] Starting ${framework} for project ${projectId}`);

    // Kill any existing dev server first
    try {
      const killPattern = this.getKillPattern(framework);
      await this.execCommand(container, `pkill -f "${killPattern}" || true`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {}

    // Ensure workspace directory exists
    await this.execCommand(container, 'mkdir -p /workspace');
    // Ensure log file exists so we can read errors even if startup fails early
    await this.execCommand(container, 'mkdir -p /tmp && : > /tmp/dev.log');

    // Start the dev server using setsid for proper daemonization
    // BROWSER=none prevents Vite from trying to open xdg-open (which doesn't exist in Docker)
    const startScript = `cd /workspace && BROWSER=none exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`;

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', startScript],
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
    });

    await exec.start({ Detach: true });

    this.servers.set(projectId, {
      projectId,
      framework,
      startedAt: Date.now(),
      status: 'starting',
    });

    console.log(`[DevServer] Process started for ${projectId}, waiting for ready...`);

    // Wait for server to be ready
    const healthCheck = await this.waitForReady(ports, 30000);

    if (healthCheck.ready) {
      const info = this.servers.get(projectId);
      if (info) {
        info.status = 'running';
        info.port = healthCheck.port;
      }
      console.log(`[DevServer] ✅ Ready on port ${healthCheck.port}`);
      return { ready: true, port: healthCheck.port };
    }

    // Check if there's an error
    const logs = await this.getLogs(containerId, projectId, 50);
    console.log(`[DevServer] ⚠️ Not ready yet, logs:\n${logs}`);

    return { ready: false, logs };
  }

  /**
   * Stop the dev server for a project
   */
  async stop(containerId: string, projectId: string): Promise<boolean> {
    const container = docker.getContainer(containerId);
    const info = this.servers.get(projectId);
    const framework = info?.framework || 'vite';

    try {
      const killPattern = this.getKillPattern(framework);
      await this.execCommand(container, `pkill -f "${killPattern}" || true`);
      this.servers.delete(projectId);
      console.log(`[DevServer] Stopped for ${projectId}`);
      return true;
    } catch (error: any) {
      console.error(`[DevServer] Failed to stop: ${error.message}`);
      return false;
    }
  }

  /**
   * Restart the dev server
   */
  async restart(containerId: string, projectId: string, ports: number[]): Promise<{ ready: boolean; port?: number }> {
    const info = this.servers.get(projectId);
    const framework = info?.framework || 'vite';
    
    await this.stop(containerId, projectId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.start(containerId, projectId, framework, ports);
  }

  /**
   * Register an externally-started server (e.g. Expo started via /api/expo-start)
   * so the manager knows the framework for log routing.
   */
  registerExternalServer(projectId: string, framework: string): void {
    if (!this.servers.has(projectId)) {
      this.servers.set(projectId, {
        projectId,
        framework,
        startedAt: Date.now(),
        status: 'running',
      });
    }
  }

  /**
   * Get dev server logs
   * @param source - optional hint: 'expo' reads /tmp/expo-dev.log
   */
  async getLogs(containerId: string, projectId: string, tail: number = 100, source?: string): Promise<string> {
    const container = docker.getContainer(containerId);

    // Determine the correct log file
    const isExpo = source === 'expo' || this.servers.get(projectId)?.framework === 'expo';
    const logFile = isExpo ? '/tmp/expo-dev.log' : '/tmp/dev.log';

    try {
      const logs = await this.execCommand(container, `tail -n ${tail} ${logFile} 2>/dev/null || echo "No logs found"`);

      // Check for errors and trigger auto-restore if needed
      const { hasError, errors, details } = autoRestoreManager.detectErrors(logs);
      if (hasError) {
        console.log(`[DevServer] Errors detected in ${projectId}:`, errors);
        if (details.length > 0) {
          console.log(`[DevServer] Error details:`, details[0]);
        }

        // Store error details for retrieval
        autoRestoreManager.setLastErrors(projectId, details.length > 0 ? details : errors);

        // Update dev server status to error state
        const info = this.servers.get(projectId);
        if (info) {
          info.status = 'error';
        }

        const result = await autoRestoreManager.attemptRestore(containerId, projectId);
        if (result.success) {
          console.log(`[DevServer] Auto-restored ${projectId} to ${result.restoredTo}`);
        } else if (result.error) {
          console.log(`[DevServer] Auto-restore failed: ${result.error}`);
        }
      } else {
        // Reset error count on successful build
        autoRestoreManager.resetErrors(projectId);

        // Update status to running if server is responding
        const info = this.servers.get(projectId);
        if (info && info.status === 'error') {
          info.status = 'running';
        }
      }

      return logs;
    } catch {
      return 'Failed to read logs';
    }
  }

  /**
   * Get detailed error info for a project
   */
  getErrorInfo(projectId: string): {
    hasErrors: boolean;
    errors: string[];
    retryState: {
      errorCount: number;
      maxRetries: number;
      canRetry: boolean;
      nextRetryIn?: number;
    };
  } {
    const state = autoRestoreManager.getState(projectId);
    return {
      hasErrors: state.lastErrors.length > 0,
      errors: state.lastErrors,
      retryState: {
        errorCount: state.errorCount,
        maxRetries: state.maxRetries,
        canRetry: state.canRetry,
        nextRetryIn: state.nextRetryIn,
      },
    };
  }

  /**
   * Force retry after max retries reached
   */
  async forceRetry(containerId: string, projectId: string, ports: number[]): Promise<{ ready: boolean; port?: number; error?: string }> {
    console.log(`[DevServer] Force retry requested for ${projectId}`);
    autoRestoreManager.forceReset(projectId);
    return this.restart(containerId, projectId, ports);
  }

  /**
   * Notify that user made a file change (gives more retry attempts)
   */
  onFileChange(projectId: string): void {
    autoRestoreManager.resetOnFileChange(projectId);
  }

  /**
   * Stream logs via WebSocket
   */
  async streamLogs(containerId: string, projectId: string, onData: (data: string) => void): Promise<() => void> {
    const container = docker.getContainer(containerId);
    let running = true;
    let lastPosition = 0;
    const isExpo = this.servers.get(projectId)?.framework === 'expo';
    const logFile = isExpo ? '/tmp/expo-dev.log' : '/tmp/dev.log';

    const poll = async () => {
      while (running) {
        try {
          const logs = await this.execCommand(container, `tail -c +${lastPosition + 1} ${logFile} 2>/dev/null || true`);
          if (logs.length > 0) {
            lastPosition += logs.length;
            onData(logs);
          }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    poll();

    return () => { running = false; };
  }

  /**
   * Get status of dev server
   */
  getStatus(projectId: string): DevServerInfo | undefined {
    return this.servers.get(projectId);
  }

  /**
   * Check if dev server is running
   */
  isRunning(projectId: string): boolean {
    const info = this.servers.get(projectId);
    return info?.status === 'running';
  }

  private getStartCommand(framework: string): string {
    // Prefer bun for 10x faster startup for Node.js projects
    const commands: Record<string, string> = {
      // Node.js frameworks
      vite: 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
      next: 'bun run dev -- --hostname 0.0.0.0 2>/dev/null || npm run dev -- --hostname 0.0.0.0',
      react: 'bun start 2>/dev/null || npm start',
      vue: 'bun run serve 2>/dev/null || npm run serve',
      bun: 'bun run dev',
      // REACT_NATIVE_PACKAGER_HOSTNAME: hostname for QR codes/connection URLs (container IP is unreachable from phones)
      // EXPO_DEVTOOLS_LISTEN_ADDRESS: allow connections from outside the container
      // BROWSER=none: don't try to open a browser inside the container
      // CI=1: prevent interactive prompts that would hang in a container
      // Supports both web and native (Expo Go) — no --web flag so Metro serves both
      expo: `REACT_NATIVE_PACKAGER_HOSTNAME=${expoPublicHostname} EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 BROWSER=none CI=1 npx expo start --host 0.0.0.0 --port 8081`,

      // Python frameworks
      flask: 'python -m flask run --host=0.0.0.0 --port=5173',
      django: 'python manage.py runserver 0.0.0.0:5173',
      fastapi: 'uvicorn main:app --host 0.0.0.0 --port 5173 --reload',
      python: 'python main.py',

      // Rust
      rust: 'cargo run',

      // Go
      go: 'go run .',

      // Java
      'java-spring': 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8080',
      java: 'mvn exec:java',
    };
    return commands[framework] || 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0';
  }

  /**
   * Get the kill pattern for a framework's dev server process
   */
  private getKillPattern(framework: string): string {
    const patterns: Record<string, string> = {
      // Node.js
      vite: 'npm run dev|vite|bun run dev',
      next: 'next dev',
      react: 'react-scripts start',
      vue: 'vue-cli-service serve',
      expo: 'expo start|metro',

      // Python
      flask: 'flask run|python.*flask',
      django: 'manage.py runserver',
      fastapi: 'uvicorn',
      python: 'python main.py',

      // Rust
      rust: 'cargo run|target/debug',

      // Go
      go: 'go run',

      // Java
      'java-spring': 'spring-boot:run|java.*-jar',
      java: 'mvn exec:java|java.*-jar',
    };
    return patterns[framework] || 'npm run dev|vite|next dev|bun run dev';
  }

  private async waitForReady(ports: number[], maxWaitMs: number = 60000): Promise<{ ready: boolean; port?: number }> {
    const startTime = Date.now();
    const checkInterval = 1000;

    console.log(`[DevServer] Waiting for ready on ports: ${ports.join(', ')}`);

    while (Date.now() - startTime < maxWaitMs) {
      for (const port of ports) {
        try {
          const isReady = await new Promise<boolean>((resolve) => {
            const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
              resolve(res.statusCode !== undefined && res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
          });

          if (isReady) {
            return { ready: true, port };
          }
        } catch {}
      }

      const elapsed = Date.now() - startTime;
      if (elapsed % 5000 < checkInterval) {
        console.log(`[DevServer] Still waiting... (${Math.round(elapsed / 1000)}s elapsed)`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return { ready: false };
  }

  private async execCommand(container: Docker.Container, cmd: string): Promise<string> {
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    const output = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (chunk: Buffer) => {
        out += chunk.slice(8).toString();
      });
      stream.on('end', () => resolve(out.trim()));
      stream.on('error', reject);
    });

    return output;
  }
}

// Export singleton instance
export const devServerManager = new DevServerManager();

/**
 * Auto-detect framework from project files in a container
 * Returns the detected framework name or 'unknown'
 */
export async function detectFrameworkFromContainer(containerId: string): Promise<string> {
  const docker = new Docker();
  const container = docker.getContainer(containerId);
  
  const execCommand = async (cmd: string): Promise<string> => {
    try {
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({});
      return new Promise((resolve) => {
        let out = '';
        stream.on('data', (chunk: Buffer) => { out += chunk.slice(8).toString(); });
        stream.on('end', () => resolve(out.trim()));
        stream.on('error', () => resolve(''));
      });
    } catch {
      return '';
    }
  };
  
  // Check for package.json (Node.js projects)
  const packageJson = await execCommand('cat /workspace/package.json 2>/dev/null');
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Framework detection order matters - more specific first
      if (deps['next']) return 'next';
      if (deps['expo'] || deps['react-native']) return 'expo';
      if (deps['nuxt']) return 'nuxt';
      if (deps['@sveltejs/kit']) return 'sveltekit';
      if (deps['svelte']) return 'svelte';
      if (deps['@angular/core']) return 'angular';
      if (deps['vue']) return 'vue';
      if (deps['vite']) return 'vite';
      if (deps['react']) return 'react';
      if (deps['express'] || deps['fastify'] || deps['koa']) return 'node-server';
      return 'node';
    } catch {}
  }
  
  // Check for Python projects
  const requirements = await execCommand('cat /workspace/requirements.txt 2>/dev/null');
  const pyproject = await execCommand('cat /workspace/pyproject.toml 2>/dev/null');
  const pipfile = await execCommand('cat /workspace/Pipfile 2>/dev/null');
  
  if (requirements || pyproject || pipfile) {
    const pythonDeps = (requirements + pyproject + pipfile).toLowerCase();
    if (pythonDeps.includes('django')) return 'django';
    if (pythonDeps.includes('flask')) return 'flask';
    if (pythonDeps.includes('fastapi')) return 'fastapi';
    if (pythonDeps.includes('streamlit')) return 'streamlit';
    if (pythonDeps.includes('gradio')) return 'gradio';
    return 'python';
  }
  
  // Check for Rust projects
  const cargoToml = await execCommand('cat /workspace/Cargo.toml 2>/dev/null');
  if (cargoToml) {
    if (cargoToml.includes('actix') || cargoToml.includes('rocket') || cargoToml.includes('axum')) {
      return 'rust-web';
    }
    return 'rust';
  }
  
  // Check for Go projects
  const goMod = await execCommand('cat /workspace/go.mod 2>/dev/null');
  if (goMod) {
    if (goMod.includes('gin') || goMod.includes('echo') || goMod.includes('fiber')) {
      return 'go-web';
    }
    return 'go';
  }
  
  // Check for Java projects
  const pomXml = await execCommand('cat /workspace/pom.xml 2>/dev/null');
  const buildGradle = await execCommand('cat /workspace/build.gradle 2>/dev/null');
  if (pomXml || buildGradle) {
    const javaConfig = pomXml + buildGradle;
    if (javaConfig.includes('spring-boot')) return 'java-spring';
    return 'java';
  }
  
  // Check for static HTML
  const indexHtml = await execCommand('ls /workspace/index.html 2>/dev/null');
  if (indexHtml) return 'static';
  
  return 'unknown';
}

/**
 * Get the install command for a detected framework
 */
export function getInstallCommand(framework: string): string {
  const commands: Record<string, string> = {
    // Node.js - prefer bun for speed
    'node': 'bun install 2>/dev/null || npm install',
    'vite': 'bun install 2>/dev/null || npm install',
    'next': 'bun install 2>/dev/null || npm install',
    'react': 'bun install 2>/dev/null || npm install',
    'vue': 'bun install 2>/dev/null || npm install',
    'svelte': 'bun install 2>/dev/null || npm install',
    'sveltekit': 'bun install 2>/dev/null || npm install',
    'angular': 'npm install', // Angular has issues with bun
    'nuxt': 'bun install 2>/dev/null || npm install',
    'expo': 'bun install 2>/dev/null || npm install',
    'node-server': 'bun install 2>/dev/null || npm install',
    
    // Python
    'python': 'pip install -r requirements.txt 2>/dev/null || pip install -e . 2>/dev/null || echo "No deps"',
    'flask': 'pip install -r requirements.txt 2>/dev/null || pip install flask',
    'django': 'pip install -r requirements.txt 2>/dev/null || pip install django',
    'fastapi': 'pip install -r requirements.txt 2>/dev/null || pip install fastapi uvicorn',
    'streamlit': 'pip install -r requirements.txt 2>/dev/null || pip install streamlit',
    'gradio': 'pip install -r requirements.txt 2>/dev/null || pip install gradio',
    
    // Rust
    'rust': 'cargo build',
    'rust-web': 'cargo build',
    
    // Go
    'go': 'go mod download',
    'go-web': 'go mod download',
    
    // Java
    'java': 'mvn dependency:resolve 2>/dev/null || gradle dependencies 2>/dev/null || echo "No deps"',
    'java-spring': 'mvn dependency:resolve 2>/dev/null || gradle dependencies 2>/dev/null || echo "No deps"',
    
    // Static - no install needed
    'static': 'echo "Static site, no install needed"',
  };
  
  return commands[framework] || commands['node'];
}

/**
 * Get the dev server start command for a detected framework
 */
export function getDevCommand(framework: string): string {
  const commands: Record<string, string> = {
    // Node.js frameworks
    'node': 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
    'vite': 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
    'next': 'bun run dev 2>/dev/null || npm run dev',
    'react': 'bun start 2>/dev/null || npm start',
    'vue': 'bun run serve 2>/dev/null || npm run serve',
    'svelte': 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
    'sveltekit': 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
    'angular': 'npm start -- --host 0.0.0.0',
    'nuxt': 'bun run dev 2>/dev/null || npm run dev',
    'expo': `REACT_NATIVE_PACKAGER_HOSTNAME=${expoPublicHostname} EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 BROWSER=none CI=1 npx expo start --host 0.0.0.0 --port 8081`,
    'node-server': 'bun run start 2>/dev/null || npm start || node index.js || node server.js',
    
    // Python frameworks
    'python': 'python main.py 2>/dev/null || python app.py 2>/dev/null || python server.py',
    'flask': 'flask run --host=0.0.0.0 --port=5173 2>/dev/null || python -m flask run --host=0.0.0.0 --port=5173',
    'django': 'python manage.py runserver 0.0.0.0:5173',
    'fastapi': 'uvicorn main:app --host 0.0.0.0 --port 5173 --reload 2>/dev/null || uvicorn app:app --host 0.0.0.0 --port 5173 --reload',
    'streamlit': 'streamlit run app.py --server.address 0.0.0.0 --server.port 5173',
    'gradio': 'python app.py',
    
    // Rust
    'rust': 'cargo run',
    'rust-web': 'cargo run',
    
    // Go
    'go': 'go run .',
    'go-web': 'go run .',
    
    // Java
    'java': 'mvn exec:java 2>/dev/null || gradle run 2>/dev/null || java -jar target/*.jar',
    'java-spring': 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8080 2>/dev/null || gradle bootRun',
    
    // Static - use simple HTTP server
    'static': 'npx serve -l 5173 2>/dev/null || python -m http.server 5173',
  };
  
  return commands[framework] || commands['vite'];
}

/**
 * Get expected ports for a framework
 */
export function getExpectedPorts(framework: string, basePorts: number[]): number[] {
  // Some frameworks have specific default ports
  const defaultPorts: Record<string, number[]> = {
    'next': [3000],
    'react': [3000],
    'angular': [4200],
    'expo': [8081, 19000, 19001],
    'django': [5173, 8000],
    'flask': [5173, 5000],
    'fastapi': [5173, 8000],
    'streamlit': [5173, 8501],
    'java-spring': [8080],
  };
  
  const frameworkPorts = defaultPorts[framework] || [];
  return [...new Set([...basePorts, ...frameworkPorts])];
}
