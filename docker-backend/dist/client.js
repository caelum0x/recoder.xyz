"use strict";
/**
 * Docker Backend Client SDK
 * Use this from Recoder Spaces surfaces to connect to Docker backend.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerClient = void 0;
exports.createDockerClient = createDockerClient;
class DockerClient {
    baseUrl;
    projectId;
    containerId = null;
    terminalWs = null;
    syncWs = null;
    constructor(config, projectId) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.projectId = projectId;
    }
    // Initialize container
    async init() {
        const res = await fetch(`${this.baseUrl}/api/container`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: this.projectId }),
        });
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'Init failed');
        this.containerId = data.containerId || null;
        return this.containerId || '';
    }
    // Write file
    async writeFile(path, content) {
        const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: `/workspace${path}`, content }),
        });
        if (!res.ok) {
            const data = (await res.json());
            throw new Error(data.error || 'Write failed');
        }
    }
    // Read file
    async readFile(path) {
        const res = await fetch(`${this.baseUrl}/api/file/${this.projectId}?path=/workspace${path}`);
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'Read failed');
        return data.content || '';
    }
    // List files
    async listFiles(path = '/') {
        const res = await fetch(`${this.baseUrl}/api/files/${this.projectId}?path=/workspace${path}`);
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'List failed');
        return (data.files || []).map((f) => f.replace('/workspace', ''));
    }
    // Execute command
    async exec(command, cwd = '/') {
        const res = await fetch(`${this.baseUrl}/api/exec/${this.projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, cwd: `/workspace${cwd}` }),
        });
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'Exec failed');
        return data.output || '';
    }
    // Connect terminal (returns WebSocket)
    connectTerminal(onData) {
        const wsUrl = this.baseUrl.replace('http', 'ws');
        this.terminalWs = new WebSocket(`${wsUrl}/terminal/${this.projectId}`);
        this.terminalWs.onmessage = (e) => onData(e.data);
        this.terminalWs.onerror = (e) => console.error('Terminal WS error:', e);
        return {
            write: (data) => this.terminalWs?.send(data),
            close: () => this.terminalWs?.close(),
        };
    }
    // Real-time file sync
    connectSync(onEvent) {
        const wsUrl = this.baseUrl.replace('http', 'ws');
        this.syncWs = new WebSocket(`${wsUrl}/sync/${this.projectId}`);
        this.syncWs.onmessage = (e) => onEvent(JSON.parse(e.data));
        this.syncWs.onerror = (e) => console.error('Sync WS error:', e);
        const send = (msg) => {
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
    async destroy() {
        this.terminalWs?.close();
        this.syncWs?.close();
        await fetch(`${this.baseUrl}/api/container/${this.projectId}`, { method: 'DELETE' });
    }
}
exports.DockerClient = DockerClient;
// Factory function
function createDockerClient(baseUrl, projectId) {
    return new DockerClient({ baseUrl }, projectId);
}
