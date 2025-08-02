/**
 * Git Integration Plugin for Craft Code
 * Provides comprehensive Git version control functionality
 */
import { Plugin, PluginContext, PluginMetadata } from '../../plugin-sdk/types';
export default class GitIntegrationPlugin implements Plugin {
    metadata: PluginMetadata;
    private context;
    private gitMonitor;
    private branchWatcher;
    private statusBarItem;
    private gitPanel;
    /**
     * Activate the Git integration plugin
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
    onProjectOpen(projectPath: string): Promise<void>;
    /**
     * Handle file change events
     */
    onFileChange(filePath: string, changeType: 'create' | 'modify' | 'delete'): Promise<void>;
    private setupUI;
    private registerCommands;
    private startMonitoring;
    private isGitRepository;
    private initializeRepository;
    private getCurrentBranch;
    private getRepositoryStatus;
    private updateStatusBar;
    private updateGitPanel;
    private generateGitPanelHTML;
    private updateStatusBarVisibility;
    private getWorkspacePath;
    private showStatus;
    private commitChanges;
    private push;
    private pull;
    private manageBranches;
    private listBranches;
    private createBranch;
    private deleteBranch;
    private checkout;
    private merge;
    private showLog;
    private promptForCommitMessage;
}
//# sourceMappingURL=index.d.ts.map