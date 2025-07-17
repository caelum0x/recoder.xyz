import * as vscode from 'vscode';
import { PlannerProvider } from './providers/plannerProvider';
import { AgentProvider } from './providers/agentProvider';
import { ProjectProvider } from './providers/projectProvider';
import { ValidationProvider } from './providers/validationProvider';
import { PlannerView } from './views/plannerView';
import { ChatView } from './views/chatView';
import { CodeCraftService } from './services/cliService';
import { ConfigService } from './services/configService';

export function activate(context: vscode.ExtensionContext) {
    console.log('CodeCraft extension is now active!');

    // Initialize services
    const configService = new ConfigService();
    const codeCraftService = new CodeCraftService(configService);

    // Initialize providers
    const plannerProvider = new PlannerProvider(codeCraftService);
    const agentProvider = new AgentProvider(codeCraftService);
    const projectProvider = new ProjectProvider(codeCraftService);
    const validationProvider = new ValidationProvider(codeCraftService);

    // Register tree data providers
    vscode.window.createTreeView('codecraft-agents', {
        treeDataProvider: agentProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('codecraft-projects', {
        treeDataProvider: projectProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('codecraft-validation', {
        treeDataProvider: validationProvider,
        showCollapseAll: true
    });

    // Register webview providers
    const plannerView = new PlannerView(context.extensionUri, codeCraftService);
    const chatView = new ChatView(context.extensionUri, codeCraftService);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codecraft-planner', plannerView)
    );

    // Register commands
    const commands = [
        // Project Planning
        vscode.commands.registerCommand('codecraft.planProject', async () => {
            await handlePlanProject(codeCraftService);
        }),

        // Code Generation
        vscode.commands.registerCommand('codecraft.generateCode', async (projectItem?) => {
            await handleGenerateCode(codeCraftService, projectItem);
        }),

        // Integration Validation
        vscode.commands.registerCommand('codecraft.validateIntegrations', async () => {
            await handleValidateIntegrations(codeCraftService);
        }),

        // Agent Management
        vscode.commands.registerCommand('codecraft.createAgent', async () => {
            await handleCreateAgent(codeCraftService);
        }),

        // Chat Interface
        vscode.commands.registerCommand('codecraft.openChat', async () => {
            await chatView.show();
        }),

        // Refresh Commands
        vscode.commands.registerCommand('codecraft.refreshPlanner', () => {
            plannerProvider.refresh();
        }),

        vscode.commands.registerCommand('codecraft.refreshAgents', () => {
            agentProvider.refresh();
        }),

        vscode.commands.registerCommand('codecraft.refreshProjects', () => {
            projectProvider.refresh();
        }),

        vscode.commands.registerCommand('codecraft.refreshValidation', () => {
            validationProvider.refresh();
        })
    ];

    context.subscriptions.push(...commands);

    // Register configuration change handler
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('codecraft')) {
                configService.reload();
                vscode.window.showInformationMessage('CodeCraft configuration updated!');
            }
        })
    );

    // Show welcome message on first activation
    const isFirstActivation = context.globalState.get('codecraft.firstActivation', true);
    if (isFirstActivation) {
        showWelcomeMessage();
        context.globalState.update('codecraft.firstActivation', false);
    }
}

async function handlePlanProject(service: CodeCraftService) {
    try {
        const description = await vscode.window.showInputBox({
            prompt: 'Describe your project (e.g., "Build a Solana DEX with real trading functionality")',
            placeHolder: 'Enter project description...',
            validateInput: (value) => {
                if (!value || value.trim().length < 10) {
                    return 'Please provide a detailed project description (at least 10 characters)';
                }
                return null;
            }
        });

        if (!description) return;

        const projectType = await vscode.window.showQuickPick([
            { label: 'Web Application', value: 'web' },
            { label: 'Mobile Application', value: 'mobile' },
            { label: 'Blockchain/Web3', value: 'blockchain' },
            { label: 'AI/ML Application', value: 'ai' },
            { label: 'Full-Stack Application', value: 'fullstack' }
        ], {
            placeHolder: 'Select project type'
        });

        if (!projectType) return;

        const options = {
            type: projectType.value,
            interactive: await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Enable interactive planning?'
            }) === 'Yes',
            validate: true
        };

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating project plan...',
            cancellable: false
        }, async (progress) => {
            const result = await service.planProject(description, options);
            
            if (result.success) {
                vscode.window.showInformationMessage(
                    `Project plan created: ${result.planFile}`,
                    'Open Plan', 'Generate Code'
                ).then(selection => {
                    if (selection === 'Open Plan') {
                        vscode.workspace.openTextDocument(result.planFile).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    } else if (selection === 'Generate Code') {
                        vscode.commands.executeCommand('codecraft.generateCode');
                    }
                });
            } else {
                vscode.window.showErrorMessage(`Planning failed: ${result.error}`);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error planning project: ${error}`);
    }
}

async function handleGenerateCode(service: CodeCraftService, projectItem?: any) {
    try {
        let planFile: string;

        if (projectItem && projectItem.planFile) {
            planFile = projectItem.planFile;
        } else {
            // Let user select plan file
            const files = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Plan Files': ['md', 'json'],
                    'All Files': ['*']
                },
                title: 'Select Project Plan File'
            });

            if (!files || files.length === 0) return;
            planFile = files[0].fsPath;
        }

        const outputDir = await vscode.window.showInputBox({
            prompt: 'Enter output directory for generated code',
            value: './generated-project',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please specify an output directory';
                }
                return null;
            }
        });

        if (!outputDir) return;

        const options = {
            outputDir,
            realIntegrations: await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Include real service integrations?'
            }) === 'Yes',
            validate: await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Validate generated code?'
            }) === 'Yes',
            test: true,
            deployConfig: true,
            envTemplate: true
        };

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating production code...',
            cancellable: false
        }, async (progress) => {
            const result = await service.generateCode(planFile, options);
            
            if (result.success) {
                vscode.window.showInformationMessage(
                    `Code generated successfully in: ${result.outputDir}`,
                    'Open Folder', 'Run Tests'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.outputDir));
                    } else if (selection === 'Run Tests') {
                        // Open integrated terminal and run tests
                        const terminal = vscode.window.createTerminal('CodeCraft Tests');
                        terminal.sendText(`cd "${result.outputDir}" && npm test`);
                        terminal.show();
                    }
                });
            } else {
                vscode.window.showErrorMessage(`Code generation failed: ${result.error}`);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error generating code: ${error}`);
    }
}

async function handleValidateIntegrations(service: CodeCraftService) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a project folder.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Validating integrations...',
            cancellable: false
        }, async (progress) => {
            const result = await service.validateIntegrations(workspaceFolder.uri.fsPath);
            
            if (result.success) {
                const passedChecks = result.checks.filter((check: any) => check.passed).length;
                const totalChecks = result.checks.length;
                
                vscode.window.showInformationMessage(
                    `Validation complete: ${passedChecks}/${totalChecks} checks passed`,
                    'View Results'
                ).then(selection => {
                    if (selection === 'View Results') {
                        // Show validation results in webview
                        showValidationResults(result.checks);
                    }
                });
            } else {
                vscode.window.showErrorMessage(`Validation failed: ${result.error}`);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error validating integrations: ${error}`);
    }
}

async function handleCreateAgent(service: CodeCraftService) {
    try {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter agent name',
            placeHolder: 'e.g., "blockchain-expert"',
            validateInput: (value) => {
                if (!value || value.trim().length < 3) {
                    return 'Agent name must be at least 3 characters';
                }
                return null;
            }
        });

        if (!name) return;

        const type = await vscode.window.showQuickPick([
            { label: 'Web Development', value: 'web' },
            { label: 'Mobile Development', value: 'mobile' },
            { label: 'Blockchain Development', value: 'blockchain' },
            { label: 'AI/ML Development', value: 'ai' },
            { label: 'Backend Development', value: 'backend' },
            { label: 'DevOps', value: 'devops' }
        ], {
            placeHolder: 'Select agent specialization'
        });

        if (!type) return;

        const model = await vscode.window.showQuickPick([
            { label: 'GPT-4', value: 'gpt-4' },
            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
            { label: 'Claude 3 Opus', value: 'claude-3-opus' },
            { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet' },
            { label: 'Local Llama2', value: 'ollama/llama2' },
            { label: 'Local CodeLlama', value: 'ollama/codellama' }
        ], {
            placeHolder: 'Select AI model'
        });

        if (!model) return;

        const options = {
            type: type.value,
            model: model.value
        };

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating AI agent...',
            cancellable: false
        }, async (progress) => {
            const result = await service.createAgent(name, options);
            
            if (result.success) {
                vscode.window.showInformationMessage(
                    `Agent '${name}' created successfully!`,
                    'Configure Agent'
                ).then(selection => {
                    if (selection === 'Configure Agent') {
                        // Open agent configuration
                        vscode.commands.executeCommand('codecraft.configureAgent', result.agentId);
                    }
                });
            } else {
                vscode.window.showErrorMessage(`Agent creation failed: ${result.error}`);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error creating agent: ${error}`);
    }
}

function showWelcomeMessage() {
    vscode.window.showInformationMessage(
        'Welcome to CodeCraft! Generate production-ready code with AI.',
        'Get Started', 'View Documentation'
    ).then(selection => {
        if (selection === 'Get Started') {
            vscode.commands.executeCommand('codecraft.planProject');
        } else if (selection === 'View Documentation') {
            vscode.env.openExternal(vscode.Uri.parse('https://docs.codecraft.dev'));
        }
    });
}

function showValidationResults(checks: any[]) {
    const panel = vscode.window.createWebviewPanel(
        'codecraft-validation',
        'Validation Results',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    panel.webview.html = getValidationWebviewContent(checks);
}

function getValidationWebviewContent(checks: any[]) {
    const passedChecks = checks.filter(check => check.passed);
    const failedChecks = checks.filter(check => !check.passed);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Validation Results</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .check {
                margin: 10px 0;
                padding: 10px;
                border-radius: 4px;
            }
            .check.passed {
                background-color: var(--vscode-testing-iconPassed);
                color: white;
            }
            .check.failed {
                background-color: var(--vscode-testing-iconFailed);
                color: white;
            }
            .summary {
                font-size: 1.2em;
                margin-bottom: 20px;
                padding: 15px;
                border-radius: 4px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
            }
        </style>
    </head>
    <body>
        <div class="summary">
            <h2>Validation Summary</h2>
            <p>✅ Passed: ${passedChecks.length}</p>
            <p>❌ Failed: ${failedChecks.length}</p>
            <p>Total: ${checks.length}</p>
        </div>

        <h3>Results</h3>
        ${checks.map(check => `
            <div class="check ${check.passed ? 'passed' : 'failed'}">
                <strong>${check.name}</strong>
                <p>${check.result}</p>
            </div>
        `).join('')}
    </body>
    </html>`;
}

export function deactivate() {
    console.log('CodeCraft extension is deactivated');
}