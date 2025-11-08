/**
 * GitHub Manager - CLI integration for GitHub API functionality
 * Uses api/githubApi.ts for GitHub operations
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const execAsync = promisify(exec);

class GitHubManager {
  constructor() {
    this.apiPath = path.join(__dirname, '../api/githubApi.ts');
    this.githubApiExists = fs.existsSync(this.apiPath);
  }

  async ensureGitHubAPI() {
    if (!this.githubApiExists) {
      throw new Error('GitHub API module not found. Please ensure api/githubApi.ts exists.');
    }

    // Check if required environment variables are set
    const requiredVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.log(chalk.red('❌ Missing required environment variables:'));
      missing.forEach(varName => {
        console.log(chalk.gray(`   ${varName}`));
      });
      console.log('');
      console.log(chalk.cyan('💡 Set up your GitHub integration:'));
      console.log('export GITHUB_TOKEN=your_github_token');
      console.log('export GITHUB_OWNER=your_github_username');
      console.log('export GITHUB_REPO=your_repo_name');
      return false;
    }
    
    return true;
  }

  async listIssues() {
    console.log(chalk.cyan('📋 Listing GitHub Issues...'));
    
    if (!await this.ensureGitHubAPI()) return;

    try {
      // Use the existing GitHub API module
      const { exec } = require('child_process');
      const command = `cd "${path.dirname(this.apiPath)}" && node -e "
        const { getGitHubData } = require('./githubApi.ts');
        const { Octokit } = require('@octokit/rest');
        
        const octokit = new Octokit({
          auth: process.env.GITHUB_TOKEN,
        });
        
        (async () => {
          try {
            const response = await octokit.issues.listForRepo({
              owner: process.env.GITHUB_OWNER,
              repo: process.env.GITHUB_REPO,
              state: 'open',
            });
            
            if (response.data.length === 0) {
              console.log('No open issues found.');
              return;
            }
            
            console.log('Open Issues:');
            response.data.forEach(issue => {
              console.log(\`#\${issue.number}: \${issue.title}\`);
            });
          } catch (error) {
            console.error('Error:', error.message);
          }
        })();
      "`;

      await execAsync(command);
    } catch (error) {
      console.log(chalk.red('❌ Failed to list issues'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async createPullRequest(title, body = '') {
    console.log(chalk.cyan(`🔄 Creating pull request: "${title}"`));
    
    if (!await this.ensureGitHubAPI()) return;

    try {
      const command = `cd "${path.dirname(this.apiPath)}" && node -e "
        const { Octokit } = require('@octokit/rest');
        
        const octokit = new Octokit({
          auth: process.env.GITHUB_TOKEN,
        });
        
        (async () => {
          try {
            // Get current branch
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
            const currentBranch = branch.trim();
            
            if (currentBranch === 'main' || currentBranch === 'master') {
              console.error('Cannot create PR from main/master branch');
              return;
            }
            
            const response = await octokit.pulls.create({
              owner: process.env.GITHUB_OWNER,
              repo: process.env.GITHUB_REPO,
              title: '${title.replace(/'/g, "\\'")}',
              body: '${body.replace(/'/g, "\\'")}',
              head: currentBranch,
              base: 'main'
            });
            
            console.log(\`✅ Pull request created: #\${response.data.number}\`);
            console.log(\`🔗 URL: \${response.data.html_url}\`);
          } catch (error) {
            console.error('Error:', error.message);
          }
        })();
      "`;

      await execAsync(command);
    } catch (error) {
      console.log(chalk.red('❌ Failed to create pull request'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async cloneRepo(repoUrl) {
    console.log(chalk.cyan(`📥 Cloning repository: ${repoUrl}`));
    
    try {
      const command = `git clone ${repoUrl}`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stdout) console.log(stdout);
      if (stderr) console.log(stderr);
      
      console.log(chalk.green('✅ Repository cloned successfully'));
    } catch (error) {
      console.log(chalk.red('❌ Failed to clone repository'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async closeDuplicates() {
    console.log(chalk.cyan('🔍 Finding and closing duplicate issues...'));
    
    if (!await this.ensureGitHubAPI()) return;

    try {
      const command = `cd "${path.dirname(this.apiPath)}" && node -e "
        const { autoCloseDuplicates } = require('./githubApi.ts');
        
        (async () => {
          try {
            await autoCloseDuplicates();
            console.log('✅ Duplicate issues processing completed');
          } catch (error) {
            console.error('Error:', error.message);
          }
        })();
      "`;

      await execAsync(command);
    } catch (error) {
      console.log(chalk.red('❌ Failed to close duplicates'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async getRepoInfo(owner, repo) {
    console.log(chalk.cyan(`📊 Getting repository info for ${owner}/${repo}...`));
    
    if (!await this.ensureGitHubAPI()) return;

    try {
      const command = `cd "${path.dirname(this.apiPath)}" && node -e "
        const { getGitHubData } = require('./githubApi.ts');
        
        (async () => {
          try {
            const data = await getGitHubData('${owner}', '${repo}');
            console.log(\`Name: \${data.name}\`);
            console.log(\`Description: \${data.description || 'No description'}\`);
            console.log(\`Stars: \${data.stargazers_count}\`);
            console.log(\`Forks: \${data.forks_count}\`);
            console.log(\`Language: \${data.language || 'Not specified'}\`);
            console.log(\`URL: \${data.html_url}\`);
          } catch (error) {
            console.error('Error:', error.message);
          }
        })();
      "`;

      await execAsync(command);
    } catch (error) {
      console.log(chalk.red('❌ Failed to get repository info'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async showHelp() {
    console.log(chalk.cyan.bold('🐙 GitHub CLI Commands'));
    console.log('');
    console.log(chalk.yellow('📋 ISSUE MANAGEMENT:'));
    console.log('  list                List open issues');
    console.log('  duplicates         Find and close duplicate issues');
    console.log('');
    console.log(chalk.yellow('🔄 PULL REQUESTS:'));
    console.log('  pr <title>         Create pull request from current branch');
    console.log('');
    console.log(chalk.yellow('📂 REPOSITORY:'));
    console.log('  clone <url>        Clone a repository');
    console.log('  info <owner/repo>  Get repository information');
    console.log('');
    console.log(chalk.yellow('📝 EXAMPLES:'));
    console.log('  recoder-code github list');
    console.log('  recoder-code github pr "Fix user authentication"');
    console.log('  recoder-code github clone https://github.com/user/repo.git');
    console.log('  recoder-code github info microsoft/vscode');
    console.log('  recoder-code github duplicates');
    console.log('');
    console.log(chalk.yellow('⚙️  SETUP:'));
    console.log('  export GITHUB_TOKEN=your_github_token');
    console.log('  export GITHUB_OWNER=your_github_username');  
    console.log('  export GITHUB_REPO=your_repo_name');
    console.log('');
    console.log(chalk.gray('💡 Uses api/githubApi.ts for GitHub API integration'));
  }
}

module.exports = GitHubManager;