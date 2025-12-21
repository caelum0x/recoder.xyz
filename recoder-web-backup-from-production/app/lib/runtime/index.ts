/**
 * Unified Runtime - Switches between WebContainer and Docker
 */

import { WORK_DIR_NAME } from '~/utils/constants';

export type RuntimeMode = 'webcontainer' | 'docker';

interface RuntimeContext {
  mode: RuntimeMode;
  ready: boolean;
  projectId: string | null;
  dockerUrl: string | null;
}

// Runtime state
export const runtimeContext: RuntimeContext = {
  mode: (import.meta.env.VITE_RUNTIME_MODE as RuntimeMode) || 'webcontainer',
  ready: false,
  projectId: null,
  dockerUrl: import.meta.env.VITE_DOCKER_BACKEND_URL || null,
};

// WebContainer instance (for webcontainer mode) - lazy loaded
let wcInstance: any = null;
let wcPromise: Promise<any> | null = null;
let WebContainerClass: any = null;

// Docker WebSocket connections
let terminalWs: WebSocket | null = null;
let syncWs: WebSocket | null = null;

/**
 * Initialize runtime with project ID
 */
export async function initRuntime(projectId: string): Promise<void> {
  runtimeContext.projectId = projectId;

  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    // Initialize Docker container
    const res = await fetch(`${runtimeContext.dockerUrl}/api/container`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Docker init failed');
    }
    runtimeContext.ready = true;
  } else {
    // Initialize WebContainer
    runtimeContext.mode = 'webcontainer';
    await getWebContainer();
    runtimeContext.ready = true;
  }
}

/**
 * Get WebContainer instance (boots if needed) - lazy loads WebContainer API
 */
export async function getWebContainer(): Promise<any> {
  if (runtimeContext.mode === 'docker') {
    throw new Error('WebContainer not available in Docker mode');
  }
  
  if (wcInstance) return wcInstance;

  if (!wcPromise) {
    wcPromise = (async () => {
      if (!WebContainerClass) {
        const mod = await import('@webcontainer/api');
        WebContainerClass = mod.WebContainer;
      }
      return WebContainerClass.boot({ workdirName: WORK_DIR_NAME });
    })();
  }

  wcInstance = await wcPromise;
  return wcInstance;
}

/**
 * Write file to runtime
 */
export async function writeFile(path: string, content: string): Promise<void> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const res = await fetch(`${runtimeContext.dockerUrl}/api/file/${runtimeContext.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/workspace${path}`, content }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Write failed');
    }
  } else {
    const wc = await getWebContainer();
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      await wc.fs.mkdir(dir, { recursive: true });
    }
    await wc.fs.writeFile(path, content);
  }
}

/**
 * Batch write multiple files at once (much faster for Docker mode)
 */
export async function writeFilesBatch(files: Array<{ path: string; content: string }>): Promise<void> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const res = await fetch(`${runtimeContext.dockerUrl}/api/files/${runtimeContext.projectId}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        files: files.map(f => ({ path: `/workspace${f.path}`, content: f.content }))
      }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Batch write failed');
    }
  } else {
    // WebContainer: write files individually (already fast)
    const wc = await getWebContainer();
    for (const file of files) {
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      if (dir) {
        await wc.fs.mkdir(dir, { recursive: true });
      }
      await wc.fs.writeFile(file.path, file.content);
    }
  }
}

/**
 * Read file from runtime
 */
export async function readFile(path: string): Promise<string> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const res = await fetch(`${runtimeContext.dockerUrl}/api/file/${runtimeContext.projectId}?path=/workspace${path}`);
    const data = await res.json() as { content?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Read failed');
    return data.content || '';
  } else {
    const wc = await getWebContainer();
    return await wc.fs.readFile(path, 'utf-8');
  }
}

/**
 * List directory contents
 */
export async function readdir(path: string): Promise<string[]> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const res = await fetch(`${runtimeContext.dockerUrl}/api/files/${runtimeContext.projectId}?path=/workspace${path}`);
    const data = await res.json() as { files?: string[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'List failed');
    return (data.files || []).map((f: string) => f.replace('/workspace', ''));
  } else {
    const wc = await getWebContainer();
    return await wc.fs.readdir(path);
  }
}

/**
 * Create directory
 */
export async function mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    await exec(`mkdir -p "${path}"`);
  } else {
    const wc = await getWebContainer();
    if (options?.recursive) {
      await wc.fs.mkdir(path, { recursive: true });
    } else {
      await wc.fs.mkdir(path);
    }
  }
}

/**
 * Remove file or directory
 */
export async function rm(path: string, options?: { recursive?: boolean }): Promise<void> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const flag = options?.recursive ? '-rf' : '-f';
    await exec(`rm ${flag} "${path}"`);
  } else {
    const wc = await getWebContainer();
    await wc.fs.rm(path, options);
  }
}

/**
 * Execute command and return output
 */
export async function exec(command: string, cwd: string = '/'): Promise<string> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const res = await fetch(`${runtimeContext.dockerUrl}/api/exec/${runtimeContext.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: `/workspace${cwd}` }),
    });
    const data = (await res.json()) as { output?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Exec failed');
    return data.output || '';
  } else {
    const wc = await getWebContainer();
    const [cmd, ...args] = command.split(' ');
    const process = await wc.spawn(cmd, args, { cwd });
    let output = '';
    const writer = new WritableStream({ write(chunk) { output += chunk; } });
    await process.output.pipeTo(writer);
    await process.exit;
    return output;
  }
}

/**
 * Spawn process with streaming output
 */
export async function spawn(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> }
): Promise<{
  output: ReadableStream<string>;
  exit: Promise<number>;
  kill: () => void;
}> {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    // For Docker, we use exec and convert to stream
    const fullCmd = `${command} ${args.join(' ')}`;
    const output = await exec(fullCmd, options?.cwd);

    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    });

    return {
      output: stream,
      exit: Promise.resolve(0),
      kill: () => {},
    };
  } else {
    const wc = await getWebContainer();
    const process = await wc.spawn(command, args, options);
    return {
      output: process.output,
      exit: process.exit,
      kill: () => process.kill(),
    };
  }
}

/**
 * Connect terminal
 */
export function connectTerminal(onData: (data: string) => void): {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
} {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    const wsUrl = runtimeContext.dockerUrl.replace('http', 'ws');
    terminalWs = new WebSocket(`${wsUrl}/terminal/${runtimeContext.projectId}`);

    terminalWs.onmessage = (e) => onData(e.data);
    terminalWs.onerror = (e) => console.error('Terminal WS error:', e);

    return {
      write: (data) => terminalWs?.send(data),
      resize: () => {}, // Docker doesn't support resize yet
      close: () => terminalWs?.close(),
    };
  } else {
    // WebContainer terminal handled separately via shell.ts
    return {
      write: () => {},
      resize: () => {},
      close: () => {},
    };
  }
}

/**
 * Get preview URL
 */
export function getPreviewUrl(port: number = 3000): string {
  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl) {
    return `${runtimeContext.dockerUrl}/preview/${runtimeContext.projectId}`;
  } else {
    // WebContainer uses its own preview mechanism
    return '';
  }
}

/**
 * Destroy runtime (cleanup)
 */
export async function destroyRuntime(): Promise<void> {
  terminalWs?.close();
  syncWs?.close();

  if (runtimeContext.mode === 'docker' && runtimeContext.dockerUrl && runtimeContext.projectId) {
    await fetch(`${runtimeContext.dockerUrl}/api/container/${runtimeContext.projectId}`, {
      method: 'DELETE',
    });
  }

  runtimeContext.ready = false;
  runtimeContext.projectId = null;
}

/**
 * Check if Docker backend is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  if (!runtimeContext.dockerUrl) return false;

  try {
    const res = await fetch(`${runtimeContext.dockerUrl}/health`, { 
      signal: AbortSignal.timeout(3000) 
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Switch runtime mode
 */
export async function setRuntimeMode(mode: RuntimeMode): Promise<void> {
  if (mode === 'docker') {
    const available = await isDockerAvailable();
    if (!available) {
      console.warn('Docker backend not available, staying on WebContainer');
      return;
    }
  }
  runtimeContext.mode = mode;
}

// Export for backward compatibility
export { wcPromise as webcontainer };
