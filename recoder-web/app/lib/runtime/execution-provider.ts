/**
 * Execution Provider Abstraction
 * Switches between WebContainer (free) and Docker (production)
 */

import { getSessionToken } from '~/lib/services/docker-api';

export interface ExecutionProvider {
  init(): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  listFiles(path?: string): Promise<string[]>;
  exec(command: string, cwd?: string): Promise<string>;
  spawn(command: string, args: string[], cwd?: string): Promise<{
    output: ReadableStream<string>;
    exit: Promise<number>;
  }>;
  connectTerminal(onData: (data: string) => void): {
    write: (data: string) => void;
    resize?: (cols: number, rows: number) => void;
    close: () => void;
  };
  destroy(): Promise<void>;
}

// Docker Backend Provider
export class DockerProvider implements ExecutionProvider {
  private baseUrl: string;
  private projectId: string;
  private userId?: string;
  private terminalWs: WebSocket | null = null;

  constructor(baseUrl: string, projectId: string, userId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.projectId = projectId;
    this.userId = userId;
  }

  async init(): Promise<void> {
    const { ensureContainerExists } = await import('~/lib/stores/workbench');
    const ready = await ensureContainerExists(this.projectId);
    if (!ready) {
      throw new Error('Init failed');
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = getSessionToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ path: `/workspace${path}`, content }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Write failed');
    }
  }

  async readFile(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}?path=/workspace${path}`, {
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    const data = await res.json() as { content?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Read failed');
    return data.content || '';
  }

  async listFiles(path: string = '/'): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/files/${this.projectId}?path=/workspace${path}`, {
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    const data = await res.json() as { files?: string[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'List failed');
    return (data.files || []).map((f: string) => f.replace('/workspace', ''));
  }

  async exec(command: string, cwd: string = '/'): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/exec/${this.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ command, cwd: `/workspace${cwd}` }),
    });
    const data = await res.json() as { output?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Exec failed');
    return data.output || '';
  }

  async spawn(command: string, args: string[], cwd: string = '/'): Promise<{
    output: ReadableStream<string>;
    exit: Promise<number>;
  }> {
    const fullCmd = `${command} ${args.join(' ')}`;
    const output = await this.exec(fullCmd, cwd);
    
    // Convert to stream for compatibility
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      }
    });

    return { output: stream, exit: Promise.resolve(0) };
  }

  connectTerminal(onData: (data: string) => void) {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    // Include auth token for cross-origin authentication
    const token = getSessionToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    this.terminalWs = new WebSocket(`${wsUrl}/terminal/${this.projectId}${tokenParam}`);
    
    this.terminalWs.onmessage = (e) => onData(e.data);
    this.terminalWs.onerror = (e) => console.error('Terminal error:', e);

    return {
      write: (data: string) => this.terminalWs?.send(data),
      close: () => this.terminalWs?.close(),
    };
  }

  async destroy(): Promise<void> {
    this.terminalWs?.close();
    await fetch(`${this.baseUrl}/api/container/${this.projectId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
  }
}

// WebContainer Provider (existing)
export class WebContainerProvider implements ExecutionProvider {
  private wc: any; // WebContainer instance

  constructor(private getWebContainer: () => Promise<any>) {}

  async init(): Promise<void> {
    this.wc = await this.getWebContainer();
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.wc.fs.writeFile(path, content);
  }

  async readFile(path: string): Promise<string> {
    return await this.wc.fs.readFile(path, 'utf-8');
  }

  async listFiles(path: string = '/'): Promise<string[]> {
    return await this.wc.fs.readdir(path);
  }

  async exec(command: string, cwd?: string): Promise<string> {
    const [cmd, ...args] = command.split(' ');
    const process = await this.wc.spawn(cmd, args, { cwd });
    let output = '';
    process.output.pipeTo(new WritableStream({
      write(chunk) { output += chunk; }
    }));
    await process.exit;
    return output;
  }

  async spawn(command: string, args: string[], cwd?: string) {
    const process = await this.wc.spawn(command, args, { cwd });
    return {
      output: process.output,
      exit: process.exit,
    };
  }

  connectTerminal(onData: (data: string) => void) {
    // WebContainer terminal is handled differently
    // This is a simplified version
    return {
      write: (_data: string) => {},
      close: () => {},
    };
  }

  async destroy(): Promise<void> {
    // WebContainer doesn't need explicit cleanup
  }
}

// Factory
export function createExecutionProvider(
  mode: 'docker' | 'webcontainer',
  projectId: string,
  options: { dockerUrl?: string; getWebContainer?: () => Promise<any>; userId?: string }
): ExecutionProvider {
  if (mode === 'docker') {
    let url = options.dockerUrl || import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && url.includes('localhost')) {
      url = 'https://docker.recoder.xyz';
    }
    return new DockerProvider(url, projectId, options.userId);
  }
  
  if (!options.getWebContainer) {
    throw new Error('getWebContainer required for webcontainer mode');
  }
  return new WebContainerProvider(options.getWebContainer);
}

// Auto-detect best provider
export function detectExecutionMode(): 'docker' | 'webcontainer' {
  // Use Docker if configured
  if (import.meta.env.VITE_DOCKER_BACKEND_URL) {
    return 'docker';
  }
  
  // Use Docker if WebContainer is known to be broken
  if (typeof window !== 'undefined' && (window as any).__WEBCONTAINER_BROKEN__) {
    return 'docker';
  }
  
  // Default to WebContainer for now
  return 'webcontainer';
}
