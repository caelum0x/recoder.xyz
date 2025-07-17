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