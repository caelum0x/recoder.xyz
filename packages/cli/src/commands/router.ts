/**
 * Recoder CLI Router Command
 * 
 * Integrates the recoder-cli-router package to route AI requests 
 * to different models including local Ollama models
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
// import { run as startRouter } from '../../../recoder-cli-router/src/index'; // Use built CLI instead
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface RouterCommandOptions {
  port?: number;
  config?: string;
  background?: boolean;
  quiet?: boolean;
}

export class RouterCommand {
  private defaultConfig = {
    LOG: true,
    PORT: 3456,
    HOST: "127.0.0.1",
    Providers: [
      {
        name: "ollama",
        api_base_url: "http://localhost:11434/v1/chat/completions", 
        api_key: "ollama",
        models: [
          "deepseek-r1:7b",
          "qwen3:8b", 
          "qwen2.5-coder:7b",
          "llama3.1:8b",
          "gemma3:4b",
          "phi4:14b",
          "qwen2.5:7b",
          "mistral:7b"
        ]
      }
    ],
    Router: {
      default: "ollama,qwen2.5-coder:7b",
      background: "ollama,gemma3:4b", 
      think: "ollama,deepseek-r1:7b",
      longContext: "ollama,qwen3:8b",
      coding: "ollama,qwen2.5-coder:7b"
    }
  };

  /**
   * Register router commands with Commander.js
   */
  register(program: Command): void {
    const routerCmd = program
      .command('router')
      .description('🚀 Manage AI request routing to different models (Ollama, Cloud APIs)');

    // Start command
    routerCmd
      .command('start')
      .description('Start the AI router service')
      .option('-p, --port <port>', 'Port to run router on', '3456')
      .option('-c, --config <path>', 'Path to router config file')
      .option('-b, --background', 'Run in background mode')
      .option('-q, --quiet', 'Minimal output')
      .action(async (options) => {
        await this.handleStart(options);
      });

    // Stop command
    routerCmd
      .command('stop')
      .description('Stop the AI router service')
      .action(async () => {
        await this.handleStop();
      });

    // Status command
    routerCmd
      .command('status')
      .description('Check router service status')
      .option('-v, --verbose', 'Show detailed status')
      .action(async (options) => {
        await this.handleStatus(options);
      });

    // Config command
    routerCmd
      .command('config')
      .description('Manage router configuration')
      .option('--init', 'Initialize default configuration')
      .option('--show', 'Show current configuration')
      .option('--edit', 'Open configuration in editor')
      .option('--add-model <model>', 'Add model to configuration')
      .option('--provider <name>', 'Provider name for model', 'ollama')
      .action(async (options) => {
        await this.handleConfig(options);
      });

    // Models command
    routerCmd
      .command('models')
      .description('Manage routed models')
      .option('--list', 'List all configured models')
      .option('--test <model>', 'Test connectivity to a specific model')
      .option('--benchmark', 'Run performance benchmarks')
      .action(async (options) => {
        await this.handleModels(options);
      });

    // Routes command  
    routerCmd
      .command('routes')
      .description('Manage routing rules')
      .option('--list', 'List current routing rules')
      .option('--set <scenario=provider,model>', 'Set routing rule')
      .option('--reset', 'Reset to default routes')
      .action(async (options) => {
        await this.handleRoutes(options);  
      });

    // Code command - Route code generation through AI router
    routerCmd
      .command('code <description>')
      .description('Generate code using routed AI models')
      .option('-m, --model <model>', 'Override model selection')
      .option('-p, --provider <provider>', 'Override provider selection')
      .option('-l, --language <lang>', 'Target programming language')
      .option('--route <scenario>', 'Use specific routing scenario (coding, think, etc)')
      .action(async (description, options) => {
        await this.handleRouterCode(description, options);
      });
  }

  /**
   * Handle start command
   */
  private async handleStart(options: RouterCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Starting AI Router Service...\n'));

      // Ensure configuration exists
      await this.ensureConfig();

      if (!options.quiet) {
        console.log(`Port: ${chalk.cyan(options.port || 3456)}`);
        console.log(`Config: ${chalk.gray(await this.getConfigPath())}`);
        console.log(`Background: ${options.background ? chalk.green('Yes') : chalk.yellow('No')}`);
      }

      if (options.background) {
        // Start in background using spawn
        await this.startInBackground(options);
      } else {
        // Start in foreground
        console.log(chalk.yellow('🚧 Foreground router start not implemented yet - use --background'));
        // TODO: Use CLI spawn for foreground mode
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to start router:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle stop command
   */
  private async handleStop(): Promise<void> {
    try {
      console.log(chalk.blue('🛑 Stopping AI Router Service...\n'));

      // Find and kill the router process
      const pidFile = join(homedir(), '.recoder-cli-router', 'router.pid');
      
      try {
        const pid = await fs.readFile(pidFile, 'utf8');
        process.kill(parseInt(pid.trim()), 'SIGTERM');
        await fs.unlink(pidFile);
        console.log(chalk.green('✅ Router service stopped successfully'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ No running router service found'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to stop router:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle status command
   */
  private async handleStatus(options: { verbose?: boolean }): Promise<void> {
    try {
      console.log(chalk.blue('📊 AI Router Status\n'));

      // Check if service is running
      const isRunning = await this.isServiceRunning();
      console.log(`Service Status: ${isRunning ? chalk.green('✅ Running') : chalk.red('❌ Stopped')}`);

      if (isRunning) {
        // Test connectivity
        try {
          const response = await fetch('http://localhost:3456/health');
          if (response.ok) {
            console.log(`Health Check: ${chalk.green('✅ Healthy')}`);
            
            if (options.verbose) {
              const health = await response.json() as any;
              console.log(`Uptime: ${chalk.cyan(health?.uptime || 'Unknown')}`);
              console.log(`Requests: ${chalk.cyan(health?.requests || 'N/A')}`);
            }
          }
        } catch (error) {
          console.log(`Health Check: ${chalk.yellow('⚠️ Service running but not responding')}`);
        }
      }

      // Show configuration summary
      const configPath = await this.getConfigPath();
      console.log(`Configuration: ${chalk.gray(configPath)}`);

      if (await this.configExists()) {
        const config = await this.loadConfig();
        console.log(`Configured Providers: ${chalk.cyan(config.Providers?.length || 0)}`);
        
        if (options.verbose && config.Providers) {
          console.log('\n' + chalk.yellow('📋 Configured Providers:'));
          config.Providers.forEach((provider: any) => {
            console.log(`  • ${chalk.cyan(provider.name)}: ${provider.models?.length || 0} models`);
          });
        }

        if (config.Router) {
          console.log('\n' + chalk.yellow('🛣️ Routing Rules:'));
          Object.entries(config.Router).forEach(([scenario, route]) => {
            console.log(`  • ${chalk.cyan(scenario)}: ${chalk.white(route)}`);
          });
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get router status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle config command
   */
  private async handleConfig(options: any): Promise<void> {
    try {
      const configPath = await this.getConfigPath();

      if (options.init) {
        console.log(chalk.blue('🔧 Initializing router configuration...\n'));
        await this.initializeConfig();
        console.log(chalk.green('✅ Configuration initialized at:'));
        console.log(chalk.gray(configPath));
        return;
      }

      if (options.show) {
        console.log(chalk.blue('📋 Current Router Configuration\n'));
        
        if (await this.configExists()) {
          const config = await this.loadConfig();
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log(chalk.yellow('⚠️ No configuration found. Run --init to create one.'));
        }
        return;
      }

      if (options.addModel) {
        console.log(chalk.blue(`➕ Adding model: ${options.addModel}\n`));
        await this.addModelToConfig(options.addModel, options.provider);
        console.log(chalk.green('✅ Model added to configuration'));
        return;
      }

      if (options.edit) {
        console.log(chalk.blue('✏️ Opening configuration in editor...\n'));
        // Open config file in default editor
        const editor = process.env.EDITOR || 'nano';
        spawn(editor, [configPath], { stdio: 'inherit' });
        return;
      }

      // Default: show config status
      await this.handleConfig({ show: true });

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage configuration:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle models command
   */
  private async handleModels(options: any): Promise<void> {
    try {
      if (options.list) {
        console.log(chalk.blue('📦 Configured AI Models\n'));
        
        const config = await this.loadConfig();
        if (!config.Providers) {
          console.log(chalk.yellow('⚠️ No providers configured'));
          return;
        }

        config.Providers.forEach((provider: any) => {
          console.log(`${chalk.cyan(`${provider.name}:`)} (${provider.api_base_url})`);
          if (provider.models && provider.models.length > 0) {
            provider.models.forEach((model: string) => {
              console.log(`  • ${chalk.white(model)}`);
            });
          }
          console.log();
        });
        return;
      }

      if (options.test) {
        console.log(chalk.blue(`🧪 Testing model: ${options.test}\n`));
        const result = await this.testModel(options.test);
        
        if (result.success) {
          console.log(chalk.green('✅ Model is accessible and responding'));
          console.log(`Response time: ${chalk.cyan(result.responseTime + 'ms')}`);
        } else {
          console.log(chalk.red('❌ Model test failed:'), result.error);
        }
        return;
      }

      if (options.benchmark) {
        console.log(chalk.blue('🏃 Running performance benchmarks...\n'));
        await this.runBenchmarks();
        return;
      }

      // Default: list models
      await this.handleModels({ list: true });

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage models:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle routes command
   */
  private async handleRoutes(options: any): Promise<void> {
    try {
      if (options.list) {
        console.log(chalk.blue('🛣️ Current Routing Rules\n'));
        
        const config = await this.loadConfig();
        if (!config.Router) {
          console.log(chalk.yellow('⚠️ No routing rules configured'));
          return;
        }

        Object.entries(config.Router).forEach(([scenario, route]) => {
          console.log(`${chalk.cyan(scenario)}: ${chalk.white(route as string)}`);
        });
        return;
      }

      if (options.set) {
        const [scenario, route] = options.set.split('=');
        console.log(chalk.blue(`🔗 Setting route: ${scenario} → ${route}\n`));
        
        await this.setRoute(scenario, route);
        console.log(chalk.green('✅ Route updated'));
        return;
      }

      if (options.reset) {
        console.log(chalk.blue('🔄 Resetting routes to defaults...\n'));
        await this.resetRoutes();
        console.log(chalk.green('✅ Routes reset to defaults'));
        return;
      }

      // Default: list routes
      await this.handleRoutes({ list: true });

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage routes:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle routed code generation command
   */
  private async handleRouterCode(description: string, options: any): Promise<void> {
    try {
      console.log(chalk.blue('💻 Generating code via AI Router\n'));
      
      // Ensure router is running
      if (!await this.isServiceRunning()) {
        console.log(chalk.yellow('🚀 Router not running. Starting it...'));
        await this.startInBackground({});
        // Wait a moment for startup
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(chalk.gray(`Request: ${description}`));
      
      // Build the request
      const route = options.route || 'coding';
      const messages = [
        {
          role: 'system',
          content: `You are a senior software engineer. Generate production-ready, well-documented code${options.language ? ` in ${options.language}` : ''}.`
        },
        {
          role: 'user', 
          content: `Generate code for: ${description}`
        }
      ];

      // Send request to router
      const response = await fetch('http://localhost:3456/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Route-Scenario': route
        },
        body: JSON.stringify({
          messages,
          temperature: 0.3,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Router request failed: ${response.statusText}`);
      }

      const result = await response.json() as any;
      const content = result?.choices?.[0]?.message?.content || 'No response generated';

      console.log(chalk.green('\n📝 Generated Code:\n'));
      console.log(content);
      console.log(chalk.gray(`\nModel: ${result?.model || 'Unknown'} | Route: ${route}`));

    } catch (error) {
      console.error(chalk.red('❌ Code generation failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Private helper methods

  private async getConfigPath(): Promise<string> {
    return join(homedir(), '.recoder-cli-router', 'config.json');
  }

  private async configExists(): Promise<boolean> {
    try {
      await fs.access(await this.getConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  private async loadConfig(): Promise<any> {
    const configPath = await this.getConfigPath();
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  }

  private async saveConfig(config: any): Promise<void> {
    const configPath = await this.getConfigPath();
    await fs.mkdir(join(homedir(), '.recoder-cli-router'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private async ensureConfig(): Promise<void> {
    if (!await this.configExists()) {
      await this.initializeConfig();
    }
  }

  private async initializeConfig(): Promise<void> {
    await this.saveConfig(this.defaultConfig);
  }

  private async addModelToConfig(model: string, provider: string = 'ollama'): Promise<void> {
    const config = await this.loadConfig();
    
    if (!config.Providers) {
      config.Providers = [];
    }

    let providerConfig = config.Providers.find((p: any) => p.name === provider);
    if (!providerConfig) {
      // Add new provider
      providerConfig = {
        name: provider,
        api_base_url: provider === 'ollama' ? 'http://localhost:11434/v1/chat/completions' : '',
        api_key: provider === 'ollama' ? 'ollama' : '',
        models: []
      };
      config.Providers.push(providerConfig);
    }

    if (!providerConfig.models.includes(model)) {
      providerConfig.models.push(model);
    }

    await this.saveConfig(config);
  }

  private async setRoute(scenario: string, route: string): Promise<void> {
    const config = await this.loadConfig();
    
    if (!config.Router) {
      config.Router = {};
    }

    config.Router[scenario] = route;
    await this.saveConfig(config);
  }

  private async resetRoutes(): Promise<void> {
    const config = await this.loadConfig();
    config.Router = { ...this.defaultConfig.Router };
    await this.saveConfig(config);
  }

  private async isServiceRunning(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3456/health', { 
        signal: AbortSignal.timeout(1000) 
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async startInBackground(options: RouterCommandOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['tsx', '../../../recoder-cli-router/src/cli.ts', 'start'];
      
      if (options.port) {
        process.env.SERVICE_PORT = String(options.port);
      }

      const child = spawn('npx', args, {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      // Save PID for stopping later
      const pidFile = join(homedir(), '.recoder-cli-router', 'router.pid');
      fs.mkdir(join(homedir(), '.recoder-cli-router'), { recursive: true })
        .then(() => fs.writeFile(pidFile, child.pid?.toString() || ''))
        .then(() => {
          console.log(chalk.green('✅ Router started in background'));
          console.log(chalk.gray(`PID: ${child.pid}`));
          resolve();
        })
        .catch(reject);
    });
  }

  private async testModel(model: string): Promise<{ success: boolean; responseTime?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('http://localhost:3456/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { success: true, responseTime };
      } else {
        return { success: false, error: response.statusText };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  private async runBenchmarks(): Promise<void> {
    console.log(chalk.yellow('Running benchmarks on configured models...\n'));

    const config = await this.loadConfig();
    const models = config.Providers
      ?.find((p: any) => p.name === 'ollama')
      ?.models || [];

    for (const model of models.slice(0, 3)) { // Test first 3 models
      console.log(chalk.cyan(`Testing ${model}...`));
      
      const result = await this.testModel(model);
      if (result.success) {
        console.log(`  ✅ Response time: ${chalk.green(result.responseTime + 'ms')}`);
      } else {
        console.log(`  ❌ Failed: ${chalk.red(result.error)}`);
      }
    }
  }
}

// Export singleton instance
export const routerCommand = new RouterCommand();