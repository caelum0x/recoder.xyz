/**
 * Deployment Providers Plugin for Craft Code
 * Provides multi-platform deployment capabilities
 */
import { Plugin, PluginContext, PluginMetadata, PluginCapabilities, Project } from '../../plugin-sdk/types';
export default class DeploymentProvidersPlugin implements Plugin {
    metadata: PluginMetadata;
    capabilities: PluginCapabilities;
    private context;
    private providerManager;
    private deploymentPanel;
    private statusBarItem;
    private deploymentHistory;
    private activeDeployments;
    /**
     * Activate the Deployment Providers plugin
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
    private detectDeploymentConfigs;
    private updateDeploymentPanel;
    private generateDeploymentPanelHTML;
    private getProviderIcon;
    private getEnvironmentStatusIcon;
    private getDeploymentStatusIcon;
    private updateStatusBarVisibility;
    private getWorkspacePath;
    private loadDeploymentHistory;
    private saveDeploymentHistory;
    private quickDeploy;
    private configureProvider;
    private manageEnvironments;
    private showDeploymentHistory;
    private rollback;
    private viewLogs;
    private checkStatus;
    private promoteEnvironment;
    private buildProject;
    private detectBuildCommand;
    private getBuildCommandForFile;
    private runCommand;
    private determineEnvironment;
    private getCurrentBranch;
    private getCurrentCommit;
    private generateDeploymentId;
    private updateDeploymentProgress;
    private updateDeploymentStatus;
    private cancelDeployment;
    private showDeployConfirmation;
    private promptForProvider;
    private promptForEnvironment;
    private editEnvironment;
    private addEnvironment;
    private viewDeploymentDetails;
    private openUrl;
}
//# sourceMappingURL=index.d.ts.map