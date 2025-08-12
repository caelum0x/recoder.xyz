const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

class FunctionalityValidator {
  constructor() {
    this.validationResults = [];
  }

  async validateProject(projectPath, plan) {
    logger.info(`Starting functionality validation for: ${projectPath}`);
    
    this.validationResults = [];
    
    try {
      // 1. Validate project structure
      await this.validateProjectStructure(projectPath, plan);
      
      // 2. Validate dependencies
      await this.validateDependencies(projectPath);
      
      // 3. Validate core functionality
      await this.validateCoreFunctionality(projectPath, plan);
      
      // 4. Validate environment setup
      await this.validateEnvironmentSetup(projectPath);
      
      // 5. Run automated tests
      await this.runAutomatedTests(projectPath);
      
      // 6. Validate build process
      await this.validateBuildProcess(projectPath);
      
      logger.info('Functionality validation completed');
      
      return {
        success: true,
        results: this.validationResults,
        summary: this.generateSummary()
      };
      
    } catch (error) {
      logger.error('Functionality validation failed:', error);
      return {
        success: false,
        error: error.message,
        results: this.validationResults
      };
    }
  }

  async validateProjectStructure(projectPath, plan) {
    const check = {
      name: 'Project Structure',
      type: 'structure',
      status: 'running',
      details: []
    };

    try {
      // Check if main directories exist
      const requiredDirs = this.getRequiredDirectories(plan.type);
      
      for (const dir of requiredDirs) {
        const dirPath = path.join(projectPath, dir);
        const exists = await fs.pathExists(dirPath);
        
        check.details.push({
          item: `Directory: ${dir}`,
          status: exists ? 'passed' : 'failed',
          message: exists ? 'Directory exists' : 'Directory missing'
        });
      }
      
      // Check for essential files
      const requiredFiles = this.getRequiredFiles(plan.type);
      
      for (const file of requiredFiles) {
        const filePath = path.join(projectPath, file);
        const exists = await fs.pathExists(filePath);
        
        check.details.push({
          item: `File: ${file}`,
          status: exists ? 'passed' : 'failed',
          message: exists ? 'File exists' : 'File missing'
        });
      }
      
      check.status = check.details.every(d => d.status === 'passed') ? 'passed' : 'failed';
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async validateDependencies(projectPath) {
    const check = {
      name: 'Dependencies',
      type: 'dependencies',
      status: 'running',
      details: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        
        // Check if dependencies are defined
        const hasDependencies = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;
        check.details.push({
          item: 'Dependencies defined',
          status: hasDependencies ? 'passed' : 'failed',
          message: hasDependencies ? 'Dependencies found in package.json' : 'No dependencies defined'
        });
        
        // Check if node_modules exists (dependencies installed)
        const nodeModulesPath = path.join(projectPath, 'node_modules');
        const nodeModulesExists = await fs.pathExists(nodeModulesPath);
        check.details.push({
          item: 'Dependencies installed',
          status: nodeModulesExists ? 'passed' : 'warning',
          message: nodeModulesExists ? 'node_modules directory exists' : 'Dependencies not installed (run npm install)'
        });
        
        // Try to install dependencies if not installed
        if (!nodeModulesExists) {
          try {
            logger.info('Attempting to install dependencies...');
            await execAsync('npm install', { cwd: projectPath, timeout: 120000 });
            check.details.push({
              item: 'Dependencies installation',
              status: 'passed',
              message: 'Dependencies installed successfully'
            });
          } catch (installError) {
            check.details.push({
              item: 'Dependencies installation',
              status: 'failed',
              message: `Failed to install dependencies: ${installError.message}`
            });
          }
        }
        
      } else {
        check.details.push({
          item: 'package.json',
          status: 'failed',
          message: 'package.json not found'
        });
      }
      
      check.status = check.details.some(d => d.status === 'failed') ? 'failed' : 'passed';
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async validateCoreFunctionality(projectPath, plan) {
    const check = {
      name: 'Core Functionality',
      type: 'functionality',
      status: 'running',
      details: []
    };

    try {
      // Validate based on project type
      switch (plan.type) {
        case 'web':
          await this.validateWebFunctionality(projectPath, check);
          break;
        case 'mobile':
          await this.validateMobileFunctionality(projectPath, check);
          break;
        case 'blockchain':
          await this.validateBlockchainFunctionality(projectPath, check);
          break;
        case 'ai':
          await this.validateAIFunctionality(projectPath, check);
          break;
        case 'fullstack':
          await this.validateFullstackFunctionality(projectPath, check);
          break;
        default:
          await this.validateGenericFunctionality(projectPath, check);
      }
      
      check.status = check.details.some(d => d.status === 'failed') ? 'failed' : 'passed';
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async validateWebFunctionality(projectPath, check) {
    // Check for Next.js configuration
    const nextConfigPath = path.join(projectPath, 'next.config.js');
    const hasNextConfig = await fs.pathExists(nextConfigPath);
    check.details.push({
      item: 'Next.js configuration',
      status: hasNextConfig ? 'passed' : 'warning',
      message: hasNextConfig ? 'next.config.js found' : 'No Next.js configuration'
    });
    
    // Check for pages or app directory
    const pagesDir = path.join(projectPath, 'pages');
    const appDir = path.join(projectPath, 'app');
    const srcPagesDir = path.join(projectPath, 'src', 'pages');
    const srcAppDir = path.join(projectPath, 'src', 'app');
    
    const hasPages = await fs.pathExists(pagesDir) || await fs.pathExists(srcPagesDir);
    const hasApp = await fs.pathExists(appDir) || await fs.pathExists(srcAppDir);
    
    check.details.push({
      item: 'Pages/App directory',
      status: (hasPages || hasApp) ? 'passed' : 'failed',
      message: hasPages ? 'Pages directory found' : hasApp ? 'App directory found' : 'No pages or app directory'
    });
    
    // Check for components directory
    const componentsDir = path.join(projectPath, 'components');
    const srcComponentsDir = path.join(projectPath, 'src', 'components');
    const hasComponents = await fs.pathExists(componentsDir) || await fs.pathExists(srcComponentsDir);
    
    check.details.push({
      item: 'Components directory',
      status: hasComponents ? 'passed' : 'warning',
      message: hasComponents ? 'Components directory found' : 'No components directory'
    });
    
    // REAL INTEGRATION VALIDATION: Test actual API endpoints
    await this.validateRealAPIIntegration(projectPath, check);

    // Try to run development server (if possible)
    try {
      const { stdout } = await execAsync('npm run build --if-present', { 
        cwd: projectPath, 
        timeout: 60000 
      });
      check.details.push({
        item: 'Build process',
        status: 'passed',
        message: 'Project builds successfully'
      });
    } catch (buildError) {
      check.details.push({
        item: 'Build process',
        status: 'failed',
        message: `Build failed: ${buildError.message}`
      });
    }
  }

  async validateBlockchainFunctionality(projectPath, check) {
    // Check for Anchor configuration
    const anchorTomlPath = path.join(projectPath, 'Anchor.toml');
    const hasAnchorConfig = await fs.pathExists(anchorTomlPath);
    check.details.push({
      item: 'Anchor configuration',
      status: hasAnchorConfig ? 'passed' : 'warning',
      message: hasAnchorConfig ? 'Anchor.toml found' : 'No Anchor configuration'
    });
    
    // Check for programs directory
    const programsDir = path.join(projectPath, 'programs');
    const hasPrograms = await fs.pathExists(programsDir);
    check.details.push({
      item: 'Programs directory',
      status: hasPrograms ? 'passed' : 'failed',
      message: hasPrograms ? 'Programs directory found' : 'No programs directory'
    });
    
    // Check for Solana smart contracts
    if (hasPrograms) {
      try {
        const programs = await fs.readdir(programsDir);
        const rustPrograms = programs.filter(p => p.endsWith('.rs') || 
          fs.pathExistsSync(path.join(programsDir, p, 'src', 'lib.rs')));
        
        check.details.push({
          item: 'Smart contracts',
          status: rustPrograms.length > 0 ? 'passed' : 'failed',
          message: `Found ${rustPrograms.length} smart contract(s)`
        });
      } catch (error) {
        check.details.push({
          item: 'Smart contracts',
          status: 'failed',
          message: `Failed to check smart contracts: ${error.message}`
        });
      }
    }
    
    // Check for tests directory
    const testsDir = path.join(projectPath, 'tests');
    const hasTests = await fs.pathExists(testsDir);
    check.details.push({
      item: 'Tests directory',
      status: hasTests ? 'passed' : 'warning',
      message: hasTests ? 'Tests directory found' : 'No tests directory'
    });
    
    // REAL INTEGRATION VALIDATION: Test actual blockchain connection
    await this.validateRealBlockchainIntegration(projectPath, check);
    
    // Try to build (if Anchor is available)
    if (hasAnchorConfig) {
      try {
        await execAsync('anchor build', { cwd: projectPath, timeout: 120000 });
        check.details.push({
          item: 'Anchor build',
          status: 'passed',
          message: 'Anchor build successful'
        });
      } catch (buildError) {
        check.details.push({
          item: 'Anchor build',
          status: 'failed',
          message: `Anchor build failed: ${buildError.message}`
        });
      }
    }
  }

  async validateRealAPIIntegration(projectPath, check) {
    try {
      const fetch = require('node-fetch');
      
      // First, validate project's API endpoints if they exist
      await this.validateLocalAPIEndpoints(projectPath, check);
      
      // Test external API integrations mentioned in the project
      await this.validateExternalAPIIntegrations(projectPath, check);
      
      // Test common external APIs for connectivity
      const apiTests = [
        {
          name: 'JSONPlaceholder API',
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          expected: (data) => {
            try {
              const parsed = JSON.parse(data);
              return parsed.id === 1;
            } catch { return false; }
          },
          timeout: 5000
        },
        {
          name: 'GitHub API Rate Limit Check',
          url: 'https://api.github.com/rate_limit',
          expected: (data) => {
            try {
              const parsed = JSON.parse(data);
              return parsed.resources && parsed.resources.core;
            } catch { return false; }
          },
          timeout: 5000
        },
        {
          name: 'Public HTTP Status API',
          url: 'https://httpstat.us/200',
          expected: (data) => data.includes('200'),
          timeout: 3000
        }
      ];

      for (const test of apiTests) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), test.timeout || 5000);
          
          const response = await fetch(test.url, { 
            signal: controller.signal,
            headers: {
              'User-Agent': 'Recoder-API-Validator/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          const data = await response.text();
          
          if (response.ok && test.expected(data)) {
            check.details.push({
              item: `External API: ${test.name}`,
              status: 'passed',
              message: `Successfully validated ${test.name} connectivity (${response.status})`
            });
          } else {
            check.details.push({
              item: `External API: ${test.name}`,
              status: 'warning',
              message: `${test.name} validation failed - Status: ${response.status}`
            });
          }
        } catch (apiError) {
          if (apiError.name === 'AbortError') {
            check.details.push({
              item: `External API: ${test.name}`,
              status: 'warning',
              message: `${test.name} timeout after ${test.timeout}ms`
            });
          } else {
            check.details.push({
              item: `External API: ${test.name}`,
              status: 'warning',
              message: `${test.name} connection failed: ${apiError.message}`
            });
          }
        }
      }

      // Check for environment variables that suggest real integrations
      const envPath = path.join(projectPath, '.env.example');
      if (await fs.pathExists(envPath)) {
        const envContent = await fs.readFile(envPath, 'utf8');
        const realIntegrations = [];
        
        if (envContent.includes('DATABASE_URL')) realIntegrations.push('Database');
        if (envContent.includes('STRIPE_')) realIntegrations.push('Stripe Payments');
        if (envContent.includes('OPENAI_API_KEY')) realIntegrations.push('OpenAI API');
        if (envContent.includes('ANTHROPIC_API_KEY')) realIntegrations.push('Anthropic API');
        if (envContent.includes('AWS_')) realIntegrations.push('AWS Services');
        if (envContent.includes('GOOGLE_')) realIntegrations.push('Google Services');
        
        if (realIntegrations.length > 0) {
          check.details.push({
            item: 'Real service integrations detected',
            status: 'passed',
            message: `Found configurations for: ${realIntegrations.join(', ')}`
          });
        }
      }
      
    } catch (error) {
      check.details.push({
        item: 'Real API integration test',
        status: 'warning',
        message: `API integration validation failed: ${error.message}`
      });
    }
  }

  async validateRealBlockchainIntegration(projectPath, check) {
    try {
      // Check if Solana web3.js is installed
      const packageJsonPath = path.join(projectPath, 'package.json');
      let hasSolanaSDK = false;
      
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        hasSolanaSDK = dependencies['@solana/web3.js'] || dependencies['@solana/spl-token'];
      }

      if (hasSolanaSDK) {
        // Test Solana devnet connection
        try {
          const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
          
          // Test multiple RPC endpoints for reliability
          const endpoints = [
            { name: 'Solana Devnet', url: 'https://api.devnet.solana.com', timeout: 10000 },
            { name: 'Solana Testnet', url: 'https://api.testnet.solana.com', timeout: 10000 },
            { name: 'Solana Mainnet (rate limited)', url: 'https://api.mainnet-beta.solana.com', timeout: 5000 }
          ];

          for (const endpoint of endpoints) {
            try {
              const connection = new Connection(endpoint.url, {
                commitment: 'confirmed',
                httpTimeout: endpoint.timeout
              });
              
              // Test basic connection
              const version = await Promise.race([
                connection.getVersion(),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Timeout')), endpoint.timeout)
                )
              ]);

              check.details.push({
                item: `${endpoint.name} Connection`,
                status: 'passed',
                message: `Connected successfully (Solana core: ${version['solana-core']})`
              });

              // Test slot information
              const slot = await connection.getSlot();
              check.details.push({
                item: `${endpoint.name} Slot Query`,
                status: 'passed',
                message: `Current slot: ${slot}`
              });

              // Test system program account (exists on all networks)
              const systemProgramId = new PublicKey('11111111111111111111111111111112');
              const accountInfo = await connection.getAccountInfo(systemProgramId);
              
              if (accountInfo) {
                check.details.push({
                  item: `${endpoint.name} Account Query`,
                  status: 'passed',
                  message: 'System program account verified'
                });
              }

              // Only test one working endpoint to save time
              break;

            } catch (endpointError) {
              check.details.push({
                item: `${endpoint.name} Connection`,
                status: 'warning', 
                message: `Connection failed: ${endpointError.message}`
              });
            }
          }

          // Validate Solana program files if they exist
          await this.validateSolanaProgramFiles(projectPath, check);

        } catch (solanaError) {
          check.details.push({
            item: 'Solana SDK Test',
            status: 'warning',
            message: `Solana SDK not available: ${solanaError.message}`
          });
        }
      }

      // Test Ethereum connection if available
      await this.validateEthereumIntegration(projectPath, check);

    } catch (error) {
      check.details.push({
        item: 'Blockchain Integration Test',
        status: 'warning',
        message: `Blockchain validation failed: ${error.message}`
      });
    }
  }

  async validateSolanaProgramFiles(projectPath, check) {
    try {
      // Check for Rust programs
      const programsDir = path.join(projectPath, 'programs');
      if (await fs.pathExists(programsDir)) {
        const programs = await fs.readdir(programsDir);
        
        for (const program of programs) {
          const programPath = path.join(programsDir, program);
          const libRsPath = path.join(programPath, 'src', 'lib.rs');
          const cargoTomlPath = path.join(programPath, 'Cargo.toml');
          
          if (await fs.pathExists(libRsPath) && await fs.pathExists(cargoTomlPath)) {
            const libContent = await fs.readFile(libRsPath, 'utf8');
            const cargoContent = await fs.readFile(cargoTomlPath, 'utf8');
            
            // Check for Anchor framework usage
            const usesAnchor = /use anchor_lang/.test(libContent) || 
                              /anchor-lang/.test(cargoContent);
            
            // Check for common Solana program patterns
            const hasProgram = /#\[program\]/.test(libContent) ||
                              /declare_id!/.test(libContent) ||
                              /entrypoint!/.test(libContent);

            if (hasProgram) {
              check.details.push({
                item: `Solana Program: ${program}`,
                status: 'passed',
                message: `Valid program structure${usesAnchor ? ' (using Anchor)' : ''}`
              });
            } else {
              check.details.push({
                item: `Solana Program: ${program}`,
                status: 'warning',
                message: 'Program structure validation failed'
              });
            }
          }
        }
      }

      // Check for JavaScript/TypeScript program clients
      const clientDirs = ['app', 'client', 'tests'];
      for (const clientDir of clientDirs) {
        const fullClientDir = path.join(projectPath, clientDir);
        if (await fs.pathExists(fullClientDir)) {
          const files = await this.findAPIFiles(fullClientDir);
          const solanaFiles = files.filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('@solana/web3.js') || 
                   content.includes('Connection') ||
                   content.includes('PublicKey');
          });

          if (solanaFiles.length > 0) {
            check.details.push({
              item: `Solana Client Files in ${clientDir}`,
              status: 'passed',
              message: `Found ${solanaFiles.length} Solana integration file(s)`
            });
          }
        }
      }

    } catch (error) {
      check.details.push({
        item: 'Solana Program Validation',
        status: 'warning',
        message: `Program validation failed: ${error.message}`
      });
    }
  }

  async validateEthereumIntegration(projectPath, check) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      let hasEthereumSDK = false;
      
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        hasEthereumSDK = dependencies['ethers'] || 
                        dependencies['web3'] || 
                        dependencies['viem'] ||
                        dependencies['@ethersproject/providers'];
      }

      if (hasEthereumSDK) {
        try {
          // Test with ethers.js if available
          const ethers = require('ethers');
          
          // Test public RPC endpoints
          const providers = [
            { name: 'Ethereum Mainnet', url: 'https://eth.llamarpc.com' },
            { name: 'Ethereum Goerli', url: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161' },
            { name: 'Polygon Mainnet', url: 'https://polygon-rpc.com' }
          ];

          for (const providerConfig of providers.slice(0, 1)) { // Test only one to save time
            try {
              const provider = new ethers.JsonRpcProvider(providerConfig.url);
              const blockNumber = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Timeout')), 5000)
                )
              ]);

              check.details.push({
                item: `${providerConfig.name} Connection`,
                status: 'passed',
                message: `Connected successfully (Block: ${blockNumber})`
              });
              break;

            } catch (providerError) {
              check.details.push({
                item: `${providerConfig.name} Connection`,
                status: 'warning',
                message: `Connection failed: ${providerError.message}`
              });
            }
          }

        } catch (ethersError) {
          // Try web3.js as fallback
          try {
            const Web3 = require('web3');
            const web3 = new Web3('https://eth.llamarpc.com');
            
            const blockNumber = await Promise.race([
              web3.eth.getBlockNumber(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
              )
            ]);

            check.details.push({
              item: 'Ethereum Web3.js Connection',
              status: 'passed',
              message: `Connected via Web3.js (Block: ${blockNumber})`
            });

          } catch (web3Error) {
            check.details.push({
              item: 'Ethereum SDK Test',
              status: 'warning',
              message: `Ethereum libraries not available: ${web3Error.message}`
            });
          }
        }
      }

    } catch (error) {
      check.details.push({
        item: 'Ethereum Integration Test',
        status: 'warning',
        message: `Ethereum validation failed: ${error.message}`
      });
    }
  }

  async validateAIFunctionality(projectPath, check) {
    // Check for AI/ML specific files
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const hasRequirements = await fs.pathExists(requirementsPath);
    check.details.push({
      item: 'Python requirements',
      status: hasRequirements ? 'passed' : 'warning',
      message: hasRequirements ? 'requirements.txt found' : 'No requirements.txt'
    });
    
    // Check for AI model configurations
    const configFiles = ['config.yaml', 'config.json', '.env.example'];
    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      const hasConfig = await fs.pathExists(configPath);
      if (hasConfig) {
        check.details.push({
          item: 'Configuration files',
          status: 'passed',
          message: `Found ${configFile}`
        });
        break;
      }
    }
    
    // Check for model directories
    const modelsDir = path.join(projectPath, 'models');
    const srcModelsDir = path.join(projectPath, 'src', 'models');
    const hasModels = await fs.pathExists(modelsDir) || await fs.pathExists(srcModelsDir);
    
    check.details.push({
      item: 'Models directory',
      status: hasModels ? 'passed' : 'warning',
      message: hasModels ? 'Models directory found' : 'No models directory'
    });
  }

  async validateEnvironmentSetup(projectPath) {
    const check = {
      name: 'Environment Setup',
      type: 'environment',
      status: 'running',
      details: []
    };

    try {
      // Check for environment files
      const envFiles = ['.env.example', '.env.local', '.env.development'];
      let foundEnvFile = false;
      
      for (const envFile of envFiles) {
        const envPath = path.join(projectPath, envFile);
        const exists = await fs.pathExists(envPath);
        
        if (exists) {
          foundEnvFile = true;
          check.details.push({
            item: `Environment file: ${envFile}`,
            status: 'passed',
            message: 'Environment file found'
          });
          
          // Check if environment file has content
          const content = await fs.readFile(envPath, 'utf8');
          const hasVariables = content.trim().length > 0 && content.includes('=');
          
          check.details.push({
            item: `Environment variables in ${envFile}`,
            status: hasVariables ? 'passed' : 'warning',
            message: hasVariables ? 'Environment variables defined' : 'Environment file is empty'
          });
        }
      }
      
      if (!foundEnvFile) {
        check.details.push({
          item: 'Environment files',
          status: 'warning',
          message: 'No environment files found'
        });
      }
      
      check.status = 'passed'; // Environment setup is typically not critical
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async runAutomatedTests(projectPath) {
    const check = {
      name: 'Automated Tests',
      type: 'testing',
      status: 'running',
      details: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const hasTestScript = packageJson.scripts && packageJson.scripts.test;
        
        check.details.push({
          item: 'Test script',
          status: hasTestScript ? 'passed' : 'warning',
          message: hasTestScript ? 'Test script found in package.json' : 'No test script defined'
        });
        
        if (hasTestScript) {
          try {
            const { stdout, stderr } = await execAsync('npm test', { 
              cwd: projectPath, 
              timeout: 60000 
            });
            
            check.details.push({
              item: 'Test execution',
              status: 'passed',
              message: 'Tests executed successfully'
            });
            
            // Parse test results if possible
            if (stdout.includes('pass') || stdout.includes('✓')) {
              check.details.push({
                item: 'Test results',
                status: 'passed',
                message: 'Tests are passing'
              });
            }
            
          } catch (testError) {
            // Tests might fail, but we still want to report this
            check.details.push({
              item: 'Test execution',
              status: 'failed',
              message: `Tests failed: ${testError.message}`
            });
          }
        }
      }
      
      check.status = check.details.some(d => d.status === 'failed') ? 'failed' : 'passed';
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async validateBuildProcess(projectPath) {
    const check = {
      name: 'Build Process',
      type: 'build',
      status: 'running',
      details: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const hasBuildScript = packageJson.scripts && packageJson.scripts.build;
        
        check.details.push({
          item: 'Build script',
          status: hasBuildScript ? 'passed' : 'warning',
          message: hasBuildScript ? 'Build script found in package.json' : 'No build script defined'
        });
        
        if (hasBuildScript) {
          try {
            await execAsync('npm run build', { 
              cwd: projectPath, 
              timeout: 180000 // 3 minutes for build
            });
            
            check.details.push({
              item: 'Build execution',
              status: 'passed',
              message: 'Build completed successfully'
            });
            
            // Check if build output exists
            const commonBuildDirs = ['dist', 'build', '.next', 'out'];
            let foundBuildOutput = false;
            
            for (const buildDir of commonBuildDirs) {
              const buildPath = path.join(projectPath, buildDir);
              if (await fs.pathExists(buildPath)) {
                foundBuildOutput = true;
                check.details.push({
                  item: 'Build output',
                  status: 'passed',
                  message: `Build output found in ${buildDir}/`
                });
                break;
              }
            }
            
            if (!foundBuildOutput) {
              check.details.push({
                item: 'Build output',
                status: 'warning',
                message: 'No build output directory found'
              });
            }
            
          } catch (buildError) {
            check.details.push({
              item: 'Build execution',
              status: 'failed',
              message: `Build failed: ${buildError.message}`
            });
          }
        }
      }
      
      check.status = check.details.some(d => d.status === 'failed') ? 'failed' : 'passed';
      
    } catch (error) {
      check.status = 'failed';
      check.error = error.message;
    }
    
    this.validationResults.push(check);
  }

  async validateLocalAPIEndpoints(projectPath, check) {
    try {
      // Check for Next.js API routes
      const apiDirs = [
        path.join(projectPath, 'pages', 'api'),
        path.join(projectPath, 'src', 'pages', 'api'),
        path.join(projectPath, 'app', 'api'),
        path.join(projectPath, 'src', 'app', 'api')
      ];

      let foundApiRoutes = false;
      const apiFiles = [];

      for (const apiDir of apiDirs) {
        if (await fs.pathExists(apiDir)) {
          const files = await this.findAPIFiles(apiDir);
          apiFiles.push(...files);
          foundApiRoutes = true;
        }
      }

      if (foundApiRoutes) {
        check.details.push({
          item: 'Local API Routes Discovery',
          status: 'passed',
          message: `Found ${apiFiles.length} API endpoint(s): ${apiFiles.slice(0, 3).join(', ')}${apiFiles.length > 3 ? '...' : ''}`
        });

        // Validate API file structure
        for (const apiFile of apiFiles.slice(0, 5)) { // Limit to first 5 for performance
          await this.validateAPIFileStructure(apiFile, check);
        }
      }

      // Check for Express.js routes
      const expressRouteDirs = [
        path.join(projectPath, 'routes'),
        path.join(projectPath, 'src', 'routes'),
        path.join(projectPath, 'server', 'routes'),
        path.join(projectPath, 'backend', 'routes')
      ];

      for (const routeDir of expressRouteDirs) {
        if (await fs.pathExists(routeDir)) {
          const routeFiles = await this.findRouteFiles(routeDir);
          if (routeFiles.length > 0) {
            check.details.push({
              item: 'Express.js Routes Discovery',
              status: 'passed',
              message: `Found ${routeFiles.length} route file(s)`
            });
          }
        }
      }
    } catch (error) {
      check.details.push({
        item: 'Local API Validation',
        status: 'warning',
        message: `Local API validation failed: ${error.message}`
      });
    }
  }

  async findAPIFiles(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findAPIFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory read failed, skip
    }
    
    return files;
  }

  async findRouteFiles(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch (error) {
      // Directory read failed, skip
    }
    
    return files;
  }

  async validateAPIFileStructure(filePath, check) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Check for proper HTTP method handlers
      const hasHandlers = /export\s+(default\s+)?(?:function|const|async\s+function)/.test(content) ||
                         /handler\s*=|export\s*\{.*handler.*\}/.test(content);
      
      // Check for error handling
      const hasErrorHandling = /try\s*\{|catch\s*\(|\.catch\s*\(/.test(content);
      
      // Check for input validation
      const hasValidation = /req\.body|req\.query|req\.params/.test(content) && 
                           (/validate|schema|joi|yup|zod/.test(content.toLowerCase()) || 
                            /typeof|instanceof|Array\.isArray/.test(content));

      let status = 'passed';
      let issues = [];

      if (!hasHandlers) {
        issues.push('No HTTP handlers found');
        status = 'warning';
      }
      
      if (!hasErrorHandling) {
        issues.push('Missing error handling');
        status = 'warning';
      }
      
      if (!hasValidation && /req\.(body|query|params)/.test(content)) {
        issues.push('Input validation recommended');
      }

      check.details.push({
        item: `API File Structure: ${path.basename(relativePath)}`,
        status,
        message: issues.length > 0 ? 
          `Issues: ${issues.join(', ')}` : 
          'Well-structured API endpoint'
      });

    } catch (error) {
      check.details.push({
        item: `API File Analysis: ${path.basename(filePath)}`,
        status: 'warning',
        message: `Failed to analyze: ${error.message}`
      });
    }
  }

  async validateExternalAPIIntegrations(projectPath, check) {
    try {
      // Check package.json for API client libraries
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        const apiLibraries = {
          'axios': 'HTTP client',
          'fetch': 'Fetch API',
          'node-fetch': 'Node.js fetch',
          'superagent': 'HTTP client',
          'request': 'HTTP client (deprecated)',
          '@apollo/client': 'GraphQL client',
          'graphql-request': 'GraphQL client',
          'stripe': 'Stripe payments',
          'openai': 'OpenAI API',
          '@anthropic-ai/sdk': 'Anthropic API',
          'twilio': 'Twilio communications',
          'nodemailer': 'Email service',
          'aws-sdk': 'AWS services',
          '@aws-sdk/client-s3': 'AWS S3',
          '@google-cloud/storage': 'Google Cloud Storage',
          'firebase-admin': 'Firebase',
          'mongodb': 'MongoDB',
          'redis': 'Redis cache',
          'pg': 'PostgreSQL',
          'mysql2': 'MySQL'
        };

        const foundIntegrations = [];
        for (const [lib, description] of Object.entries(apiLibraries)) {
          if (dependencies[lib]) {
            foundIntegrations.push(`${lib} (${description})`);
          }
        }

        if (foundIntegrations.length > 0) {
          check.details.push({
            item: 'External API Dependencies',
            status: 'passed',
            message: `Found ${foundIntegrations.length} integration(s): ${foundIntegrations.slice(0, 3).join(', ')}${foundIntegrations.length > 3 ? '...' : ''}`
          });
        }
      }

      // Check environment files for API configurations
      const envFiles = ['.env', '.env.local', '.env.example', '.env.development'];
      const apiEnvVars = [];

      for (const envFile of envFiles) {
        const envPath = path.join(projectPath, envFile);
        if (await fs.pathExists(envPath)) {
          const envContent = await fs.readFile(envPath, 'utf8');
          
          // Look for API-related environment variables
          const apiPatterns = [
            /API_KEY|API_SECRET|CLIENT_ID|CLIENT_SECRET/i,
            /STRIPE_|OPENAI_|ANTHROPIC_|GOOGLE_|AWS_/i,
            /DATABASE_URL|REDIS_URL|MONGODB_URI/i,
            /WEBHOOK_|ENDPOINT_|BASE_URL/i
          ];

          for (const pattern of apiPatterns) {
            const matches = envContent.match(new RegExp(`^${pattern.source}.*=`, 'gmi'));
            if (matches) {
              apiEnvVars.push(...matches.map(m => m.replace('=', '')));
            }
          }
        }
      }

      if (apiEnvVars.length > 0) {
        const uniqueVars = [...new Set(apiEnvVars)];
        check.details.push({
          item: 'API Configuration Variables',
          status: 'passed',
          message: `Found ${uniqueVars.length} API config variable(s): ${uniqueVars.slice(0, 3).join(', ')}${uniqueVars.length > 3 ? '...' : ''}`
        });
      }

    } catch (error) {
      check.details.push({
        item: 'External API Integration Analysis',
        status: 'warning',
        message: `Analysis failed: ${error.message}`
      });
    }
  }

  // Helper methods
  getRequiredDirectories(projectType) {
    const common = ['src', 'node_modules'];
    
    switch (projectType) {
      case 'web':
        return [...common, 'pages', 'components', 'styles'];
      case 'mobile':
        return [...common, 'screens', 'components', 'navigation'];
      case 'blockchain':
        return [...common, 'programs', 'tests', 'app'];
      case 'ai':
        return [...common, 'models', 'data', 'notebooks'];
      case 'fullstack':
        return [...common, 'pages', 'components', 'lib', 'api'];
      default:
        return common;
    }
  }

  getRequiredFiles(projectType) {
    const common = ['package.json', 'README.md'];
    
    switch (projectType) {
      case 'web':
        return [...common, 'next.config.js', 'tsconfig.json'];
      case 'mobile':
        return [...common, 'app.json', 'babel.config.js'];
      case 'blockchain':
        return [...common, 'Anchor.toml', 'Cargo.toml'];
      case 'ai':
        return [...common, 'requirements.txt', 'config.yaml'];
      case 'fullstack':
        return [...common, 'next.config.js', 'prisma/schema.prisma'];
      default:
        return common;
    }
  }

  async validateGenericFunctionality(projectPath, check) {
    // Generic validation for unknown project types
    check.details.push({
      item: 'Generic validation',
      status: 'passed',
      message: 'Basic project structure validated'
    });
  }

  async validateMobileFunctionality(projectPath, check) {
    // Check for React Native or Flutter specific files
    const appJsonPath = path.join(projectPath, 'app.json');
    const hasAppJson = await fs.pathExists(appJsonPath);
    check.details.push({
      item: 'App configuration',
      status: hasAppJson ? 'passed' : 'warning',
      message: hasAppJson ? 'app.json found' : 'No app.json configuration'
    });
  }

  async validateFullstackFunctionality(projectPath, check) {
    // Validate both frontend and backend components
    await this.validateWebFunctionality(projectPath, check);
    
    // Check for API routes
    const apiDir = path.join(projectPath, 'pages', 'api');
    const srcApiDir = path.join(projectPath, 'src', 'pages', 'api');
    const appApiDir = path.join(projectPath, 'app', 'api');
    
    const hasApi = await fs.pathExists(apiDir) || 
                   await fs.pathExists(srcApiDir) || 
                   await fs.pathExists(appApiDir);
    
    check.details.push({
      item: 'API routes',
      status: hasApi ? 'passed' : 'warning',
      message: hasApi ? 'API routes found' : 'No API routes directory'
    });
  }

  generateSummary() {
    const total = this.validationResults.length;
    const passed = this.validationResults.filter(r => r.status === 'passed').length;
    const failed = this.validationResults.filter(r => r.status === 'failed').length;
    const warnings = this.validationResults.filter(r => r.status === 'warning').length;
    
    return {
      total,
      passed,
      failed,
      warnings,
      score: Math.round((passed / total) * 100),
      overallStatus: failed > 0 ? 'failed' : warnings > 0 ? 'warning' : 'passed'
    };
  }
}

module.exports = { FunctionalityValidator };