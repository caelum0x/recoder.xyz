"use strict";
/**
 * LSP Server Manager
 * Manages the lifecycle of LSP servers running inside Docker containers
 * Handles start, stop, restart, health checks, and automatic recovery
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lspServerManager = exports.LSPServerManager = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const events_1 = require("events");
const config_js_1 = require("./config.js");
const tcp_lsp_client_js_1 = require("./tcp-lsp-client.js");
const docker = new dockerode_1.default();
// ==================== LSP Server Manager ====================
class LSPServerManager extends events_1.EventEmitter {
    servers = new Map();
    HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
    MAX_ERROR_COUNT = 3;
    MAX_RESTART_COUNT = 5;
    containerMonitors = new Map();
    isShuttingDown = false;
    /**
     * Start LSP servers for a container based on detected languages
     */
    async autoStartForContainer(containerId, projectId, workspaceRoot = '/workspace') {
        console.log(`[LSP Manager] Auto-detecting languages for project ${projectId}`);
        try {
            // Detect languages in the workspace
            const languages = await this.detectLanguages(containerId, workspaceRoot);
            console.log(`[LSP Manager] Detected languages: ${languages.join(', ') || 'none'}`);
            // Start LSP server for each detected language
            for (const languageId of languages) {
                const config = config_js_1.LSP_SERVER_CONFIGS[languageId];
                if (config) {
                    await this.startServer(containerId, projectId, config, workspaceRoot);
                }
            }
        }
        catch (error) {
            console.error(`[LSP Manager] Auto-start failed for project ${projectId}:`, error.message);
        }
    }
    /**
     * Start a specific LSP server in a container
     */
    async startServer(containerId, projectId, config, workspaceRoot = '/workspace') {
        if (this.isShuttingDown) {
            console.warn(`[LSP Manager] Cannot start server during shutdown`);
            return false;
        }
        const key = this.getServerKey(projectId, config.languageId);
        // Check if already running
        const existing = this.servers.get(key);
        if (existing?.status.running) {
            console.log(`[LSP Manager] Server ${config.languageId} already running for project ${projectId}`);
            return true;
        }
        console.log(`[LSP Manager] Starting ${config.name} for project ${projectId}`);
        try {
            // Verify container is running first
            const containerRunning = await this.isContainerRunning(containerId);
            if (!containerRunning) {
                throw new Error(`Container ${containerId} is not running`);
            }
            // Ensure LSP server is installed
            await this.ensureServerInstalled(containerId, config);
            // Start the LSP server process
            await this.startServerProcess(containerId, config);
            // Wait for server to be ready
            const ready = await this.waitForServerReady(containerId, config);
            if (!ready) {
                throw new Error(`Server ${config.languageId} failed to start within timeout`);
            }
            // Create managed server entry
            const server = {
                config,
                containerId,
                projectId,
                status: {
                    languageId: config.languageId,
                    running: true,
                    port: config.port,
                    startedAt: Date.now(),
                    lastHealthCheck: Date.now(),
                    errorCount: 0,
                    restartCount: 0,
                },
            };
            // Start health check monitoring
            server.healthCheckTimer = setInterval(() => this.healthCheck(key), this.HEALTH_CHECK_INTERVAL_MS);
            this.servers.set(key, server);
            // Start container monitoring if not already monitoring
            this.startContainerMonitoring(containerId, projectId);
            this.emit('server-started', projectId, config.languageId);
            console.log(`[LSP Manager] ${config.name} started successfully for project ${projectId} on port ${config.port}`);
            return true;
        }
        catch (error) {
            console.error(`[LSP Manager] Failed to start ${config.name}:`, error.message);
            this.emit('server-error', projectId, config.languageId, error);
            return false;
        }
    }
    /**
     * Stop a specific LSP server
     */
    async stopServer(projectId, languageId) {
        const key = this.getServerKey(projectId, languageId);
        const server = this.servers.get(key);
        if (!server) {
            return;
        }
        console.log(`[LSP Manager] Stopping ${languageId} server for project ${projectId}`);
        try {
            // Stop health check timer
            if (server.healthCheckTimer) {
                clearInterval(server.healthCheckTimer);
                server.healthCheckTimer = undefined;
            }
            // Remove client connection first (graceful shutdown)
            await tcp_lsp_client_js_1.lspClientPool.removeClient(projectId, languageId);
            // Kill the server process
            await this.stopServerProcess(server.containerId, server.config);
            server.status.running = false;
            this.servers.delete(key);
            this.emit('server-stopped', projectId, languageId);
            console.log(`[LSP Manager] ${languageId} server stopped for project ${projectId}`);
        }
        catch (error) {
            console.error(`[LSP Manager] Error stopping ${languageId} server:`, error.message);
        }
    }
    /**
     * Stop all LSP servers for a project
     */
    async stopAllForProject(projectId) {
        console.log(`[LSP Manager] Stopping all servers for project ${projectId}`);
        const toStop = [];
        let containerId = null;
        for (const [key, server] of this.servers) {
            if (server.projectId === projectId) {
                toStop.push(server.config.languageId);
                containerId = server.containerId;
            }
        }
        // Stop all servers in parallel
        await Promise.allSettled(toStop.map(lang => this.stopServer(projectId, lang)));
        // Stop container monitoring
        if (containerId) {
            this.stopContainerMonitoring(containerId);
        }
        // Remove all client connections for this project
        await tcp_lsp_client_js_1.lspClientPool.removeProject(projectId);
    }
    /**
     * Restart a specific LSP server
     */
    async restartServer(projectId, languageId) {
        const key = this.getServerKey(projectId, languageId);
        const server = this.servers.get(key);
        if (!server) {
            console.warn(`[LSP Manager] Cannot restart - server ${languageId} not found for project ${projectId}`);
            return false;
        }
        if (server.status.restartCount >= this.MAX_RESTART_COUNT) {
            console.error(`[LSP Manager] Max restart count reached for ${languageId} in project ${projectId}`);
            await this.stopServer(projectId, languageId);
            return false;
        }
        console.log(`[LSP Manager] Restarting ${languageId} server for project ${projectId} (restart #${server.status.restartCount + 1})`);
        // Stop first
        await this.stopServerProcess(server.containerId, server.config);
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Start again
        try {
            await this.startServerProcess(server.containerId, server.config);
            const ready = await this.waitForServerReady(server.containerId, server.config);
            if (ready) {
                server.status.running = true;
                server.status.startedAt = Date.now();
                server.status.restartCount++;
                server.status.errorCount = 0;
                this.emit('server-restarted', projectId, languageId);
                console.log(`[LSP Manager] ${languageId} server restarted successfully`);
                return true;
            }
        }
        catch (error) {
            console.error(`[LSP Manager] Restart failed for ${languageId}:`, error.message);
        }
        server.status.running = false;
        server.status.restartCount++;
        return false;
    }
    /**
     * Get status of all servers for a project
     */
    getProjectStatus(projectId) {
        const statuses = [];
        for (const [, server] of this.servers) {
            if (server.projectId === projectId) {
                statuses.push({ ...server.status });
            }
        }
        return statuses;
    }
    /**
     * Get a specific server status
     */
    getServerStatus(projectId, languageId) {
        const key = this.getServerKey(projectId, languageId);
        const server = this.servers.get(key);
        return server ? { ...server.status } : null;
    }
    /**
     * Get the container host for connecting to LSP
     * For containers on the same Docker network, this is usually 'localhost' or the container IP
     */
    async getContainerHost(containerId) {
        try {
            const container = docker.getContainer(containerId);
            const info = await container.inspect();
            // Get the container's IP on the bridge network
            const networks = info.NetworkSettings.Networks;
            const bridgeNetwork = networks['bridge'];
            if (bridgeNetwork?.IPAddress) {
                return bridgeNetwork.IPAddress;
            }
            // Fallback to localhost if running on same host
            return 'localhost';
        }
        catch (error) {
            console.error(`[LSP Manager] Failed to get container host:`, error.message);
            return 'localhost';
        }
    }
    /**
     * Get LSP client for a project/language
     */
    async getClient(projectId, languageId, workspaceRoot = '/workspace') {
        const key = this.getServerKey(projectId, languageId);
        const server = this.servers.get(key);
        if (!server?.status.running) {
            console.warn(`[LSP Manager] Server ${languageId} not running for project ${projectId}`);
            return null;
        }
        try {
            const host = await this.getContainerHost(server.containerId);
            return await tcp_lsp_client_js_1.lspClientPool.getClient(projectId, server.config, host, workspaceRoot, server.containerId);
        }
        catch (error) {
            console.error(`[LSP Manager] Failed to get client for ${languageId}:`, error.message);
            return null;
        }
    }
    /**
     * Shutdown all servers and cleanup
     */
    async shutdown() {
        this.isShuttingDown = true;
        console.log('[LSP Manager] Shutting down all servers...');
        // Stop all container monitors
        for (const [containerId, monitor] of this.containerMonitors) {
            clearInterval(monitor);
        }
        this.containerMonitors.clear();
        // Stop all health check timers
        for (const server of this.servers.values()) {
            if (server.healthCheckTimer) {
                clearInterval(server.healthCheckTimer);
                server.healthCheckTimer = undefined;
            }
        }
        // Disconnect all clients first (graceful)
        await tcp_lsp_client_js_1.lspClientPool.shutdown();
        // Stop all servers by project
        const projects = new Set();
        for (const server of this.servers.values()) {
            projects.add(server.projectId);
        }
        const shutdownPromises = Array.from(projects).map(projectId => this.stopAllForProject(projectId).catch(err => {
            console.error(`[LSP Manager] Error stopping servers for project ${projectId}:`, err);
        }));
        await Promise.allSettled(shutdownPromises);
        this.servers.clear();
        this.isShuttingDown = false;
        console.log('[LSP Manager] Shutdown complete');
    }
    /**
     * Get statistics
     */
    getStats() {
        const byLanguage = {};
        const byProject = {};
        let running = 0;
        for (const server of this.servers.values()) {
            if (server.status.running)
                running++;
            byLanguage[server.config.languageId] = (byLanguage[server.config.languageId] || 0) + 1;
            if (!byProject[server.projectId]) {
                byProject[server.projectId] = [];
            }
            byProject[server.projectId].push(server.config.languageId);
        }
        return {
            totalServers: this.servers.size,
            runningServers: running,
            byLanguage,
            byProject,
        };
    }
    // ==================== Private Methods ====================
    getServerKey(projectId, languageId) {
        return `${projectId}:${languageId}`;
    }
    /**
     * Detect languages in the workspace by scanning file extensions
     */
    async detectLanguages(containerId, workspaceRoot) {
        try {
            const container = docker.getContainer(containerId);
            // Find all file extensions in the workspace
            const cmd = `find ${workspaceRoot} -type f -name "*.*" ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/target/*" | head -500 | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20`;
            const output = await this.execInContainer(container, cmd);
            const detectedLanguages = new Set();
            for (const line of output.split('\n')) {
                const match = line.trim().match(/^\d+\s+(\w+)$/);
                if (match) {
                    const ext = `.${match[1]}`;
                    const config = (0, config_js_1.getConfigForExtension)(ext);
                    if (config) {
                        detectedLanguages.add(config.languageId);
                    }
                }
            }
            return Array.from(detectedLanguages);
        }
        catch (error) {
            console.error(`[LSP Manager] Language detection failed:`, error.message);
            return [];
        }
    }
    /**
     * Ensure LSP server package is installed in the container
     */
    async ensureServerInstalled(containerId, config) {
        const container = docker.getContainer(containerId);
        // Check if server is already installed
        const checkCmd = config.healthCheckCommand.replace(' || exit 1', ' && echo "INSTALLED"');
        const checkResult = await this.execInContainer(container, checkCmd);
        if (checkResult.includes('INSTALLED')) {
            console.log(`[LSP Manager] ${config.name} already installed`);
            return;
        }
        console.log(`[LSP Manager] Installing ${config.name}...`);
        await this.execInContainer(container, config.installCommand);
        console.log(`[LSP Manager] ${config.name} installed`);
    }
    /**
     * Start the LSP server process inside the container
     */
    async startServerProcess(containerId, config) {
        const container = docker.getContainer(containerId);
        // Kill any existing server first
        await this.stopServerProcess(containerId, config);
        // Start server in background with nohup
        // Redirect output to a log file for debugging
        const logFile = `/tmp/lsp-${config.languageId}.log`;
        const startCmd = `cd /workspace && nohup ${config.startCommand} > ${logFile} 2>&1 &`;
        await this.execInContainer(container, startCmd);
        console.log(`[LSP Manager] Started ${config.name} process`);
    }
    /**
     * Stop the LSP server process
     */
    async stopServerProcess(containerId, config) {
        const container = docker.getContainer(containerId);
        // Kill by port
        const killCmd = `fuser -k ${config.port}/tcp 2>/dev/null || true; pkill -f "${config.startCommand.split(' ')[0]}.*${config.port}" 2>/dev/null || true`;
        try {
            await this.execInContainer(container, killCmd);
        }
        catch (e) {
            // Ignore kill errors
        }
    }
    /**
     * Wait for server to be ready (accepting connections)
     */
    async waitForServerReady(containerId, config) {
        const container = docker.getContainer(containerId);
        const startTime = Date.now();
        while (Date.now() - startTime < config.startupTimeoutMs) {
            // Check if process is running
            const healthResult = await this.execInContainer(container, config.healthCheckCommand + ' 2>/dev/null && echo "OK"');
            if (healthResult.includes('OK')) {
                // Also verify port is listening
                const portCheck = await this.execInContainer(container, `nc -z localhost ${config.port} && echo "PORT_OK" || echo "PORT_FAIL"`);
                if (portCheck.includes('PORT_OK')) {
                    return true;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }
    /**
     * Perform health check on a running server
     */
    async healthCheck(key) {
        const server = this.servers.get(key);
        if (!server || this.isShuttingDown)
            return;
        try {
            // First verify container is still running
            const containerRunning = await this.isContainerRunning(server.containerId);
            if (!containerRunning) {
                console.error(`[LSP Manager] Container ${server.containerId} is not running`);
                server.status.errorCount = this.MAX_ERROR_COUNT;
                server.status.running = false;
                this.emit('health-check-failed', server.projectId, server.config.languageId);
                // Don't try to restart if container is gone
                return;
            }
            const container = docker.getContainer(server.containerId);
            // Check if process is running
            const healthResult = await this.execInContainer(container, server.config.healthCheckCommand + ' 2>/dev/null && echo "OK"');
            if (healthResult.includes('OK')) {
                server.status.lastHealthCheck = Date.now();
                server.status.errorCount = 0;
                return;
            }
            // Health check failed
            server.status.errorCount++;
            console.warn(`[LSP Manager] Health check failed for ${server.config.languageId} (${server.status.errorCount}/${this.MAX_ERROR_COUNT})`);
            this.emit('health-check-failed', server.projectId, server.config.languageId);
            if (server.status.errorCount >= this.MAX_ERROR_COUNT) {
                console.log(`[LSP Manager] Max errors reached, restarting ${server.config.languageId}`);
                server.status.running = false;
                await this.restartServer(server.projectId, server.config.languageId);
            }
        }
        catch (error) {
            console.error(`[LSP Manager] Health check error for ${server.config.languageId}:`, error.message);
            server.status.errorCount++;
            // If too many errors, mark as failed
            if (server.status.errorCount >= this.MAX_ERROR_COUNT) {
                server.status.running = false;
                this.emit('server-error', server.projectId, server.config.languageId, error);
            }
        }
    }
    /**
     * Check if a container is running
     */
    async isContainerRunning(containerId) {
        try {
            const container = docker.getContainer(containerId);
            const info = await container.inspect();
            return info.State.Running === true;
        }
        catch (error) {
            console.error(`[LSP Manager] Error checking container status:`, error.message);
            return false;
        }
    }
    /**
     * Start monitoring a container for lifecycle events
     */
    startContainerMonitoring(containerId, projectId) {
        // Don't create duplicate monitors
        if (this.containerMonitors.has(containerId)) {
            return;
        }
        console.log(`[LSP Manager] Starting container monitoring for ${containerId}`);
        // Poll container status every 30 seconds
        const monitor = setInterval(async () => {
            try {
                const running = await this.isContainerRunning(containerId);
                if (!running) {
                    console.warn(`[LSP Manager] Container ${containerId} stopped, cleaning up LSP servers`);
                    clearInterval(monitor);
                    this.containerMonitors.delete(containerId);
                    // Stop all servers for this project
                    await this.stopAllForProject(projectId);
                }
            }
            catch (error) {
                console.error(`[LSP Manager] Error monitoring container ${containerId}:`, error.message);
            }
        }, 30000); // Check every 30 seconds
        this.containerMonitors.set(containerId, monitor);
    }
    /**
     * Stop monitoring a container
     */
    stopContainerMonitoring(containerId) {
        const monitor = this.containerMonitors.get(containerId);
        if (monitor) {
            clearInterval(monitor);
            this.containerMonitors.delete(containerId);
            console.log(`[LSP Manager] Stopped container monitoring for ${containerId}`);
        }
    }
    /**
     * Execute a command inside a container and return output
     */
    async execInContainer(container, command) {
        const exec = await container.exec({
            Cmd: ['/bin/bash', '-c', command],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({});
        const chunks = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                const raw = Buffer.concat(chunks);
                let result = '';
                let i = 0;
                // Parse Docker multiplex protocol
                while (i < raw.length) {
                    if (i + 8 <= raw.length) {
                        const size = raw.readUInt32BE(i + 4);
                        if (i + 8 + size <= raw.length) {
                            result += raw.slice(i + 8, i + 8 + size).toString();
                            i += 8 + size;
                            continue;
                        }
                    }
                    result += raw.slice(i).toString();
                    break;
                }
                resolve(result.trim());
            });
            stream.on('error', reject);
        });
    }
}
exports.LSPServerManager = LSPServerManager;
// Singleton instance
exports.lspServerManager = new LSPServerManager();
exports.default = LSPServerManager;
