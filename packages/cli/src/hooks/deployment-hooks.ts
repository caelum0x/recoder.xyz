/**
 * Deployment Hooks - Real Implementation
 * Automatically triggers social media posts when deployments happen
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger';
import { socialMediaDeployer, DeploymentEvent } from '../services/social-media-deployer';

export class DeploymentHooks {
  private isGitRepo: boolean = false;
  private projectName: string = 'Unknown Project';
  private packageJsonPath: string = '';

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Check if we're in a git repository
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      this.isGitRepo = true;
      
      // Get project name from package.json or git repo
      await this.detectProjectName();
      
      Logger.info(`Deployment hooks initialized for project: ${this.projectName}`);
    } catch (error) {
      Logger.warn('Not in a git repository, some features may be limited');
    }
  }

  private async detectProjectName(): Promise<void> {
    try {
      // Try to find package.json
      const possiblePaths = [
        path.join(process.cwd(), 'package.json'),
        path.join(process.cwd(), '../package.json'),
        path.join(process.cwd(), '../../package.json')
      ];

      for (const pkgPath of possiblePaths) {
        try {
          const packageJson = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
          this.projectName = packageJson.name || 'Unknown Project';
          this.packageJsonPath = pkgPath;
          return;
        } catch (error) {
          // Continue to next path
        }
      }

      // Fallback to git repository name
      if (this.isGitRepo) {
        const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
        const repoName = remoteUrl.split('/').pop()?.replace('.git', '') || 'Unknown Project';
        this.projectName = repoName;
      }
    } catch (error) {
      Logger.warn('Could not detect project name:', error);
    }
  }

  /**
   * Install git hooks for automatic deployment posting
   */
  async installGitHooks(): Promise<void> {
    if (!this.isGitRepo) {
      throw new Error('Not in a git repository');
    }

    const hooksDir = path.join(process.cwd(), '.git', 'hooks');
    
    // Create post-receive hook for deployments
    const postReceiveHook = `#!/bin/bash
# Recoder.xyz Auto Social Media Deployment Hook

echo "🚀 Deployment detected, preparing social media announcement..."

# Get deployment info
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Determine environment based on branch
ENVIRONMENT="development"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    ENVIRONMENT="production"
elif [[ "$BRANCH" == "staging" || "$BRANCH" == "stage" ]]; then
    ENVIRONMENT="staging"
fi

# Get recent changes
CHANGES=$(git log --oneline -5 --pretty=format:"%s" | head -3)

# Call Node.js script to handle social media posting
node -e "
const { socialMediaDeployer } = require('./packages/cli/dist/services/social-media-deployer');

const deploymentEvent = {
  projectName: '${this.projectName}',
  deploymentId: 'deploy_' + Date.now(),
  version: '$VERSION',
  environment: '$ENVIRONMENT',
  status: 'success',
  timestamp: new Date('$TIMESTAMP'),
  changes: \`$CHANGES\`.split('\\n').filter(Boolean)
};

socialMediaDeployer.announceDeployment(deploymentEvent)
  .then(results => {
    console.log('✅ Social media announcement complete:', results);
  })
  .catch(error => {
    console.error('❌ Social media announcement failed:', error);
  });
"

echo "📱 Social media deployment hooks executed"
`;

    const postReceivePath = path.join(hooksDir, 'post-receive');
    await fs.writeFile(postReceivePath, postReceiveHook, { mode: 0o755 });
    
    Logger.info('Git post-receive hook installed successfully');

    // Create pre-push hook for staging announcements
    const prePushHook = `#!/bin/bash
# Recoder.xyz Pre-push Social Media Hook

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$BRANCH" == "staging" || "$BRANCH" == "stage" ]]; then
    echo "🎯 Staging push detected, announcing deployment..."
    
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    
    node -e "
    const { socialMediaDeployer } = require('./packages/cli/dist/services/social-media-deployer');
    
    const deploymentEvent = {
      projectName: '${this.projectName}',
      deploymentId: 'stage_' + Date.now(),
      version: '$VERSION',
      environment: 'staging',
      status: 'in_progress',
      timestamp: new Date()
    };
    
    socialMediaDeployer.announceDeployment(deploymentEvent);
    "
fi
`;

    const prePushPath = path.join(hooksDir, 'pre-push');
    await fs.writeFile(prePushPath, prePushHook, { mode: 0o755 });
    
    Logger.info('Git pre-push hook installed successfully');
  }

  /**
   * Setup CI/CD integration (GitHub Actions, GitLab CI, etc.)
   */
  async setupCIIntegration(): Promise<void> {
    const ciConfigPath = path.join(process.cwd(), '.github', 'workflows');
    
    try {
      await fs.access(ciConfigPath);
      
      // Add social media deployment step to existing workflow
      const deploymentStep = `
      - name: Announce Deployment to Social Media
        if: success()
        run: |
          npm install -g @recoder/cli
          node -e "
          const { socialMediaDeployer } = require('@recoder/cli/dist/services/social-media-deployer');
          
          const deploymentEvent = {
            projectName: process.env.GITHUB_REPOSITORY.split('/')[1],
            deploymentId: process.env.GITHUB_RUN_ID,
            version: process.env.GITHUB_REF_NAME,
            environment: process.env.ENVIRONMENT || 'production',
            status: 'success',
            timestamp: new Date(),
            deploymentUrl: process.env.DEPLOYMENT_URL
          };
          
          socialMediaDeployer.announceDeployment(deploymentEvent);
          "
        env:
          TWITTER_API_KEY: \${{ secrets.TWITTER_API_KEY }}
          TWITTER_ACCESS_TOKEN: \${{ secrets.TWITTER_ACCESS_TOKEN }}
          LINKEDIN_CLIENT_ID: \${{ secrets.LINKEDIN_CLIENT_ID }}
          LINKEDIN_ACCESS_TOKEN: \${{ secrets.LINKEDIN_ACCESS_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
`;

      const workflowFile = path.join(ciConfigPath, 'deploy-with-social.yml');
      const workflow = `name: Deploy with Social Media Announcement

on:
  push:
    branches: [ main, master ]
  release:
    types: [ published ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build project
      run: npm run build
      
    - name: Deploy to production
      run: npm run deploy
      
    ${deploymentStep}
`;

      await fs.mkdir(ciConfigPath, { recursive: true });
      await fs.writeFile(workflowFile, workflow);
      
      Logger.info('GitHub Actions workflow with social media integration created');
      
    } catch (error) {
      Logger.warn('GitHub Actions directory not found, skipping CI integration');
    }
  }

  /**
   * Setup Vercel deployment integration
   */
  async setupVercelIntegration(): Promise<void> {
    const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
    
    try {
      let vercelConfig: any = {};
      
      try {
        const existingConfig = await fs.readFile(vercelJsonPath, 'utf-8');
        vercelConfig = JSON.parse(existingConfig);
      } catch (error) {
        // File doesn't exist, create new config
      }

      // Add deployment hook
      if (!vercelConfig.functions) {
        vercelConfig.functions = {};
      }

      vercelConfig.functions['api/deployment-hook.js'] = {
        runtime: 'nodejs18.x'
      };

      // Add build command that includes social media posting
      vercelConfig.buildCommand = vercelConfig.buildCommand || 'npm run build';
      
      await fs.writeFile(vercelJsonPath, JSON.stringify(vercelConfig, null, 2));

      // Create the deployment hook function
      const apiDir = path.join(process.cwd(), 'api');
      await fs.mkdir(apiDir, { recursive: true });

      const deploymentHookFunction = `// Vercel Deployment Hook for Social Media
const { socialMediaDeployer } = require('@recoder/cli/dist/services/social-media-deployer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deployment } = req.body;
    
    if (deployment.state === 'READY') {
      const deploymentEvent = {
        projectName: deployment.meta.githubCommitRepo || '${this.projectName}',
        deploymentId: deployment.uid,
        version: deployment.meta.githubCommitSha?.substring(0, 7) || 'latest',
        environment: deployment.target === 'production' ? 'production' : 'staging',
        status: 'success',
        timestamp: new Date(deployment.createdAt),
        deploymentUrl: \`https://\${deployment.url}\`
      };

      const results = await socialMediaDeployer.announceDeployment(deploymentEvent);
      
      res.status(200).json({ 
        success: true, 
        message: 'Social media announcement sent',
        results 
      });
    } else {
      res.status(200).json({ 
        success: false, 
        message: 'Deployment not ready yet' 
      });
    }
  } catch (error) {
    console.error('Social media announcement failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};`;

      await fs.writeFile(path.join(apiDir, 'deployment-hook.js'), deploymentHookFunction);
      
      Logger.info('Vercel deployment hook created successfully');
      Logger.info('Add this webhook URL to your Vercel project: /api/deployment-hook');
      
    } catch (error) {
      Logger.error('Failed to setup Vercel integration:', error);
    }
  }

  /**
   * Setup Netlify deployment integration
   */
  async setupNetlifyIntegration(): Promise<void> {
    const netlifyTomlPath = path.join(process.cwd(), 'netlify.toml');
    
    try {
      let netlifyConfig = '';
      
      try {
        netlifyConfig = await fs.readFile(netlifyTomlPath, 'utf-8');
      } catch (error) {
        // File doesn't exist, create new config
      }

      const deployHook = `
[build]
  command = "npm run build && npm run announce-deployment"

[build.environment]
  NODE_ENV = "production"

[[plugins]]
  package = "@netlify/plugin-functions"

[functions]
  directory = "netlify/functions"

# Deploy notification webhook
[[build.processing.css]]
  bundle = true

[[build.processing.js]]
  bundle = true
`;

      if (!netlifyConfig.includes('announce-deployment')) {
        netlifyConfig += deployHook;
        await fs.writeFile(netlifyTomlPath, netlifyConfig);
      }

      // Create Netlify function for deployment notifications
      const functionsDir = path.join(process.cwd(), 'netlify', 'functions');
      await fs.mkdir(functionsDir, { recursive: true });

      const deployNotificationFunction = `// Netlify Deployment Notification Function
const { socialMediaDeployer } = require('@recoder/cli/dist/services/social-media-deployer');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const payload = JSON.parse(event.body);
    
    if (payload.state === 'ready') {
      const deploymentEvent = {
        projectName: payload.name || '${this.projectName}',
        deploymentId: payload.id,
        version: payload.commit_ref?.substring(0, 7) || 'latest',
        environment: payload.context === 'production' ? 'production' : 'staging',
        status: 'success',
        timestamp: new Date(payload.published_at),
        deploymentUrl: payload.ssl_url || payload.deploy_ssl_url
      };

      const results = await socialMediaDeployer.announceDeployment(deploymentEvent);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'Social media announcement sent',
          results 
        })
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: false, 
          message: 'Deployment not ready yet' 
        })
      };
    }
  } catch (error) {
    console.error('Social media announcement failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      })
    };
  }
};`;

      await fs.writeFile(path.join(functionsDir, 'deploy-notification.js'), deployNotificationFunction);
      
      // Add npm script for manual announcements
      if (this.packageJsonPath) {
        const packageJson = JSON.parse(await fs.readFile(this.packageJsonPath, 'utf-8'));
        
        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }

        packageJson.scripts['announce-deployment'] = 'node -e "const {socialMediaDeployer} = require(\'@recoder/cli/dist/services/social-media-deployer\'); socialMediaDeployer.announceDeployment({projectName: process.env.npm_package_name, deploymentId: Date.now(), version: process.env.npm_package_version, environment: process.env.NODE_ENV === \'production\' ? \'production\' : \'development\', status: \'success\', timestamp: new Date()});"';
        
        await fs.writeFile(this.packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
      
      Logger.info('Netlify deployment integration created successfully');
      Logger.info('Add webhook URL to Netlify: /.netlify/functions/deploy-notification');
      
    } catch (error) {
      Logger.error('Failed to setup Netlify integration:', error);
    }
  }

  /**
   * Manual deployment announcement (for testing)
   */
  async announceManualDeployment(environment: 'development' | 'staging' | 'production' = 'development'): Promise<void> {
    let version = 'unknown';
    let changes: string[] = [];

    try {
      if (this.packageJsonPath) {
        const packageJson = JSON.parse(await fs.readFile(this.packageJsonPath, 'utf-8'));
        version = packageJson.version || 'unknown';
      }

      if (this.isGitRepo) {
        const gitChanges = execSync('git log --oneline -3 --pretty=format:"%s"', { encoding: 'utf-8' });
        changes = gitChanges.split('\n').filter(Boolean);
      }
    } catch (error) {
      Logger.warn('Could not get deployment details:', error);
    }

    const deploymentEvent: DeploymentEvent = {
      projectName: this.projectName,
      deploymentId: `manual_${Date.now()}`,
      version,
      environment,
      status: 'success',
      timestamp: new Date(),
      changes
    };

    Logger.info('Announcing manual deployment...');

    const results = await socialMediaDeployer.announceDeployment(deploymentEvent);
    
    Logger.info('Manual deployment announcement completed');
  }

  /**
   * Setup all deployment integrations
   */
  async setupAll(): Promise<void> {
    Logger.info('Setting up all deployment integrations...');

    try {
      await this.installGitHooks();
    } catch (error) {
      Logger.warn('Git hooks setup failed:', error);
    }

    try {
      await this.setupCIIntegration();
    } catch (error) {
      Logger.warn('CI integration setup failed:', error);
    }

    try {
      await this.setupVercelIntegration();
    } catch (error) {
      Logger.warn('Vercel integration setup failed:', error);
    }

    try {
      await this.setupNetlifyIntegration();
    } catch (error) {
      Logger.warn('Netlify integration setup failed:', error);
    }

    Logger.info('✅ Deployment integrations setup complete!');
    Logger.info('🎯 Your deployments will now automatically post to social media!');
  }
}

export const deploymentHooks = new DeploymentHooks();