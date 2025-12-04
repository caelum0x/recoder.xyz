/**
 * Docker Backend Client SDK
 * Use this in recoder-web to connect to Docker backend
 */

export interface DockerClientConfig {
  baseUrl: string;
}

interface ApiResponse {
  containerId?: string;
  content?: string;
  files?: string[];
  output?: string;
  error?: string;
}

export class DockerClient {
  private baseUrl: string;
  private projectId: string;
  private containerId: string | null = null;
  private terminalWs: WebSocket | null = null;
  private syncWs: WebSocket | null = null;

  constructor(config: DockerClientConfig, projectId: string) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.projectId = projectId;
  }

  // Initialize container
  async init(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/container`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.projectId }),
    });
    const data = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(data.error || 'Init failed');
    this.containerId = data.containerId || null;
    return this.containerId || '';
  }

  // Write file
  async writeFile(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/workspace${path}`, content }),
    });
    if (!res.ok) {
      const data = (await res.json()) as ApiResponse;
      throw new Error(data.error || 'Write failed');
    }
  }

  // Read file
  async readFile(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}?path=/workspace${path}`);
    const data = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(data.error || 'Read failed');
    return data.content || '';
  }

  // List files
  async listFiles(path: string = '/'): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/files/${this.projectId}?path=/workspace${path}`);
    const data = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(data.error || 'List failed');
    return (data.files || []).map((f: string) => f.replace('/workspace', ''));
  }

  // Execute command
  async exec(command: string, cwd: string = '/'): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/exec/${this.projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: `/workspace${cwd}` }),
    });
    const data = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(data.error || 'Exec failed');
    return data.output || '';
  }

  // Connect terminal (returns WebSocket)
  connectTerminal(onData: (data: string) => void): { write: (data: string) => void; close: () => void } {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    this.terminalWs = new WebSocket(`${wsUrl}/terminal/${this.projectId}`);

    this.terminalWs.onmessage = (e) => onData(e.data);
    this.terminalWs.onerror = (e) => console.error('Terminal WS error:', e);

    return {
      write: (data: string) => this.terminalWs?.send(data),
      close: () => this.terminalWs?.close(),
    };
  }

  // Real-time file sync
  connectSync(onEvent: (event: Record<string, unknown>) => void): {
    write: (path: string, content: string) => void;
    read: (path: string) => void;
    list: (path?: string) => void;
    delete: (path: string) => void;
    close: () => void;
  } {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    this.syncWs = new WebSocket(`${wsUrl}/sync/${this.projectId}`);

    this.syncWs.onmessage = (e) => onEvent(JSON.parse(e.data));
    this.syncWs.onerror = (e) => console.error('Sync WS error:', e);

    const send = (msg: Record<string, unknown>) => {
      if (this.syncWs?.readyState === WebSocket.OPEN) {
        this.syncWs.send(JSON.stringify(msg));
      }
    };

    return {
      write: (path, content) => send({ action: 'write', path: `/workspace${path}`, content }),
      read: (path) => send({ action: 'read', path: `/workspace${path}` }),
      list: (path = '/') => send({ action: 'list', path: `/workspace${path}` }),
      delete: (path) => send({ action: 'delete', path: `/workspace${path}` }),
      close: () => this.syncWs?.close(),
    };
  }

  // Destroy container
  async destroy(): Promise<void> {
    this.terminalWs?.close();
    this.syncWs?.close();
    await fetch(`${this.baseUrl}/api/container/${this.projectId}`, { method: 'DELETE' });
  }
}

// Factory function
export function createDockerClient(baseUrl: string, projectId: string): DockerClient {
  return new DockerClient({ baseUrl }, projectId);
}
