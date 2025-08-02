/**
 * Docker Support Plugin for Craft Code
 * Provides Docker container management and integration
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  Plugin,
  PluginContext,
  PluginMetadata,
  WorkspaceAPI,
  PluginUI,
  Project,
  PluginCapabilities,
  PluginConfiguration,
  PluginCategory
} from '../../plugin-sdk/types';

export default class DockerSupportPlugin implements Plugin {
  capabilities!: PluginCapabilities;
  //capabilities: PluginCapabilities;
  configuration?: PluginConfiguration | undefined;
  onActivate?(context: PluginContext): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onDeactivate?(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onProjectClose?(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onFileCreate?(path: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onFileDelete?(path: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  metadata: PluginMetadata = {
    id: '@craft-code/docker-support',
    name: 'Docker Support',
    version: '1.0.0',
    author: 'Craft Code Team',
    description: 'Docker container management and development integration',
    //category: 'devops',
    tags: ['docker', 'containers', 'devops', 'deployment'],
    keywords: ['docker', 'container', 'image', 'compose', 'build'],
    publishedAt: new Date(),
    updatedAt: new Date(),
    downloads: 0,
    rating: { average: 0, count: 0 },
    repository: 'https://github.com/craft-code/docker-support',
    homepage: 'https://craft-code.dev/plugins/docker-support',
    license: '',
    engines: {
      craftCode: '',
      node: ''
    },
    category: PluginCategory.AI_INTEGRATION
  };

  private context!: PluginContext;
  private containerMonitor!: ContainerMonitor;
  private dockerPanel!: any;
  private dockerTerminal!: any;
  private statusUpdateInterval?: NodeJS.Timeout;

  /**
   * Activate the Docker support plugin
   */
  async activate(context: PluginContext): Promise<void> {
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
    } catch (error) {
      context.logger.error('Failed to activate Docker Support plugin:', error);
      throw error;
    }
  }

  /**
   * Deactivate the plugin
   */
  async deactivate(): Promise<void> {
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
    } catch (error) {
      this.context.logger.error('Error during Docker plugin deactivation:', error);
    }
  }

  /**
   * Handle configuration changes
   */
  async onConfigChange(config: Record<string, any>): Promise<void> {
    this.context.logger.info('Docker plugin configuration updated:', config);
    
    // Update monitoring settings
    if (config.autoDetectContainers !== undefined) {
      if (config.autoDetectContainers) {
        await this.startMonitoring();
      } else {
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
  async onCommand(command: string, args?: any): Promise<any> {
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
  async onProjectOpen(project: Project): Promise<void> {
    const projectPath = project.path;
    this.context.logger.info('Project opened, checking for Docker files:', projectPath);
    
    const hasDockerfile = await this.hasDockerfile(projectPath);
    const hasComposeFile = await this.hasComposeFile(projectPath);
    
    if (hasDockerfile || hasComposeFile) {
      await this.initializeDockerProject(projectPath, { hasDockerfile, hasComposeFile });
    }
  }

  /**
   * Handle file change events
   */
  async onFileChange(pathArg: string, ...args: any[]): Promise<void> {
    const fileName = path.basename(pathArg);
    // Determine changeType if provided
    const changeType = args[0] as 'create' | 'modify' | 'delete' | undefined;

    // Watch for Docker-related file changes
    if (fileName === 'Dockerfile' || fileName === 'docker-compose.yml' || fileName === 'docker-compose.yaml') {
      await this.updateDockerPanel();
      this.context.logger.info('Docker configuration file changed:', fileName, changeType);
    }
  }

  // Private methods

  private async setupUI(): Promise<void> {
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
      title: 'Docker Terminal',
      shellPath: this.context.config.dockerPath || 'docker',
      name: ''
    });

    await this.updateDockerPanel();
  }

  private registerCommands(): void {
    const commands = [
      'docker.containers.list', 'docker.containers.start', 'docker.containers.stop',
      'docker.containers.remove', 'docker.images.list', 'docker.images.pull',
      'docker.build', 'docker.compose.up', 'docker.compose.down', 'docker.logs'
    ];

    for (const command of commands) {
      this.context.events.on(`command:${command}`, (args) => this.onCommand(command, args));
    }
  }

  private async startMonitoring(): Promise<void> {
    await this.containerMonitor.start();
    
    const refreshInterval = (this.context.config.refreshInterval || 10) * 1000;
    this.updateRefreshInterval(refreshInterval);
  }

  private updateRefreshInterval(interval: number): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }

    this.statusUpdateInterval = setInterval(async () => {
      try {
        await this.updateDockerPanel();
      } catch (error) {
        this.context.logger.error('Failed to update Docker status:', error);
      }
    }, interval);
  }

  private async verifyDockerInstallation(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dockerPath = this.context.config.dockerPath || 'docker';
      exec(`${dockerPath} --version`, (error, stdout) => {
        if (error) {
          reject(new Error('Docker is not installed or not accessible'));
        } else {
          this.context.logger.info('Docker version:', stdout.trim());
          resolve();
        }
      });
    });
  }

  private async hasDockerfile(projectPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectPath, 'Dockerfile'));
      return true;
    } catch {
      return false;
    }
  }

  private async hasComposeFile(projectPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectPath, 'docker-compose.yml'));
      return true;
    } catch {
      try {
        await fs.access(path.join(projectPath, 'docker-compose.yaml'));
        return true;
      } catch {
        return false;
      }
    }
  }

  private async initializeDockerProject(
    projectPath: string, 
    config: { hasDockerfile: boolean; hasComposeFile: boolean }
  ): Promise<void> {
    this.context.logger.info('Initializing Docker project:', projectPath, config);
    await this.updateDockerPanel();
  }

  private async updateDockerPanel(): Promise<void> {
    if (!this.dockerPanel) return;

    try {
      const [containers, images] = await Promise.all([
        this.getContainers(),
        this.getImages()
      ]);

      const workspacePath = await this.getWorkspacePath();
      const projectInfo = workspacePath ? await this.getProjectDockerInfo(workspacePath) : null;

      const html = this.generateDockerPanelHTML(containers, images, projectInfo);
      this.dockerPanel.setContent(html);
    } catch (error) {
      this.context.logger.error('Failed to update Docker panel:', error);
      this.dockerPanel.setContent('<p>Error loading Docker information</p>');
    }
  }

  private async getContainers(): Promise<DockerContainer[]> {
    return new Promise((resolve, reject) => {
      const dockerPath = this.context.config.dockerPath || 'docker';
      exec(`${dockerPath} ps -a --format "table {{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"`, 
        (error, stdout) => {
          if (error) {
            reject(error);
          } else {
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
        }
      );
    });
  }

  private async getImages(): Promise<DockerImage[]> {
    return new Promise((resolve, reject) => {
      const dockerPath = this.context.config.dockerPath || 'docker';
      exec(`${dockerPath} images --format "table {{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}"`,
        (error, stdout) => {
          if (error) {
            reject(error);
          } else {
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
        }
      );
    });
  }

  private async getProjectDockerInfo(projectPath: string): Promise<ProjectDockerInfo> {
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

  private generateDockerPanelHTML(
    containers: DockerContainer[], 
    images: DockerImage[], 
    projectInfo: ProjectDockerInfo | null
  ): string {
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
                    `<button onclick="craftCode.executeCommand('docker.containers.start', {id: '${container.id}'})">Start</button>`
                  }
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

  private getContainerStatusClass(status: string): string {
    if (status.startsWith('Up')) return 'running';
    if (status.startsWith('Exited')) return 'stopped';
    return 'unknown';
  }

  private isContainerRunning(status: string): boolean {
    return status.startsWith('Up');
  }

  private async getWorkspacePath(): Promise<string | null> {
    return this.context.workspace?.rootPath || null;
  }

  // Command implementations

  private async listContainers(): Promise<DockerContainer[]> {
    const containers = await this.getContainers();
    await this.updateDockerPanel();
    return containers;
  }

  private async startContainer(args?: { id?: string; name?: string }): Promise<void> {
    if (!args?.id && !args?.name) {
      throw new Error('Container ID or name required');
    }

    const identifier = args.id || args.name!;
    const dockerPath = this.context.config.dockerPath || 'docker';

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} start ${identifier}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Container started:', identifier);
          this.updateDockerPanel();
          resolve();
        }
      });
    });
  }

  private async stopContainer(args?: { id?: string; name?: string }): Promise<void> {
    if (!args?.id && !args?.name) {
      throw new Error('Container ID or name required');
    }

    const identifier = args.id || args.name!;
    const dockerPath = this.context.config.dockerPath || 'docker';

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} stop ${identifier}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Container stopped:', identifier);
          this.updateDockerPanel();
          resolve();
        }
      });
    });
  }

  private async removeContainer(args?: { id?: string; name?: string; force?: boolean }): Promise<void> {
    if (!args?.id && !args?.name) {
      throw new Error('Container ID or name required');
    }

    const identifier = args.id || args.name!;
    const dockerPath = this.context.config.dockerPath || 'docker';
    const forceFlag = args.force ? ' -f' : '';

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} rm${forceFlag} ${identifier}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Container removed:', identifier);
          this.updateDockerPanel();
          resolve();
        }
      });
    });
  }

  private async listImages(): Promise<DockerImage[]> {
    const images = await this.getImages();
    await this.updateDockerPanel();
    return images;
  }

  private async pullImage(args?: { name?: string; tag?: string }): Promise<void> {
    const imageName = args?.name || await this.promptForImageName();
    if (!imageName) throw new Error('Image name required');

    const fullName = args?.tag ? `${imageName}:${args.tag}` : imageName;
    const dockerPath = this.context.config.dockerPath || 'docker';

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} pull ${fullName}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Image pulled:', fullName);
          this.updateDockerPanel();
          resolve();
        }
      });
    });
  }

  private async buildImage(args?: { tag?: string; context?: string; dockerfile?: string }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const context = args?.context || '.';
    const dockerfile = args?.dockerfile ? `-f ${args.dockerfile}` : '';
    const tag = args?.tag ? `-t ${args.tag}` : '';
    const dockerPath = this.context.config.dockerPath || 'docker';

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} build ${dockerfile} ${tag} ${context}`, 
        { cwd: workspacePath }, 
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            this.context.logger.info('Image built successfully');
            this.updateDockerPanel();
            resolve();
          }
        }
      );
    });
  }

  private async composeUp(args?: { detach?: boolean; build?: boolean }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const detachFlag = args?.detach !== false ? '-d' : '';
    const buildFlag = args?.build ? '--build' : '';

    return new Promise((resolve, reject) => {
      exec(`docker-compose up ${detachFlag} ${buildFlag}`, 
        { cwd: workspacePath }, 
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            this.context.logger.info('Docker Compose up completed');
            this.updateDockerPanel();
            resolve();
          }
        }
      );
    });
  }

  private async composeDown(args?: { volumes?: boolean }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const volumesFlag = args?.volumes ? '-v' : '';

    return new Promise((resolve, reject) => {
      exec(`docker-compose down ${volumesFlag}`, 
        { cwd: workspacePath }, 
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            this.context.logger.info('Docker Compose down completed');
            this.updateDockerPanel();
            resolve();
          }
        }
      );
    });
  }

  private async showLogs(args?: { id?: string; name?: string; follow?: boolean; tail?: number }): Promise<void> {
    if (!args?.id && !args?.name) {
      throw new Error('Container ID or name required');
    }

    const identifier = args.id || args.name!;
    const dockerPath = this.context.config.dockerPath || 'docker';
    const followFlag = args.follow ? '-f' : '';
    const tailFlag = args.tail ? `--tail ${args.tail}` : '';

    // Show logs in output channel
    if (this.context.config.showContainerLogs) {
      this.context.ui.showOutput(`Docker logs for ${identifier}`);
    }

    return new Promise((resolve, reject) => {
      exec(`${dockerPath} logs ${followFlag} ${tailFlag} ${identifier}`, 
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            if (this.context.config.showContainerLogs) {
              this.context.ui.appendOutput(stdout, 'Docker');
            }
            resolve();
          }
        }
      );
    });
  }

  private async promptForImageName(): Promise<string | null> {
    return this.context.ui.showInputDialog({
      title: 'Pull Docker Image',
      placeholder: 'Enter image name (e.g., nginx:latest)...',
      multiline: false
    });
  }
}

// Supporting classes

class ContainerMonitor extends EventEmitter {
  private monitorInterval?: NodeJS.Timeout;

  constructor(private context: PluginContext) {
    super();
  }

  async start(): Promise<void> {
    this.context.logger.info('Starting Docker container monitoring');
    
    // Monitor for container events
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkContainerEvents();
      } catch (error) {
        this.context.logger.error('Container monitor error:', error);
      }
    }, 5000);
  }

  private async checkContainerEvents(): Promise<void> {
    // This would monitor Docker events and emit changes
    this.emit('containersChanged');
  }

  async cleanup(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
}

// Supporting interfaces

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

interface DockerImage {
  repository: string;
  tag: string;
  id: string;
  size: string;
}

interface ProjectDockerInfo {
  hasDockerfile: boolean;
  hasComposeFile: boolean;
  projectPath: string;
}