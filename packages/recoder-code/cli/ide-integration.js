const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class IDEIntegration {
  constructor() {
    this.ideEnvironment = this.detectIDE();
    this.workspaceRoot = this.findWorkspaceRoot();
    this.ideSpecificSettings = {};
    
    this.initializeIntegration();
  }

  detectIDE() {
    // Detect if running from within an IDE
    const env = process.env;
    
    if (env.VSCODE_PID || env.VSCODE_IPC_HOOK || env.TERM_PROGRAM === 'vscode') {
      return 'vscode';
    }
    
    if (env.JETBRAINS_IDE || env.IDEA_INITIAL_DIRECTORY) {
      return 'jetbrains';
    }
    
    if (env.ATOM_HOME) {
      return 'atom';
    }
    
    if (env.SUBLIME_TEXT) {
      return 'sublime';
    }
    
    if (env.VIM || env.NVIM) {
      return 'vim';
    }
    
    if (env.EMACS) {
      return 'emacs';
    }
    
    // Check for integrated terminals
    if (env.TERM_PROGRAM) {
      switch (env.TERM_PROGRAM) {
        case 'iTerm.app':
          return 'iterm';
        case 'Apple_Terminal':
          return 'terminal';
        case 'vscode':
          return 'vscode';
        default:
          return 'terminal';
      }
    }
    
    return 'terminal';
  }

  findWorkspaceRoot() {
    let currentDir = process.cwd();
    
    // Look for common workspace indicators
    const workspaceIndicators = [
      '.git',
      'package.json',
      'Cargo.toml',
      'pyproject.toml',
      'requirements.txt',
      'pom.xml',
      'build.gradle',
      '.vscode',
      '.idea'
    ];
    
    while (currentDir !== path.dirname(currentDir)) {
      for (const indicator of workspaceIndicators) {
        if (fs.existsSync(path.join(currentDir, indicator))) {
          return currentDir;
        }
      }
      currentDir = path.dirname(currentDir);
    }
    
    return process.cwd();
  }

  initializeIntegration() {
    console.log(chalk.blue(`🔧 IDE Integration: ${this.ideEnvironment}`));
    
    // Set IDE-specific configurations
    switch (this.ideEnvironment) {
      case 'vscode':
        this.initializeVSCodeIntegration();
        break;
      case 'jetbrains':
        this.initializeJetBrainsIntegration();
        break;
      case 'vim':
      case 'nvim':
        this.initializeVimIntegration();
        break;
      default:
        this.initializeTerminalIntegration();
    }
  }

  initializeVSCodeIntegration() {
    this.ideSpecificSettings = {
      preferredEditor: 'code',
      openCommand: 'code',
      fileProtocol: 'vscode://file',
      supportsGoto: true,
      supportsDebug: true,
      terminalIntegration: true
    };
    
    // Check for VS Code workspace settings
    const vscodePath = path.join(this.workspaceRoot, '.vscode');
    if (fs.existsSync(vscodePath)) {
      console.log(chalk.green('✅ VS Code workspace detected'));
      this.loadVSCodeSettings(vscodePath);
    }
  }

  initializeJetBrainsIntegration() {
    this.ideSpecificSettings = {
      preferredEditor: 'idea',
      openCommand: 'idea',
      supportsGoto: true,
      supportsDebug: true,
      terminalIntegration: true
    };
    
    // Check for JetBrains project files
    const ideaPath = path.join(this.workspaceRoot, '.idea');
    if (fs.existsSync(ideaPath)) {
      console.log(chalk.green('✅ JetBrains IDE workspace detected'));
    }
  }

  initializeVimIntegration() {
    this.ideSpecificSettings = {
      preferredEditor: process.env.NVIM ? 'nvim' : 'vim',
      openCommand: process.env.NVIM ? 'nvim' : 'vim',
      supportsGoto: true,
      supportsDebug: false,
      terminalIntegration: true
    };
  }

  initializeTerminalIntegration() {
    this.ideSpecificSettings = {
      preferredEditor: process.env.EDITOR || 'nano',
      openCommand: process.env.EDITOR || 'nano',
      supportsGoto: false,
      supportsDebug: false,
      terminalIntegration: true
    };
  }

  loadVSCodeSettings(vscodePath) {
    try {
      const settingsPath = path.join(vscodePath, 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        this.ideSpecificSettings.vscodeSettings = settings;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load VS Code settings: ${error.message}`));
    }
  }

  // File operations that work with IDEs
  async openFileInIDE(filePath, lineNumber = null) {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`❌ File not found: ${filePath}`));
      return false;
    }

    const absolutePath = path.resolve(filePath);
    
    try {
      switch (this.ideEnvironment) {
        case 'vscode':
          return await this.openInVSCode(absolutePath, lineNumber);
        case 'jetbrains':
          return await this.openInJetBrains(absolutePath, lineNumber);
        case 'vim':
        case 'nvim':
          return await this.openInVim(absolutePath, lineNumber);
        default:
          return await this.openInEditor(absolutePath, lineNumber);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to open file: ${error.message}`));
      return false;
    }
  }

  async openInVSCode(filePath, lineNumber) {
    const { exec } = require('child_process');
    const command = lineNumber 
      ? `code -g "${filePath}:${lineNumber}"`
      : `code "${filePath}"`;
    
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) {
          console.log(chalk.yellow(`⚠️  VS Code not available, using default editor`));
          this.openInEditor(filePath, lineNumber);
          resolve(false);
        } else {
          console.log(chalk.green(`✅ Opened in VS Code: ${path.basename(filePath)}`));
          resolve(true);
        }
      });
    });
  }

  async openInJetBrains(filePath, lineNumber) {
    const { exec } = require('child_process');
    const command = lineNumber 
      ? `idea --line ${lineNumber} "${filePath}"`
      : `idea "${filePath}"`;
    
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) {
          console.log(chalk.yellow(`⚠️  JetBrains IDE not available, using default editor`));
          this.openInEditor(filePath, lineNumber);
          resolve(false);
        } else {
          console.log(chalk.green(`✅ Opened in JetBrains IDE: ${path.basename(filePath)}`));
          resolve(true);
        }
      });
    });
  }

  async openInVim(filePath, lineNumber) {
    const { spawn } = require('child_process');
    const editor = this.ideSpecificSettings.preferredEditor;
    
    const args = lineNumber ? ['+' + lineNumber, filePath] : [filePath];
    
    console.log(chalk.blue(`📝 Opening in ${editor}: ${path.basename(filePath)}`));
    
    const vim = spawn(editor, args, {
      stdio: 'inherit',
      cwd: path.dirname(filePath)
    });
    
    return new Promise((resolve) => {
      vim.on('close', () => {
        console.log(chalk.green(`✅ Finished editing: ${path.basename(filePath)}`));
        resolve(true);
      });
      
      vim.on('error', (error) => {
        console.log(chalk.red(`❌ Editor error: ${error.message}`));
        resolve(false);
      });
    });
  }

  async openInEditor(filePath, lineNumber) {
    const { spawn } = require('child_process');
    const editor = this.ideSpecificSettings.preferredEditor;
    
    console.log(chalk.blue(`📝 Opening in ${editor}: ${path.basename(filePath)}`));
    
    const editorProcess = spawn(editor, [filePath], {
      stdio: 'inherit',
      cwd: path.dirname(filePath)
    });
    
    return new Promise((resolve) => {
      editorProcess.on('close', () => {
        console.log(chalk.green(`✅ Finished editing: ${path.basename(filePath)}`));
        resolve(true);
      });
      
      editorProcess.on('error', (error) => {
        console.log(chalk.red(`❌ Editor error: ${error.message}`));
        resolve(false);
      });
    });
  }

  // Create IDE-specific project files
  async createIDEProjectFiles() {
    if (this.ideEnvironment === 'vscode') {
      await this.createVSCodeProjectFiles();
    } else if (this.ideEnvironment === 'jetbrains') {
      await this.createJetBrainsProjectFiles();
    }
  }

  async createVSCodeProjectFiles() {
    const vscodePath = path.join(this.workspaceRoot, '.vscode');
    
    if (!fs.existsSync(vscodePath)) {
      fs.mkdirSync(vscodePath);
    }
    
    // Create basic VS Code settings optimized for AI development
    const settings = {
      "editor.wordWrap": "on",
      "editor.minimap.enabled": false,
      "terminal.integrated.defaultProfile.linux": "bash",
      "terminal.integrated.defaultProfile.osx": "zsh",
      "terminal.integrated.defaultProfile.windows": "PowerShell",
      "files.autoSave": "afterDelay",
      "editor.formatOnSave": true,
      "editor.tabSize": 2,
      "workbench.colorTheme": "Default Dark+",
      "terminal.integrated.fontSize": 14
    };
    
    const settingsPath = path.join(vscodePath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(chalk.green('✅ Created VS Code workspace settings'));
    }
    
    // Create tasks for recoder
    const tasks = {
      "version": "2.0.0",
      "tasks": [
        {
          "label": "Open Recoder Chat",
          "type": "shell",
          "command": "recoder",
          "group": "build",
          "presentation": {
            "echo": true,
            "reveal": "always",
            "focus": false,
            "panel": "new"
          },
          "problemMatcher": []
        },
        {
          "label": "Recoder Setup",
          "type": "shell",
          "command": "recoder",
          "args": ["--setup"],
          "group": "build",
          "presentation": {
            "echo": true,
            "reveal": "always",
            "focus": true
          }
        }
      ]
    };
    
    const tasksPath = path.join(vscodePath, 'tasks.json');
    if (!fs.existsSync(tasksPath)) {
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
      console.log(chalk.green('✅ Created VS Code tasks for Recoder'));
    }
  }

  async createJetBrainsProjectFiles() {
    // JetBrains project setup would go here
    console.log(chalk.blue('📝 JetBrains IDE integration available'));
  }

  // Get current context for the IDE
  getCurrentContext() {
    return {
      ide: this.ideEnvironment,
      workspaceRoot: this.workspaceRoot,
      settings: this.ideSpecificSettings,
      supportsGoto: this.ideSpecificSettings.supportsGoto,
      supportsDebug: this.ideSpecificSettings.supportsDebug
    };
  }

  // Generate file links that work in the current IDE
  generateFileLink(filePath, lineNumber = null) {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    
    switch (this.ideEnvironment) {
      case 'vscode':
        return lineNumber 
          ? `vscode://file/${filePath}:${lineNumber}`
          : `vscode://file/${filePath}`;
      case 'jetbrains':
        return lineNumber
          ? `idea://open?file=${filePath}&line=${lineNumber}`
          : `idea://open?file=${filePath}`;
      default:
        return lineNumber
          ? `${relativePath}:${lineNumber}`
          : relativePath;
    }
  }

  // Format output for IDE consumption
  formatForIDE(message, metadata = {}) {
    if (this.ideEnvironment === 'terminal') {
      return message;
    }
    
    // Add IDE-specific formatting
    let formatted = message;
    
    // Add clickable file references
    if (metadata.files) {
      metadata.files.forEach(file => {
        const link = this.generateFileLink(file.path, file.line);
        formatted = formatted.replace(
          new RegExp(file.path, 'g'),
          `[${file.path}](${link})`
        );
      });
    }
    
    return formatted;
  }
}

module.exports = IDEIntegration;