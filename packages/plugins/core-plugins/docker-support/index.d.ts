/**
 * Docker Support Plugin for Craft Code
 * Provides Docker container management and integration
 */
import { Plugin, PluginContext, PluginMetadata, PluginCapabilities, Project } from '../../plugin-sdk/types';
export default class DockerSupportPlugin implements Plugin {
    metadata: PluginMetadata;
    capabilities: PluginCapabilities;
    private context;
    private containerMonitor;
    private dockerPanel;
    private dockerTerminal;
    private statusUpdateInterval?;
    /**
     * Activate the Docker support plugin
     */
    activate(context: PluginContext): Promise<void>;
    /**
     * Deactivate the plugin
     */
    deactivate(): Promise<void>;
    /**
     * Handle configuration changes
     */
    onConfigChange(config: Record<string, any>): Promise<void>;
    /**
     * Handle commands
     */
    onCommand(command: string, args?: any): Promise<any>;
    /**
     * Handle project open events
     */
    onProjectOpen(project: Project): Promise<void>;
    /**
     * Handle file change events
     */
    onFileChange(filePath: string): Promise<void>;
    private setupUI;
    private registerCommands;
    private startMonitoring;
    private updateRefreshInterval;
    private verifyDockerInstallation;
    private hasDockerfile;
    private hasComposeFile;
    private initializeDockerProject;
    private updateDockerPanel;
    private getContainers;
    private getImages;
    private getProjectDockerInfo;
    private generateDockerPanelHTML;
    private getContainerStatusClass;
    private isContainerRunning;
    private getWorkspacePath;
    private listContainers;
    private startContainer;
    private stopContainer;
    private removeContainer;
    private listImages;
    private pullImage;
    private buildImage;
    private composeUp;
    private composeDown;
    private showLogs;
    private promptForImageName;
}
//# sourceMappingURL=index.d.ts.map