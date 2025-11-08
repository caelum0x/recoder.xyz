/**
 * Scripts Manager - Automation scripts integration
 * Provides CLI access to PowerShell and automation scripts
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const os = require('os');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const execAsync = promisify(exec);

class ScriptsManager {
  constructor() {
    this.scriptsDir = path.join(__dirname, '../Script');
    this.utilityScriptsDir = path.join(__dirname, '../scripts');
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.scriptsConfigPath = path.join(this.configDir, 'scripts-config.json');
    
    this.defaultConfig = {
      powershellPath: 'powershell',
      bashPath: '/bin/bash',
      pythonPath: 'python3',
      nodeJsPath: 'node',
      defaultShell: os.platform() === 'win32' ? 'powershell' : 'bash',
      scriptHistory: []
    };

    this.supportedExtensions = {
      '.ps1': 'powershell',
      '.sh': 'bash',
      '.py': 'python',
      '.js': 'node',
      '.bat': 'cmd',
      '.cmd': 'cmd'
    };
  }

  loadScriptsConfig() {
    try {
      if (fs.existsSync(this.scriptsConfigPath)) {
        return JSON.parse(fs.readFileSync(this.scriptsConfigPath, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not load scripts config: ${error.message}`));
    }
    return { ...this.defaultConfig };
  }

  saveScriptsConfig(config) {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.scriptsConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save scripts config: ${error.message}`));
    }
  }

  async checkShellAvailable(shell) {
    try {
      let command;
      switch (shell) {
        case 'powershell':
          command = os.platform() === 'win32' ? 'powershell -Command "Get-Host"' : 'pwsh -Command "Get-Host"';
          break;
        case 'bash':
          command = 'bash --version';
          break;
        case 'python':
          command = 'python3 --version';
          break;
        case 'node':
          command = 'node --version';
          break;
        default:
          return { available: false, error: 'Unknown shell' };
      }

      const { stdout } = await execAsync(command);
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  async listScripts() {
    console.log(chalk.cyan('📝 Available Scripts'));
    console.log('');

    const allScripts = [];

    // List user scripts from Script/ directory
    if (fs.existsSync(this.scriptsDir)) {
      try {
        const files = fs.readdirSync(this.scriptsDir, { withFileTypes: true });
        const scripts = [];

        console.log(chalk.yellow('📋 User Scripts (Script/ directory):'));

        for (const file of files) {
          if (file.isFile()) {
            const extension = path.extname(file.name);
            const interpreter = this.supportedExtensions[extension] || 'unknown';
            const fullPath = path.join(this.scriptsDir, file.name);
            
            // Try to read description from script
            const description = await this.getScriptDescription(fullPath);
            
            const script = {
              name: file.name,
              extension,
              interpreter,
              description,
              path: fullPath,
              type: 'user'
            };
            
            scripts.push(script);
            allScripts.push(script);

            const interpreterColor = interpreter === 'unknown' ? chalk.gray : chalk.green;
            console.log(`   ${chalk.blue(file.name)} ${interpreterColor(`(${interpreter})`)}`);
            if (description) {
              console.log(`     ${chalk.gray(description)}`);
            }
          }
        }

        console.log(chalk.blue(`   Found ${scripts.length} user scripts`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to list user scripts: ${error.message}`));
      }
    } else {
      console.log(chalk.yellow(`⚠️ User scripts directory not found: ${this.scriptsDir}`));
    }

    console.log('');

    // List utility scripts from scripts/ directory
    if (fs.existsSync(this.utilityScriptsDir)) {
      try {
        const files = fs.readdirSync(this.utilityScriptsDir, { withFileTypes: true });
        const utilityScripts = [];

        console.log(chalk.yellow('🔧 Utility Scripts (scripts/ directory):'));

        for (const file of files) {
          if (file.isFile()) {
            const extension = path.extname(file.name);
            const interpreter = extension === '.js' ? 'node' : extension === '.ts' ? 'typescript' : 'unknown';
            const fullPath = path.join(this.utilityScriptsDir, file.name);
            
            // Try to read description from script
            const description = await this.getScriptDescription(fullPath);
            
            const script = {
              name: file.name,
              extension,
              interpreter,
              description,
              path: fullPath,
              type: 'utility'
            };
            
            utilityScripts.push(script);
            allScripts.push(script);

            const interpreterColor = interpreter === 'unknown' ? chalk.gray : chalk.green;
            console.log(`   ${chalk.blue(file.name)} ${interpreterColor(`(${interpreter})`)}`);
            if (description) {
              console.log(`     ${chalk.gray(description)}`);
            }
          }
        }

        console.log(chalk.blue(`   Found ${utilityScripts.length} utility scripts`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to list utility scripts: ${error.message}`));
      }
    }

    console.log('');
    console.log(chalk.blue(`💡 Total: ${allScripts.length} scripts available`));
    
    if (allScripts.length > 0) {
      console.log(chalk.yellow('📝 Usage:'));
      console.log(`   recoder-code scripts run ${allScripts[0].name}`);
      console.log('   recoder-code scripts run <script-name> [args...]');
      console.log('   recoder-code scripts utility health-check  # Run utility script');
    }

    return allScripts;
  }

  async getScriptDescription(scriptPath) {
    try {
      const content = fs.readFileSync(scriptPath, 'utf8');
      const lines = content.split('\n').slice(0, 10); // Check first 10 lines
      
      // Look for common comment patterns
      for (const line of lines) {
        const trimmed = line.trim();
        
        // PowerShell comments
        if (trimmed.startsWith('# Description:') || trimmed.startsWith('# ')) {
          return trimmed.replace(/^#\s*(Description:\s*)?/, '');
        }
        
        // Bash comments  
        if (trimmed.startsWith('# ') && !trimmed.startsWith('#!/')) {
          return trimmed.replace(/^#\s*/, '');
        }
        
        // Python docstring
        if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
          return trimmed.replace(/^['"]*/,'').replace(/['"]*/,'');
        }
      }
    } catch (error) {
      // Ignore read errors
    }
    return null;
  }

  async runScript(scriptName, args = []) {
    console.log(chalk.cyan(`🚀 Running script: ${scriptName}`));

    if (!fs.existsSync(this.scriptsDir)) {
      console.log(chalk.red(`❌ Scripts directory not found: ${this.scriptsDir}`));
      return false;
    }

    const scriptPath = path.join(this.scriptsDir, scriptName);
    
    if (!fs.existsSync(scriptPath)) {
      console.log(chalk.red(`❌ Script not found: ${scriptName}`));
      console.log(chalk.blue('💡 Use "recoder-code scripts list" to see available scripts'));
      return false;
    }

    const extension = path.extname(scriptName);
    const interpreter = this.supportedExtensions[extension];

    if (!interpreter || interpreter === 'unknown') {
      console.log(chalk.red(`❌ Unsupported script type: ${extension}`));
      console.log(chalk.yellow('   Supported: .ps1, .sh, .py, .js, .bat, .cmd'));
      return false;
    }

    // Check if interpreter is available
    const shellCheck = await this.checkShellAvailable(interpreter);
    if (!shellCheck.available) {
      console.log(chalk.red(`❌ ${interpreter} is not available: ${shellCheck.error}`));
      return false;
    }

    console.log(chalk.green(`✅ Using ${interpreter}: ${shellCheck.version}`));

    try {
      const config = this.loadScriptsConfig();
      let command;
      let spawnArgs;

      switch (interpreter) {
        case 'powershell':
          if (os.platform() === 'win32') {
            command = 'powershell';
            spawnArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
          } else {
            command = 'pwsh';  // PowerShell Core on non-Windows
            spawnArgs = ['-File', scriptPath, ...args];
          }
          break;
        
        case 'bash':
          command = 'bash';
          spawnArgs = [scriptPath, ...args];
          break;
        
        case 'python':
          command = config.pythonPath;
          spawnArgs = [scriptPath, ...args];
          break;
        
        case 'node':
          command = config.nodeJsPath;
          spawnArgs = [scriptPath, ...args];
          break;
        
        case 'cmd':
          if (os.platform() === 'win32') {
            command = 'cmd';
            spawnArgs = ['/C', scriptPath, ...args];
          } else {
            console.log(chalk.red('❌ CMD scripts can only run on Windows'));
            return false;
          }
          break;
        
        default:
          console.log(chalk.red(`❌ Unknown interpreter: ${interpreter}`));
          return false;
      }

      console.log(chalk.blue(`Command: ${command} ${spawnArgs.join(' ')}`));
      console.log(chalk.gray('─'.repeat(50)));

      // Run the script
      const child = spawn(command, spawnArgs, {
        cwd: this.scriptsDir,
        stdio: 'inherit',
        shell: false
      });

      return new Promise((resolve) => {
        child.on('close', (code) => {
          console.log('');
          console.log(chalk.gray('─'.repeat(50)));
          
          if (code === 0) {
            console.log(chalk.green(`✅ Script completed successfully`));
            
            // Record successful execution
            config.scriptHistory.push({
              script: scriptName,
              timestamp: new Date().toISOString(),
              exitCode: code,
              success: true
            });
            this.saveScriptsConfig(config);
            
            resolve(true);
          } else {
            console.log(chalk.red(`❌ Script failed with exit code: ${code}`));
            
            // Record failed execution
            config.scriptHistory.push({
              script: scriptName,
              timestamp: new Date().toISOString(),
              exitCode: code,
              success: false
            });
            this.saveScriptsConfig(config);
            
            resolve(false);
          }
        });

        child.on('error', (error) => {
          console.log(chalk.red(`❌ Failed to run script: ${error.message}`));
          resolve(false);
        });
      });

    } catch (error) {
      console.log(chalk.red(`❌ Failed to run script: ${error.message}`));
      return false;
    }
  }

  async showScriptContent(scriptName) {
    console.log(chalk.cyan(`📄 Script Content: ${scriptName}`));

    if (!fs.existsSync(this.scriptsDir)) {
      console.log(chalk.red(`❌ Scripts directory not found: ${this.scriptsDir}`));
      return false;
    }

    const scriptPath = path.join(this.scriptsDir, scriptName);
    
    if (!fs.existsSync(scriptPath)) {
      console.log(chalk.red(`❌ Script not found: ${scriptName}`));
      return false;
    }

    try {
      const content = fs.readFileSync(scriptPath, 'utf8');
      console.log('');
      console.log(chalk.gray('─'.repeat(50)));
      console.log(content);
      console.log(chalk.gray('─'.repeat(50)));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to read script: ${error.message}`));
      return false;
    }
  }

  async showHistory() {
    console.log(chalk.cyan('📋 Script Execution History'));
    console.log('');

    const config = this.loadScriptsConfig();
    
    if (config.scriptHistory.length === 0) {
      console.log(chalk.blue('💡 No scripts have been run yet'));
      console.log(chalk.yellow('   Try: recoder-code scripts list'));
      return;
    }

    console.log(chalk.yellow('Recent executions:'));
    
    const recentHistory = config.scriptHistory.slice(-10).reverse();
    
    for (const entry of recentHistory) {
      const date = new Date(entry.timestamp).toLocaleString();
      const statusIcon = entry.success ? chalk.green('✅') : chalk.red('❌');
      const exitCode = entry.exitCode !== undefined ? `(${entry.exitCode})` : '';
      
      console.log(`   ${statusIcon} ${chalk.blue(entry.script)} ${chalk.gray(exitCode)} - ${chalk.gray(date)}`);
    }
  }

  async showSystemInfo() {
    console.log(chalk.cyan('🔧 Script Environment Information'));
    console.log('');

    const config = this.loadScriptsConfig();
    
    console.log(chalk.yellow('Operating System:'));
    console.log(`   Platform: ${os.platform()}`);
    console.log(`   Architecture: ${os.arch()}`);
    console.log(`   Release: ${os.release()}`);
    console.log('');

    console.log(chalk.yellow('Available Interpreters:'));
    
    const interpreters = ['powershell', 'bash', 'python', 'node'];
    
    for (const interpreter of interpreters) {
      const check = await this.checkShellAvailable(interpreter);
      const status = check.available ? 
        chalk.green(`✅ ${check.version}`) : 
        chalk.red(`❌ ${check.error}`);
      console.log(`   ${interpreter}: ${status}`);
    }

    console.log('');
    console.log(chalk.yellow('Configuration:'));
    console.log(`   Default Shell: ${config.defaultShell}`);
    console.log(`   Scripts Directory: ${this.scriptsDir}`);
    console.log(`   Scripts Found: ${fs.existsSync(this.scriptsDir) ? fs.readdirSync(this.scriptsDir).length : 0}`);
  }

  async showHelp() {
    console.log(chalk.cyan('📝 Recoder-Code Scripts Manager'));
    console.log('');
    console.log(chalk.yellow('📋 COMMANDS:'));
    console.log('  list       List all available scripts');
    console.log('  run        Execute a user script');
    console.log('  utility    Execute a utility script');
    console.log('  show       Display script content');
    console.log('  history    Show execution history');
    console.log('  info       Show system information');
    console.log('');
    console.log(chalk.yellow('📝 EXAMPLES:'));
    console.log('  recoder-code scripts list                    # List available scripts');
    console.log('  recoder-code scripts run setup.ps1          # Run PowerShell script');
    console.log('  recoder-code scripts utility health-check.js # Run utility script');
    console.log('  recoder-code scripts run deploy.sh --prod   # Run with arguments');
    console.log('  recoder-code scripts show config.py         # View script content');
    console.log('  recoder-code scripts history                # Show execution history');
    console.log('');
    console.log(chalk.yellow('🔧 SUPPORTED SCRIPT TYPES:'));
    console.log('  .ps1       PowerShell scripts');
    console.log('  .sh        Bash/shell scripts');
    console.log('  .py        Python scripts');
    console.log('  .js        Node.js scripts');
    console.log('  .bat/.cmd  Windows batch files');
    console.log('');
    console.log(chalk.blue('💡 Scripts are located in the Script/ directory'));
    console.log(chalk.blue('   Arguments are passed directly to the script'));
  }

  async runUtilityScript(scriptName, args = []) {
    console.log(chalk.cyan(`🔧 Running utility script: ${scriptName}`));

    if (!fs.existsSync(this.utilityScriptsDir)) {
      console.log(chalk.red(`❌ Utility scripts directory not found: ${this.utilityScriptsDir}`));
      return false;
    }

    const scriptPath = path.join(this.utilityScriptsDir, scriptName);
    
    if (!fs.existsSync(scriptPath)) {
      console.log(chalk.red(`❌ Utility script not found: ${scriptName}`));
      console.log(chalk.blue('💡 Use "recoder-code scripts list" to see available scripts'));
      return false;
    }

    const extension = path.extname(scriptName);
    let interpreter = 'node'; // Default to node for utility scripts

    if (extension === '.ts') {
      // Check if ts-node is available for TypeScript scripts
      try {
        await execAsync('npx ts-node --version');
        interpreter = 'ts-node';
      } catch (error) {
        console.log(chalk.yellow('⚠️ ts-node not available, trying to compile TypeScript script...'));
        try {
          // Try to compile with tsc
          await execAsync(`npx tsc ${scriptPath} --outDir ${this.utilityScriptsDir}`);
          const jsPath = scriptPath.replace('.ts', '.js');
          if (fs.existsSync(jsPath)) {
            scriptPath = jsPath;
            interpreter = 'node';
          }
        } catch (compileError) {
          console.log(chalk.red(`❌ Failed to compile TypeScript script: ${compileError.message}`));
          return false;
        }
      }
    }

    try {
      console.log(chalk.blue(`Running: ${interpreter} ${scriptPath} ${args.join(' ')}`));
      console.log(chalk.gray('─'.repeat(50)));

      let command, spawnArgs;
      
      if (interpreter === 'ts-node') {
        command = 'npx';
        spawnArgs = ['ts-node', scriptPath, ...args];
      } else {
        command = 'node';
        spawnArgs = [scriptPath, ...args];
      }

      // Run the utility script
      const child = spawn(command, spawnArgs, {
        cwd: this.utilityScriptsDir,
        stdio: 'inherit',
        shell: false
      });

      return new Promise((resolve) => {
        child.on('close', (code) => {
          console.log('');
          console.log(chalk.gray('─'.repeat(50)));
          
          if (code === 0) {
            console.log(chalk.green(`✅ Utility script completed successfully`));
            resolve(true);
          } else {
            console.log(chalk.red(`❌ Utility script failed with exit code: ${code}`));
            resolve(false);
          }
        });

        child.on('error', (error) => {
          console.log(chalk.red(`❌ Failed to run utility script: ${error.message}`));
          resolve(false);
        });
      });

    } catch (error) {
      console.log(chalk.red(`❌ Failed to run utility script: ${error.message}`));
      return false;
    }
  }
}

module.exports = ScriptsManager;