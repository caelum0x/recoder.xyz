"use strict";
/**
 * MCP Server Manager for Docker Backend
 * Spawns and manages MCP servers inside user containers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NPX_SERVERS = exports.PREINSTALLED_SERVERS = exports.mcpManager = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
// Idle timeout - kill servers after 5 minutes of inactivity
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
// Max servers per project
const MAX_SERVERS_PER_PROJECT = 3;
class MCPManager extends events_1.EventEmitter {
    // Map of projectId -> serverId -> MCPServerInstance
    servers = new Map();
    idleCheckInterval = null;
    constructor() {
        super();
        // Start idle check timer
        this.idleCheckInterval = setInterval(() => this.checkIdleServers(), 60000);
    }
    /**
     * Start an MCP server for a project
     */
    async startServer(projectId, config) {
        // Get or create project's server map
        if (!this.servers.has(projectId)) {
            this.servers.set(projectId, new Map());
        }
        const projectServers = this.servers.get(projectId);
        // Check if already running
        if (projectServers.has(config.id)) {
            const existing = projectServers.get(config.id);
            if (existing.status === 'running') {
                existing.lastActivity = Date.now();
                return { success: true, tools: existing.tools };
            }
        }
        // Check max servers limit
        const runningCount = Array.from(projectServers.values()).filter(s => s.status === 'running').length;
        if (runningCount >= MAX_SERVERS_PER_PROJECT) {
            return { success: false, error: `Maximum ${MAX_SERVERS_PER_PROJECT} MCP servers per project` };
        }
        console.log(`[MCP] Starting server ${config.id} for project ${projectId}`);
        // Create server instance
        const instance = {
            config,
            process: null,
            status: 'starting',
            tools: [],
            lastActivity: Date.now(),
            pendingRequests: new Map(),
            requestId: 0,
            buffer: '',
        };
        projectServers.set(config.id, instance);
        try {
            // Spawn the MCP server process
            const env = {
                ...process.env,
                ...config.env,
                // Ensure proper Node environment
                NODE_ENV: 'production',
            };
            const proc = (0, child_process_1.spawn)(config.command, config.args, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
            });
            instance.process = proc;
            // Handle stdout (JSON-RPC responses)
            proc.stdout?.on('data', (data) => {
                instance.buffer += data.toString();
                this.processBuffer(projectId, config.id, instance);
            });
            // Handle stderr (logging)
            proc.stderr?.on('data', (data) => {
                console.log(`[MCP:${config.id}] stderr:`, data.toString().trim());
            });
            // Handle process exit
            proc.on('exit', (code) => {
                console.log(`[MCP] Server ${config.id} exited with code ${code}`);
                instance.status = 'stopped';
                instance.process = null;
                // Reject any pending requests
                for (const [, req] of instance.pendingRequests) {
                    req.reject(new Error('MCP server exited'));
                }
                instance.pendingRequests.clear();
            });
            proc.on('error', (err) => {
                console.error(`[MCP] Server ${config.id} error:`, err.message);
                instance.status = 'error';
            });
            // Wait for initialization and discover tools
            await this.waitForReady(instance, 10000);
            // Initialize the MCP protocol
            await this.sendRequest(instance, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'recoder-docker', version: '1.0.0' },
            });
            // Send initialized notification
            this.sendNotification(instance, 'notifications/initialized', {});
            // Discover tools
            const toolsResponse = await this.sendRequest(instance, 'tools/list', {});
            instance.tools = (toolsResponse.tools || []).map((tool) => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema || {},
                serverId: config.id,
            }));
            instance.status = 'running';
            console.log(`[MCP] Server ${config.id} started with ${instance.tools.length} tools`);
            return { success: true, tools: instance.tools };
        }
        catch (error) {
            console.error(`[MCP] Failed to start server ${config.id}:`, error.message);
            instance.status = 'error';
            this.stopServer(projectId, config.id);
            return { success: false, error: error.message };
        }
    }
    /**
     * Stop an MCP server
     */
    async stopServer(projectId, serverId) {
        const projectServers = this.servers.get(projectId);
        if (!projectServers)
            return;
        const instance = projectServers.get(serverId);
        if (!instance)
            return;
        console.log(`[MCP] Stopping server ${serverId} for project ${projectId}`);
        if (instance.process) {
            instance.process.kill('SIGTERM');
            // Force kill after 5 seconds
            setTimeout(() => {
                if (instance.process) {
                    instance.process.kill('SIGKILL');
                }
            }, 5000);
        }
        projectServers.delete(serverId);
        if (projectServers.size === 0) {
            this.servers.delete(projectId);
        }
    }
    /**
     * Stop all servers for a project
     */
    async stopAllServers(projectId) {
        const projectServers = this.servers.get(projectId);
        if (!projectServers)
            return;
        const serverIds = Array.from(projectServers.keys());
        for (const serverId of serverIds) {
            await this.stopServer(projectId, serverId);
        }
    }
    /**
     * Call a tool on an MCP server
     */
    async callTool(projectId, serverId, toolName, args) {
        const projectServers = this.servers.get(projectId);
        if (!projectServers) {
            throw new Error('No MCP servers running for this project');
        }
        const instance = projectServers.get(serverId);
        if (!instance || instance.status !== 'running') {
            throw new Error(`MCP server ${serverId} is not running`);
        }
        instance.lastActivity = Date.now();
        const result = await this.sendRequest(instance, 'tools/call', {
            name: toolName,
            arguments: args,
        });
        return result;
    }
    /**
     * Get all running servers for a project
     */
    getServers(projectId) {
        const projectServers = this.servers.get(projectId);
        if (!projectServers)
            return [];
        return Array.from(projectServers.values()).map(instance => ({
            id: instance.config.id,
            name: instance.config.name,
            status: instance.status,
            tools: instance.tools,
        }));
    }
    /**
     * Get all tools across all running servers for a project
     */
    getAllTools(projectId) {
        const projectServers = this.servers.get(projectId);
        if (!projectServers)
            return [];
        const tools = [];
        for (const instance of projectServers.values()) {
            if (instance.status === 'running') {
                tools.push(...instance.tools);
            }
        }
        return tools;
    }
    // Private methods
    async waitForReady(instance, timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (instance.process && !instance.process.killed) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('MCP server failed to start');
    }
    sendRequest(instance, method, params) {
        return new Promise((resolve, reject) => {
            if (!instance.process || !instance.process.stdin) {
                reject(new Error('MCP server not running'));
                return;
            }
            const id = ++instance.requestId;
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params,
            };
            instance.pendingRequests.set(String(id), { resolve, reject });
            // Set timeout for request
            setTimeout(() => {
                if (instance.pendingRequests.has(String(id))) {
                    instance.pendingRequests.delete(String(id));
                    reject(new Error(`MCP request timeout: ${method}`));
                }
            }, 30000);
            const message = JSON.stringify(request) + '\n';
            instance.process.stdin.write(message);
        });
    }
    sendNotification(instance, method, params) {
        if (!instance.process || !instance.process.stdin)
            return;
        const notification = {
            jsonrpc: '2.0',
            method,
            params,
        };
        const message = JSON.stringify(notification) + '\n';
        instance.process.stdin.write(message);
    }
    processBuffer(projectId, serverId, instance) {
        const lines = instance.buffer.split('\n');
        instance.buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const message = JSON.parse(line);
                // Handle response
                if (message.id !== undefined) {
                    const pending = instance.pendingRequests.get(String(message.id));
                    if (pending) {
                        instance.pendingRequests.delete(String(message.id));
                        if (message.error) {
                            pending.reject(new Error(message.error.message || 'MCP error'));
                        }
                        else {
                            pending.resolve(message.result);
                        }
                    }
                }
                // Handle notifications
                if (message.method && !message.id) {
                    this.emit('notification', {
                        projectId,
                        serverId,
                        method: message.method,
                        params: message.params,
                    });
                }
            }
            catch (e) {
                // Ignore non-JSON lines (might be logging)
            }
        }
    }
    checkIdleServers() {
        const now = Date.now();
        for (const [projectId, projectServers] of this.servers) {
            for (const [serverId, instance] of projectServers) {
                if (instance.status === 'running' && now - instance.lastActivity > IDLE_TIMEOUT_MS) {
                    console.log(`[MCP] Stopping idle server ${serverId} for project ${projectId}`);
                    this.stopServer(projectId, serverId);
                }
            }
        }
    }
    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }
        for (const [projectId] of this.servers) {
            await this.stopAllServers(projectId);
        }
    }
}
// Export singleton instance
exports.mcpManager = new MCPManager();
// Pre-configured popular MCP servers (for one-click install)
// These are pre-installed in /opt/mcp-servers for instant startup
exports.PREINSTALLED_SERVERS = {
    filesystem: {
        name: 'Filesystem',
        command: 'node',
        args: ['/opt/mcp-servers/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', '/workspace'],
    },
    memory: {
        name: 'Memory',
        command: 'node',
        args: ['/opt/mcp-servers/node_modules/@modelcontextprotocol/server-memory/dist/index.js'],
    },
    'sequential-thinking': {
        name: 'Sequential Thinking',
        command: 'node',
        args: ['/opt/mcp-servers/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js'],
    },
    fetch: {
        name: 'Fetch',
        command: 'node',
        args: ['/opt/mcp-servers/node_modules/@modelcontextprotocol/server-fetch/dist/index.js'],
    },
    time: {
        name: 'Time',
        command: 'node',
        args: ['/opt/mcp-servers/node_modules/@modelcontextprotocol/server-time/dist/index.js'],
    },
};
// Servers that need npx (not pre-installed, for custom or API-key required servers)
exports.NPX_SERVERS = {
    github: {
        name: 'GitHub',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
    'brave-search': {
        name: 'Brave Search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '' },
    },
    postgres: {
        name: 'PostgreSQL',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: { POSTGRES_CONNECTION_STRING: '' },
    },
    sqlite: {
        name: 'SQLite',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '/workspace/database.db'],
    },
    slack: {
        name: 'Slack',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    },
};
