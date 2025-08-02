"use strict";
/**
 * Docker Support Plugin for Craft Code
 * Provides Docker container management and integration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const types_1 = require("../../plugin-sdk/types");
class DockerSupportPlugin {
    constructor() {
        this.metadata = {
            id: '@craft-code/docker-support',
            name: 'Docker Support',
            version: '1.0.0',
            author: 'Craft Code Team',
            description: 'Docker container management and development integration',
            category: types_1.PluginCategory.CONTAINERS,
            tags: ['docker', 'containers', 'devops', 'deployment'],
            keywords: ['docker', 'container', 'image', 'compose', 'build'],
            publishedAt: new Date(),
            updatedAt: new Date(),
            downloads: 0,
            rating: { average: 0, count: 0 },
            repository: 'https://github.com/craft-code/docker-support',
            homepage: 'https://craft-code.dev/plugins/docker-support',
            license: 'MIT',
            engines: {
                craftCode: '>=1.0.0',
                node: '>=18.0.0'
            }
        };
        this.capabilities = {
            fileSystemAccess: true,
            networkAccess: true,
            shellAccess: true,
            uiExtensions: true,
            storage: true
        };
    }
    /**
     * Activate the Docker support plugin
     */
    async activate(context) {
        this.context = context;
        try {
            // Check if Docker is available
            await this.verifyDockerInstallation();
            // Initialize container monitoring
            this.containerMonitor = new ContainerMonitor(context);
            // Set up UI components
            await this.setupUI();
            // Register commands
            this.registerCommands();
            // Start monitoring if enabled
            if (context.config.autoDetectContainers) {
                await this.startMonitoring();
            }
            context.logger.info('Docker Support plugin activated');
        }
        catch (error) {
            context.logger.error('Failed to activate Docker Support plugin:', error);
            throw error;
        }
    }
    /**
     * Deactivate the plugin
     */
    async deactivate() {
        try {
            // Stop monitoring
            await this.containerMonitor?.cleanup();
            if (this.statusUpdateInterval) {
                clearInterval(this.statusUpdateInterval);
            }
            // Clean up UI
            this.dockerPanel?.dispose();
            this.dockerTerminal?.dispose();
            this.context.logger.info('Docker Support plugin deactivated');
        }
        catch (error) {
            this.context.logger.error('Error during Docker plugin deactivation:', error);
        }
    }
    /**
     * Handle configuration changes
     */
    async onConfigChange(config) {
        this.context.logger.info('Docker plugin configuration updated:', config);
        // Update monitoring settings
        if (config.autoDetectContainers !== undefined) {
            if (config.autoDetectContainers) {
                await this.startMonitoring();
            }
            else {
                await this.containerMonitor?.cleanup();
            }
        }
        // Update refresh interval
        if (config.refreshInterval) {
            this.updateRefreshInterval(config.refreshInterval * 1000);
        }
    }
    /**
     * Handle commands
     */
    async onCommand(command, args) {
        switch (command) {
            case 'docker.containers.list':
                return await this.listContainers();
            case 'docker.containers.start':
                return await this.startContainer(args);
            case 'docker.containers.stop':
                return await this.stopContainer(args);
            case 'docker.containers.remove':
                return await this.removeContainer(args);
            case 'docker.images.list':
                return await this.listImages();
            case 'docker.images.pull':
                return await this.pullImage(args);
            case 'docker.build':
                return await this.buildImage(args);
            case 'docker.compose.up':
                return await this.composeUp(args);
            case 'docker.compose.down':
                return await this.composeDown(args);
            case 'docker.logs':
                return await this.showLogs(args);
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }
    /**
     * Handle project open events
     */
    async onProjectOpen(project) {
        this.context.logger.info('Project opened, checking for Docker files:', project.path);
        const hasDockerfile = await this.hasDockerfile(project.path);
        const hasComposeFile = await this.hasComposeFile(project.path);
        if (hasDockerfile || hasComposeFile) {
            await this.initializeDockerProject(project.path, { hasDockerfile, hasComposeFile });
        }
    }
    /**
     * Handle file change events
     */
    async onFileChange(filePath) {
        const fileName = path.basename(filePath);
        // Watch for Docker-related file changes
        if (fileName === 'Dockerfile' || fileName === 'docker-compose.yml' || fileName === 'docker-compose.yaml') {
            await this.updateDockerPanel();
            this.context.logger.info('Docker configuration file changed:', fileName);
        }
    }
    // Private methods
    async setupUI() {
        // Create Docker panel
        this.dockerPanel = this.context.ui.createPanel({
            id: 'docker-explorer',
            title: 'Docker',
            icon: 'package',
            position: 'left'
        });
        // Create Docker terminal
        this.dockerTerminal = this.context.ui.createTerminal({
            id: 'docker-terminal',
            name: 'Docker Terminal',
            shellPath: this.context.config.dockerPath || 'docker'
        });
        await this.updateDockerPanel();
    }
    registerCommands() {
        const commands = [
            'docker.containers.list', 'docker.containers.start', 'docker.containers.stop',
            'docker.containers.remove', 'docker.images.list', 'docker.images.pull',
            'docker.build', 'docker.compose.up', 'docker.compose.down', 'docker.logs'
        ];
        for (const command of commands) {
            this.context.events.on(`command:${command}`, (args) => this.onCommand(command, args));
        }
    }
    async startMonitoring() {
        await this.containerMonitor.start();
        const refreshInterval = (this.context.config.refreshInterval || 10) * 1000;
        this.updateRefreshInterval(refreshInterval);
    }
    updateRefreshInterval(interval) {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        this.statusUpdateInterval = setInterval(async () => {
            try {
                await this.updateDockerPanel();
            }
            catch (error) {
                this.context.logger.error('Failed to update Docker status:', error);
            }
        }, interval);
    }
    async verifyDockerInstallation() {
        return new Promise((resolve, reject) => {
            const dockerPath = this.context.config.dockerPath || 'docker';
            (0, child_process_1.exec)(`${dockerPath} --version`, (error, stdout) => {
                if (error) {
                    reject(new Error('Docker is not installed or not accessible'));
                }
                else {
                    this.context.logger.info('Docker version:', stdout.trim());
                    resolve();
                }
            });
        });
    }
    async hasDockerfile(projectPath) {
        try {
            await fs.access(path.join(projectPath, 'Dockerfile'));
            return true;
        }
        catch {
            return false;
        }
    }
    async hasComposeFile(projectPath) {
        try {
            await fs.access(path.join(projectPath, 'docker-compose.yml'));
            return true;
        }
        catch {
            try {
                await fs.access(path.join(projectPath, 'docker-compose.yaml'));
                return true;
            }
            catch {
                return false;
            }
        }
    }
    async initializeDockerProject(projectPath, config) {
        this.context.logger.info('Initializing Docker project:', projectPath, config);
        await this.updateDockerPanel();
    }
    async updateDockerPanel() {
        if (!this.dockerPanel)
            return;
        try {
            const [containers, images] = await Promise.all([
                this.getContainers(),
                this.getImages()
            ]);
            const workspacePath = await this.getWorkspacePath();
            const projectInfo = workspacePath ? await this.getProjectDockerInfo(workspacePath) : null;
            const html = this.generateDockerPanelHTML(containers, images, projectInfo);
            this.dockerPanel.setContent(html);
        }
        catch (error) {
            this.context.logger.error('Failed to update Docker panel:', error);
            this.dockerPanel.setContent('<p>Error loading Docker information</p>');
        }
    }
    async getContainers() {
        return new Promise((resolve, reject) => {
            const dockerPath = this.context.config.dockerPath || 'docker';
            (0, child_process_1.exec)(`${dockerPath} ps -a --format "table {{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"`, (error, stdout) => {
                if (error) {
                    reject(error);
                }
                else {
                    const lines = stdout.trim().split('\n').slice(1); // Skip header
                    const containers = lines.map(line => {
                        const [id, name, image, status, ports] = line.split('|');
                        return {
                            id: id?.trim(),
                            name: name?.trim(),
                            image: image?.trim(),
                            status: status?.trim(),
                            ports: ports?.trim() || ''
                        };
                    }).filter(container => container.id);
                    resolve(containers);
                }
            });
        });
    }
    async getImages() {
        return new Promise((resolve, reject) => {
            const dockerPath = this.context.config.dockerPath || 'docker';
            (0, child_process_1.exec)(`${dockerPath} images --format "table {{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}"`, (error, stdout) => {
                if (error) {
                    reject(error);
                }
                else {
                    const lines = stdout.trim().split('\n').slice(1); // Skip header
                    const images = lines.map(line => {
                        const [repository, tag, id, size] = line.split('|');
                        return {
                            repository: repository?.trim(),
                            tag: tag?.trim(),
                            id: id?.trim(),
                            size: size?.trim()
                        };
                    }).filter(image => image.id);
                    resolve(images);
                }
            });
        });
    }
    async getProjectDockerInfo(projectPath) {
        const [hasDockerfile, hasComposeFile] = await Promise.all([
            this.hasDockerfile(projectPath),
            this.hasComposeFile(projectPath)
        ]);
        return {
            hasDockerfile,
            hasComposeFile,
            projectPath
        };
    }
    generateDockerPanelHTML(containers, images, projectInfo) {
        return `
      <div class="docker-panel">
        ${projectInfo ? `
          <div class="docker-section">
            <h3>Project</h3>
            <div class="project-info">
              ${projectInfo.hasDockerfile ? '<div class="file-indicator">📄 Dockerfile</div>' : ''}
              ${projectInfo.hasComposeFile ? '<div class="file-indicator">📄 docker-compose.yml</div>' : ''}
              ${projectInfo.hasDockerfile ? `
                <button onclick="craftCode.executeCommand('docker.build')" class="action-button">Build Image</button>
              ` : ''}
              ${projectInfo.hasComposeFile ? `
                <button onclick="craftCode.executeCommand('docker.compose.up')" class="action-button">Compose Up</button>
                <button onclick="craftCode.executeCommand('docker.compose.down')" class="action-button">Compose Down</button>
              ` : ''}
            </div>
          </div>
        ` : ''}
        
        <div class="docker-section">
          <h3>Containers (${containers.length})</h3>
          <div class="container-list">
            ${containers.length > 0 ? containers.map(container => `
              <div class="container-item ${this.getContainerStatusClass(container.status)}">
                <div class="container-header">
                  <span class="container-name">${container.name}</span>
                  <span class="container-status">${container.status}</span>
                </div>
                <div class="container-details">
                  <div>Image: ${container.image}</div>
                  ${container.ports ? `<div>Ports: ${container.ports}</div>` : ''}
                </div>
                <div class="container-actions">
                  ${this.isContainerRunning(container.status) ?
            `<button onclick="craftCode.executeCommand('docker.containers.stop', {id: '${container.id}'})">Stop</button>` :
            `<button onclick="craftCode.executeCommand('docker.containers.start', {id: '${container.id}'})">Start</button>`}
                  <button onclick="craftCode.executeCommand('docker.logs', {id: '${container.id}'})">Logs</button>
                  <button onclick="craftCode.executeCommand('docker.containers.remove', {id: '${container.id}'})">Remove</button>
                </div>
              </div>
            `).join('') : '<p>No containers found</p>'}
          </div>
        </div>

        <div class="docker-section">
          <h3>Images (${images.length})</h3>
          <div class="image-list">
            ${images.length > 0 ? images.map(image => `
              <div class="image-item">
                <div class="image-header">
                  <span class="image-name">${image.repository}:${image.tag}</span>
                  <span class="image-size">${image.size}</span>
                </div>
                <div class="image-id">${image.id}</div>
              </div>
            `).join('') : '<p>No images found</p>'}
          </div>
        </div>

        <div class="docker-actions">
          <button onclick="craftCode.executeCommand('docker.containers.list')" class="refresh-button">Refresh</button>
          <button onclick="craftCode.executeCommand('docker.images.pull')" class="action-button">Pull Image</button>
        </div>
      </div>
    `;
    }
    getContainerStatusClass(status) {
        if (status.startsWith('Up'))
            return 'running';
        if (status.startsWith('Exited'))
            return 'stopped';
        return 'unknown';
    }
    isContainerRunning(status) {
        return status.startsWith('Up');
    }
    async getWorkspacePath() {
        return this.context.workspace?.rootPath || null;
    }
    // Command implementations
    async listContainers() {
        const containers = await this.getContainers();
        await this.updateDockerPanel();
        return containers;
    }
    async startContainer(args) {
        if (!args?.id && !args?.name) {
            throw new Error('Container ID or name required');
        }
        const identifier = args.id || args.name;
        const dockerPath = this.context.config.dockerPath || 'docker';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} start ${identifier}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Container started:', identifier);
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async stopContainer(args) {
        if (!args?.id && !args?.name) {
            throw new Error('Container ID or name required');
        }
        const identifier = args.id || args.name;
        const dockerPath = this.context.config.dockerPath || 'docker';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} stop ${identifier}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Container stopped:', identifier);
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async removeContainer(args) {
        if (!args?.id && !args?.name) {
            throw new Error('Container ID or name required');
        }
        const identifier = args.id || args.name;
        const dockerPath = this.context.config.dockerPath || 'docker';
        const forceFlag = args.force ? ' -f' : '';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} rm${forceFlag} ${identifier}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Container removed:', identifier);
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async listImages() {
        const images = await this.getImages();
        await this.updateDockerPanel();
        return images;
    }
    async pullImage(args) {
        const imageName = args?.name || await this.promptForImageName();
        if (!imageName)
            throw new Error('Image name required');
        const fullName = args?.tag ? `${imageName}:${args.tag}` : imageName;
        const dockerPath = this.context.config.dockerPath || 'docker';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} pull ${fullName}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Image pulled:', fullName);
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async buildImage(args) {
        const workspacePath = await this.getWorkspacePath();
        if (!workspacePath)
            throw new Error('No workspace found');
        const context = args?.context || '.';
        const dockerfile = args?.dockerfile ? `-f ${args.dockerfile}` : '';
        const tag = args?.tag ? `-t ${args.tag}` : '';
        const dockerPath = this.context.config.dockerPath || 'docker';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} build ${dockerfile} ${tag} ${context}`, { cwd: workspacePath }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Image built successfully');
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async composeUp(args) {
        const workspacePath = await this.getWorkspacePath();
        if (!workspacePath)
            throw new Error('No workspace found');
        const detachFlag = args?.detach !== false ? '-d' : '';
        const buildFlag = args?.build ? '--build' : '';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`docker-compose up ${detachFlag} ${buildFlag}`, { cwd: workspacePath }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Docker Compose up completed');
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async composeDown(args) {
        const workspacePath = await this.getWorkspacePath();
        if (!workspacePath)
            throw new Error('No workspace found');
        const volumesFlag = args?.volumes ? '-v' : '';
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`docker-compose down ${volumesFlag}`, { cwd: workspacePath }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    this.context.logger.info('Docker Compose down completed');
                    this.updateDockerPanel();
                    resolve();
                }
            });
        });
    }
    async showLogs(args) {
        if (!args?.id && !args?.name) {
            throw new Error('Container ID or name required');
        }
        const identifier = args.id || args.name;
        const dockerPath = this.context.config.dockerPath || 'docker';
        const followFlag = args.follow ? '-f' : '';
        const tailFlag = args.tail ? `--tail ${args.tail}` : '';
        // Show logs in output channel
        if (this.context.config.showContainerLogs) {
            this.context.ui.showOutput(`Docker logs for ${identifier}`);
        }
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`${dockerPath} logs ${followFlag} ${tailFlag} ${identifier}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                }
                else {
                    if (this.context.config.showContainerLogs) {
                        this.context.ui.appendOutput(stdout);
                    }
                    resolve();
                }
            });
        });
    }
    async promptForImageName() {
        return this.context.ui.showInputDialog({
            title: 'Pull Docker Image',
            placeholder: 'Enter image name (e.g., nginx:latest)...'
        });
    }
}
exports.default = DockerSupportPlugin;
// Supporting classes
class ContainerMonitor extends events_1.EventEmitter {
    constructor(context) {
        super();
        this.context = context;
    }
    async start() {
        this.context.logger.info('Starting Docker container monitoring');
        // Monitor for container events
        this.monitorInterval = setInterval(async () => {
            try {
                await this.checkContainerEvents();
            }
            catch (error) {
                this.context.logger.error('Container monitor error:', error);
            }
        }, 5000);
    }
    async checkContainerEvents() {
        // This would monitor Docker events and emit changes
        this.emit('containersChanged');
    }
    async cleanup() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }
}
//# sourceMappingURL=index.js.map