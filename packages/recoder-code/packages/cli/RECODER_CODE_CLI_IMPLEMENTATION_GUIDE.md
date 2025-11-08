# 🚀 RECODER-CODE CLI - COMPLETE IMPLEMENTATION GUIDE

**Project**: recoder-code (Terminal CLI Tool)  
**Purpose**: AI-powered code generation from terminal (like GitHub Copilot CLI)  
**Backend API**: Already 100% ready at `https://recoder.xyz`  
**This Guide**: Complete end-to-end implementation for an AI to code

---

## 📋 TABLE OF CONTENTS

1. [Project Setup](#1-project-setup)
2. [Project Structure](#2-project-structure)
3. [Authentication System](#3-authentication-system)
4. [API Client](#4-api-client)
5. [Core Commands](#5-core-commands)
6. [Configuration Management](#6-configuration-management)
7. [Error Handling](#7-error-handling)
8. [Testing](#8-testing)
9. [Build & Publish](#9-build--publish)
10. [Complete File Listings](#10-complete-file-listings)

---

## 1. PROJECT SETUP

### 1.1 Initialize Project

```bash
mkdir recoder-code
cd recoder-code
npm init -y
```

### 1.2 Install Dependencies

```bash
# Core dependencies
npm install commander axios chalk ora boxen open inquirer fs-extra dotenv nanoid

# Development dependencies
npm install --save-dev typescript @types/node @types/inquirer @types/fs-extra ts-node nodemon

# Testing dependencies
npm install --save-dev jest @types/jest ts-jest

# Build tools
npm install --save-dev @vercel/ncc pkg
```

### 1.3 TypeScript Configuration

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 1.4 Package.json Scripts

Update `package.json`:
```json
{
  "name": "recoder-code",
  "version": "1.0.0",
  "description": "AI-powered code generation from terminal",
  "main": "dist/index.js",
  "bin": {
    "recoder": "./dist/index.js"
  },
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "build:binary": "pkg . --targets node18-macos-x64,node18-linux-x64,node18-win-x64",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["ai", "code-generation", "cli", "recoder"],
  "author": "Recoder.xyz",
  "license": "MIT",
  "dependencies": {
    "commander": "^11.1.0",
    "axios": "^1.6.2",
    "chalk": "^5.3.0",
    "ora": "^7.0.1",
    "boxen": "^7.1.1",
    "open": "^9.1.0",
    "inquirer": "^9.2.12",
    "fs-extra": "^11.2.0",
    "dotenv": "^16.3.1",
    "nanoid": "^5.0.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.5",
    "@types/inquirer": "^9.0.7",
    "@types/fs-extra": "^11.0.4",
    "ts-node": "^10.9.2",
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11",
    "ts-jest": "^29.1.1",
    "@vercel/ncc": "^0.38.1",
    "pkg": "^5.8.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 2. PROJECT STRUCTURE

```
recoder-code/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── auth/
│   │   ├── device-flow.ts          # OAuth device code flow
│   │   └── token-manager.ts        # Token storage & refresh
│   ├── api/
│   │   ├── client.ts               # API client with auth
│   │   └── endpoints.ts            # API endpoint definitions
│   ├── commands/
│   │   ├── auth.ts                 # Auth commands (login, logout, etc.)
│   │   ├── generate.ts             # Code generation commands
│   │   ├── chat.ts                 # Interactive chat
│   │   ├── project.ts              # Project management
│   │   └── config.ts               # Configuration commands
│   ├── utils/
│   │   ├── logger.ts               # Logging utility
│   │   ├── spinner.ts              # Loading indicators
│   │   ├── prompt.ts               # User input prompts
│   │   └── formatter.ts            # Output formatting
│   ├── config/
│   │   ├── constants.ts            # Constants and defaults
│   │   └── config-manager.ts       # Config file management
│   └── types/
│       └── index.ts                # TypeScript types
├── tests/
│   ├── auth.test.ts
│   ├── api-client.test.ts
│   └── commands.test.ts
├── .env.example
├── .gitignore
├── tsconfig.json
├── jest.config.js
├── package.json
└── README.md
```

---

## 3. AUTHENTICATION SYSTEM

### 3.1 Device Flow Handler

**File**: `src/auth/device-flow.ts`

```typescript
import axios from 'axios';
import open from 'open';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user?: {
    id: string;
    email: string;
    name: string;
    plan: string;
  };
}

export class DeviceFlowAuth {
  private apiBaseUrl: string;
  private clientId: string = 'recoder-cli';

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Step 1: Initiate device code flow
   */
  async initiateDeviceFlow(): Promise<DeviceCodeResponse> {
    try {
      const response = await axios.post<DeviceCodeResponse>(
        `${this.apiBaseUrl}/api/auth/cli/device`,
        {
          client_id: this.clientId,
          scope: 'cli:full',
        },
        {
          timeout: 10000,
        }
      );
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.data.message || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to connect to Recoder.xyz');
      } else {
        throw new Error(`Failed to initiate auth: ${error.message}`);
      }
    }
  }

  /**
   * Step 2: Poll for authorization
   */
  async pollForAuthorization(
    deviceCode: string,
    interval: number = 5,
    expiresIn: number = 600
  ): Promise<TokenResponse> {
    const maxAttempts = Math.floor(expiresIn / interval);
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.post<TokenResponse>(
          `${this.apiBaseUrl}/api/auth/cli/token`,
          {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: this.clientId,
          },
          {
            timeout: 10000,
          }
        );

        // Success! User authorized
        if (response.data.access_token) {
          return response.data;
        }
      } catch (error: any) {
        // Handle different response codes
        if (error.response) {
          const status = error.response.status;
          
          // 428 = Authorization pending (continue polling)
          if (status === 428) {
            await this.sleep(interval * 1000);
            attempts++;
            continue;
          }
          
          // 403 = User denied authorization
          if (status === 403) {
            throw new Error('Authorization denied by user');
          }
          
          // 410 = Device code expired
          if (status === 410) {
            throw new Error('Device code expired. Please try again.');
          }
          
          // Other errors
          throw new Error(`Authorization failed: ${error.response.data.message || 'Unknown error'}`);
        }
        
        // Network or other errors
        throw new Error(`Network error during authorization: ${error.message}`);
      }
    }

    throw new Error('Authorization timeout. Please try again.');
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await axios.post<TokenResponse>(
        `${this.apiBaseUrl}/api/auth/cli/token`,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
        },
        {
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Token refresh failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify access token
   */
  async verifyToken(accessToken: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.apiBaseUrl}/api/auth/cli/verify`,
        {
          access_token: accessToken,
        },
        {
          timeout: 10000,
        }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(accessToken: string): Promise<void> {
    try {
      await axios.delete(
        `${this.apiBaseUrl}/api/auth/cli/sessions/current`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );
    } catch (error: any) {
      // Ignore errors during revocation
      console.warn('Session revocation failed (continuing anyway)');
    }
  }

  /**
   * Helper: sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 3.2 Token Manager

**File**: `src/auth/token-manager.ts`

```typescript
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

interface Credentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  user?: {
    id: string;
    email: string;
    name: string;
    plan: string;
  };
  created_at: string;
}

export class TokenManager {
  private credentialsDir: string;
  private credentialsFile: string;

  constructor() {
    this.credentialsDir = path.join(os.homedir(), '.recoder');
    this.credentialsFile = path.join(this.credentialsDir, 'credentials.json');
  }

  /**
   * Save credentials to file
   */
  async saveCredentials(tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user?: any;
  }): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(this.credentialsDir);
      
      // Prepare credentials object
      const credentials: Credentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_at: Date.now() + tokens.expires_in * 1000,
        user: tokens.user,
        created_at: new Date().toISOString(),
      };

      // Write to file
      await fs.writeJSON(this.credentialsFile, credentials, { spaces: 2 });
      
      // Set restrictive permissions (user-only read/write)
      await fs.chmod(this.credentialsFile, 0o600);
    } catch (error: any) {
      throw new Error(`Failed to save credentials: ${error.message}`);
    }
  }

  /**
   * Load credentials from file
   */
  async loadCredentials(): Promise<Credentials | null> {
    try {
      if (await fs.pathExists(this.credentialsFile)) {
        const credentials = await fs.readJSON(this.credentialsFile);
        return credentials;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get access token (refreshing if needed)
   */
  async getAccessToken(): Promise<string | null> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.access_token) {
      return null;
    }

    return credentials.access_token;
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.refresh_token) {
      return null;
    }

    return credentials.refresh_token;
  }

  /**
   * Check if token is expired
   */
  async isTokenExpired(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.expires_at) {
      return true;
    }

    // Consider expired if within 1 minute of expiry
    return Date.now() >= credentials.expires_at - 60000;
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<any> {
    const credentials = await this.loadCredentials();
    return credentials?.user || null;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    return credentials !== null && credentials.access_token !== undefined;
  }

  /**
   * Clear credentials (logout)
   */
  async clearCredentials(): Promise<void> {
    try {
      if (await fs.pathExists(this.credentialsFile)) {
        await fs.remove(this.credentialsFile);
      }
    } catch (error: any) {
      throw new Error(`Failed to clear credentials: ${error.message}`);
    }
  }
}
```

---

## 4. API CLIENT

**File**: `src/api/client.ts`

```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { TokenManager } from '../auth/token-manager';
import { DeviceFlowAuth } from '../auth/device-flow';
import chalk from 'chalk';

export class RecoderAPIClient {
  private client: AxiosInstance;
  private tokenManager: TokenManager;
  private deviceFlow: DeviceFlowAuth;
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.tokenManager = new TokenManager();
    this.deviceFlow = new DeviceFlowAuth(apiBaseUrl);

    this.client = axios.create({
      baseURL: apiBaseUrl,
      timeout: 60000, // 60 seconds for AI generation
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-code-cli/1.0.0',
      },
    });

    // Request interceptor: Add auth token
    this.client.interceptors.request.use(
      async (config) => {
        // Check if token is expired and refresh if needed
        if (await this.tokenManager.isTokenExpired()) {
          await this.refreshToken();
        }

        // Get access token
        const token = await this.tokenManager.getAccessToken();
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
          // Try to refresh token once
          try {
            await this.refreshToken();
            // Retry the original request
            return this.client.request(error.config);
          } catch (refreshError) {
            console.error(chalk.red('\n✗ Authentication expired. Please run "recoder auth login"\n'));
            process.exit(1);
          }
        }

        // Handle other errors
        return Promise.reject(error);
      }
    );
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<void> {
    const refreshToken = await this.tokenManager.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const newTokens = await this.deviceFlow.refreshAccessToken(refreshToken);
    await this.tokenManager.saveCredentials(newTokens);
  }

  /**
   * Generate code with AI
   */
  async generateCode(prompt: string, options: {
    model?: string;
    language?: string;
    framework?: string;
    style?: string;
  } = {}): Promise<any> {
    const response = await this.client.post('/api/ai/generate', {
      prompt,
      model: options.model || 'claude-3-5-sonnet',
      language: options.language,
      framework: options.framework,
      codeStyle: options.style || 'production',
    });
    return response.data;
  }

  /**
   * Interactive chat with AI
   */
  async chat(messages: Array<{ role: string; content: string }>, options: {
    model?: string;
    stream?: boolean;
  } = {}): Promise<any> {
    const response = await this.client.post('/api/ai/chat', {
      messages,
      model: options.model || 'claude-3-5-sonnet',
      stream: options.stream || false,
    });
    return response.data;
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<any> {
    const response = await this.client.get('/api/user/profile');
    return response.data;
  }

  /**
   * Get usage statistics
   */
  async getUsage(): Promise<any> {
    const response = await this.client.get('/api/user/usage');
    return response.data;
  }

  /**
   * Create project
   */
  async createProject(data: {
    name: string;
    description?: string;
    type?: string;
  }): Promise<any> {
    const response = await this.client.post('/api/projects', data);
    return response.data;
  }

  /**
   * List projects
   */
  async listProjects(): Promise<any> {
    const response = await this.client.get('/api/projects');
    return response.data;
  }

  /**
   * Get project by ID
   */
  async getProject(id: string): Promise<any> {
    const response = await this.client.get(`/api/projects/${id}`);
    return response.data;
  }

  /**
   * Update project
   */
  async updateProject(id: string, data: any): Promise<any> {
    const response = await this.client.put(`/api/projects/${id}`, data);
    return response.data;
  }

  /**
   * Delete project
   */
  async deleteProject(id: string): Promise<any> {
    const response = await this.client.delete(`/api/projects/${id}`);
    return response.data;
  }

  /**
   * Get analytics
   */
  async getAnalytics(range: string = '24h'): Promise<any> {
    const response = await this.client.get(`/api/analytics/real-time?range=${range}`);
    return response.data;
  }
}
```

---

## 5. CORE COMMANDS

### 5.1 Auth Commands

**File**: `src/commands/auth.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import boxen from 'boxen';
import { DeviceFlowAuth } from '../auth/device-flow';
import { TokenManager } from '../auth/token-manager';
import { config } from '../config/constants';
import inquirer from 'inquirer';

export function registerAuthCommands(program: Command) {
  const auth = program
    .command('auth')
    .description('Authenticate with Recoder.xyz');

  // recoder auth login
  auth
    .command('login')
    .description('Login to Recoder.xyz')
    .option('--no-browser', 'Do not open browser automatically')
    .action(async (options) => {
      try {
        const tokenManager = new TokenManager();
        const deviceFlow = new DeviceFlowAuth(config.API_BASE_URL);

        console.log(chalk.blue.bold('\n🔐 Recoder.xyz Authentication\n'));

        // Check if already authenticated
        if (await tokenManager.isAuthenticated()) {
          const user = await tokenManager.getCurrentUser();
          console.log(chalk.green('✓ Already authenticated'));
          console.log(chalk.gray(`  Logged in as: ${user?.email || 'Unknown'}`));
          console.log(chalk.gray(`  Plan: ${user?.plan || 'Free'}\n`));
          
          const { reauth } = await inquirer.prompt([{
            type: 'confirm',
            name: 'reauth',
            message: 'Do you want to login again?',
            default: false,
          }]);
          
          if (!reauth) {
            return;
          }
        }

        const spinner = ora('Initiating authentication...').start();

        // Step 1: Get device code
        const deviceFlowData = await deviceFlow.initiateDeviceFlow();
        spinner.succeed('Device code generated');

        // Step 2: Display instructions to user
        console.log(
          boxen(
            chalk.bold('Complete authentication in your browser:\n\n') +
            chalk.cyan(`URL: ${deviceFlowData.verification_uri}\n`) +
            chalk.yellow.bold(`Code: ${deviceFlowData.user_code}\n\n`) +
            chalk.gray(`Or visit: ${deviceFlowData.verification_uri_complete}`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        );

        // Open browser automatically unless --no-browser
        if (options.browser !== false) {
          console.log(chalk.gray('Opening browser...\n'));
          await open(deviceFlowData.verification_uri_complete);
        }

        // Step 3: Poll for authorization
        spinner.start('Waiting for authorization...');
        const tokens = await deviceFlow.pollForAuthorization(
          deviceFlowData.device_code,
          deviceFlowData.interval,
          deviceFlowData.expires_in
        );

        spinner.succeed('Authorization successful!');

        // Step 4: Save credentials
        await tokenManager.saveCredentials(tokens);

        // Display success message
        console.log(
          boxen(
            chalk.green.bold('✓ Successfully authenticated!\n\n') +
            chalk.white(`Welcome, ${tokens.user?.name || tokens.user?.email}!\n`) +
            chalk.gray(`Plan: ${tokens.user?.plan || 'Free'}\n`) +
            chalk.gray(`Email: ${tokens.user?.email}`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        );

        console.log(chalk.cyan('\nYou can now use recoder commands.\n'));
      } catch (error: any) {
        console.error(chalk.red(`\n✗ Authentication failed: ${error.message}\n`));
        process.exit(1);
      }
    });

  // recoder auth logout
  auth
    .command('logout')
    .description('Logout from Recoder.xyz')
    .action(async () => {
      try {
        const tokenManager = new TokenManager();
        const deviceFlow = new DeviceFlowAuth(config.API_BASE_URL);

        const spinner = ora('Logging out...').start();

        // Revoke session on server
        const accessToken = await tokenManager.getAccessToken();
        if (accessToken) {
          await deviceFlow.revokeSession(accessToken);
        }

        // Clear local credentials
        await tokenManager.clearCredentials();

        spinner.succeed('Logged out successfully');
        console.log(chalk.gray('\nYou have been logged out from Recoder.xyz\n'));
      } catch (error: any) {
        console.error(chalk.red(`\n✗ Logout failed: ${error.message}\n`));
        process.exit(1);
      }
    });

  // recoder auth status
  auth
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      try {
        const tokenManager = new TokenManager();
        const isAuth = await tokenManager.isAuthenticated();
        
        if (isAuth) {
          const user = await tokenManager.getCurrentUser();
          console.log(
            boxen(
              chalk.green.bold('✓ Authenticated\n\n') +
              chalk.white(`User: ${user?.name || 'Unknown'}\n`) +
              chalk.gray(`Email: ${user?.email || 'Unknown'}\n`) +
              chalk.gray(`Plan: ${user?.plan || 'Free'}`),
              {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              }
            )
          );
        } else {
          console.log(
            boxen(
              chalk.yellow.bold('✗ Not authenticated\n\n') +
              chalk.gray('Run "recoder auth login" to authenticate'),
              {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              }
            )
          );
        }
      } catch (error: any) {
        console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
        process.exit(1);
      }
    });

  // recoder auth whoami
  auth
    .command('whoami')
    .description('Show current user')
    .action(async () => {
      try {
        const tokenManager = new TokenManager();
        const user = await tokenManager.getCurrentUser();
        
        if (user) {
          console.log(chalk.cyan('\nCurrent user:'));
          console.log(chalk.white(`  Name:  ${user.name}`));
          console.log(chalk.white(`  Email: ${user.email}`));
          console.log(chalk.white(`  ID:    ${user.id}`));
          console.log(chalk.white(`  Plan:  ${user.plan}\n`));
        } else {
          console.log(chalk.yellow('\nNot authenticated. Run "recoder auth login"\n'));
        }
      } catch (error: any) {
        console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
        process.exit(1);
      }
    });
}
```

---

### 5.2 Generate Command

**File**: `src/commands/generate.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { RecoderAPIClient } from '../api/client';
import { TokenManager } from '../auth/token-manager';
import { config } from '../config/constants';
import fs from 'fs-extra';
import path from 'path';

export function registerGenerateCommand(program: Command) {
  program
    .command('generate')
    .alias('gen')
    .description('Generate code with AI')
    .argument('[prompt]', 'What to generate')
    .option('-m, --model <model>', 'AI model to use', 'claude-3-5-sonnet')
    .option('-l, --language <language>', 'Programming language')
    .option('-f, --framework <framework>', 'Framework to use')
    .option('-s, --style <style>', 'Code style (production, minimal, verbose)', 'production')
    .option('-o, --output <file>', 'Output file')
    .option('--no-interactive', 'Non-interactive mode')
    .action(async (promptArg, options) => {
      try {
        // Check authentication
        const tokenManager = new TokenManager();
        if (!(await tokenManager.isAuthenticated())) {
          console.error(chalk.red('\n✗ Please login first: recoder auth login\n'));
          process.exit(1);
        }

        const apiClient = new RecoderAPIClient(config.API_BASE_URL);

        // Get prompt
        let prompt = promptArg;
        if (!prompt && options.interactive !== false) {
          const { userPrompt } = await inquirer.prompt([{
            type: 'input',
            name: 'userPrompt',
            message: 'What do you want to generate?',
            validate: (input) => input.trim().length > 0 || 'Prompt cannot be empty',
          }]);
          prompt = userPrompt;
        } else if (!prompt) {
          console.error(chalk.red('\n✗ Prompt is required\n'));
          process.exit(1);
        }

        // Show generation in progress
        const spinner = ora('Generating code with AI...').start();

        // Call API
        const result = await apiClient.generateCode(prompt, {
          model: options.model,
          language: options.language,
          framework: options.framework,
          style: options.style,
        });

        spinner.succeed('Code generated successfully!');

        // Display generated code
        console.log(chalk.cyan('\n' + '='.repeat(60)));
        console.log(chalk.bold('Generated Code:'));
        console.log(chalk.cyan('='.repeat(60) + '\n'));
        console.log(result.code);
        console.log(chalk.cyan('\n' + '='.repeat(60) + '\n'));

        // Show metadata
        if (result.metadata) {
          console.log(chalk.gray(`Model: ${result.metadata.model || options.model}`));
          console.log(chalk.gray(`Language: ${result.metadata.language || 'auto-detected'}`));
          console.log(chalk.gray(`Tokens: ${result.metadata.tokensUsed || 'N/A'}`));
        }

        // Save to file if specified
        if (options.output) {
          await fs.writeFile(options.output, result.code);
          console.log(chalk.green(`\n✓ Saved to ${options.output}\n`));
        } else if (options.interactive !== false) {
          // Ask if user wants to save
          const { save } = await inquirer.prompt([{
            type: 'confirm',
            name: 'save',
            message: 'Save to file?',
            default: false,
          }]);

          if (save) {
            const { filename } = await inquirer.prompt([{
              type: 'input',
              name: 'filename',
              message: 'Filename:',
              default: 'generated-code.js',
            }]);

            await fs.writeFile(filename, result.code);
            console.log(chalk.green(`\n✓ Saved to ${filename}\n`));
          }
        }

      } catch (error: any) {
        console.error(chalk.red(`\n✗ Generation failed: ${error.message}\n`));
        if (error.response?.data) {
          console.error(chalk.gray(JSON.stringify(error.response.data, null, 2)));
        }
        process.exit(1);
      }
    });
}
```

---

### 5.3 Chat Command

**File**: `src/commands/chat.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { RecoderAPIClient } from '../api/client';
import { TokenManager } from '../auth/token-manager';
import { config } from '../config/constants';

export function registerChatCommand(program: Command) {
  program
    .command('chat')
    .description('Interactive chat with AI')
    .option('-m, --model <model>', 'AI model to use', 'claude-3-5-sonnet')
    .action(async (options) => {
      try {
        // Check authentication
        const tokenManager = new TokenManager();
        if (!(await tokenManager.isAuthenticated())) {
          console.error(chalk.red('\n✗ Please login first: recoder auth login\n'));
          process.exit(1);
        }

        const apiClient = new RecoderAPIClient(config.API_BASE_URL);
        const messages: Array<{ role: string; content: string }> = [];

        console.log(chalk.blue.bold('\n💬 Recoder AI Chat'));
        console.log(chalk.gray(`Model: ${options.model}`));
        console.log(chalk.gray('Type "exit" to quit\n'));

        let chatting = true;
        while (chatting) {
          // Get user input
          const { message } = await inquirer.prompt([{
            type: 'input',
            name: 'message',
            message: 'You:',
            prefix: chalk.cyan('▶'),
          }]);

          // Check for exit
          if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
            console.log(chalk.yellow('\nGoodbye! 👋\n'));
            chatting = false;
            break;
          }

          // Add user message
          messages.push({ role: 'user', content: message });

          // Get AI response
          console.log(chalk.gray('\nThinking...\n'));

          const response = await apiClient.chat(messages, {
            model: options.model,
          });

          // Add AI response to history
          messages.push({ role: 'assistant', content: response.message });

          // Display AI response
          console.log(chalk.green('AI:'), response.message);
          console.log();
        }

      } catch (error: any) {
        console.error(chalk.red(`\n✗ Chat error: ${error.message}\n`));
        process.exit(1);
      }
    });
}
```

---

## 6. CONFIGURATION MANAGEMENT

**File**: `src/config/constants.ts`

```typescript
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // API Configuration
  API_BASE_URL: process.env.RECODER_API_URL || 'https://recoder.xyz',
  
  // CLI Configuration
  CLIENT_ID: 'recoder-cli',
  
  // Defaults
  DEFAULT_MODEL: 'claude-3-5-sonnet',
  DEFAULT_LANGUAGE: 'javascript',
  DEFAULT_STYLE: 'production',
  
  // Directories
  CONFIG_DIR: '.recoder',
  CREDENTIALS_FILE: 'credentials.json',
  
  // Other
  VERSION: '1.0.0',
  USER_AGENT: 'recoder-code-cli/1.0.0',
};
```

---

## 7. ERROR HANDLING

**File**: `src/utils/error-handler.ts`

```typescript
import chalk from 'chalk';

export class CLIError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'CLIError';
  }
}

export function handleError(error: any): never {
  if (error instanceof CLIError) {
    console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
    if (error.code) {
      console.error(chalk.gray(`Code: ${error.code}\n`));
    }
  } else if (error.response) {
    // API error
    console.error(chalk.red(`\n✗ API Error: ${error.response.data.message || error.response.statusText}\n`));
    if (error.response.status) {
      console.error(chalk.gray(`Status: ${error.response.status}\n`));
    }
  } else if (error.request) {
    // Network error
    console.error(chalk.red('\n✗ Network Error: Unable to connect to Recoder.xyz\n'));
    console.error(chalk.gray('Please check your internet connection\n'));
  } else {
    // Other errors
    console.error(chalk.red(`\n✗ Unexpected error: ${error.message}\n`));
  }
  
  process.exit(1);
}
```

---

## 8. MAIN ENTRY POINT

**File**: `src/index.ts`

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerAuthCommands } from './commands/auth';
import { registerGenerateCommand } from './commands/generate';
import { registerChatCommand } from './commands/chat';
import { handleError } from './utils/error-handler';
import { config } from './config/constants';

const program = new Command();

// Configure program
program
  .name('recoder')
  .description('Recoder.xyz CLI - AI-powered code generation from your terminal')
  .version(config.VERSION);

// Register command groups
registerAuthCommands(program);
registerGenerateCommand(program);
registerChatCommand(program);

// Global error handler
program.exitOverride((err) => {
  if (err.code !== 'commander.help' && err.code !== 'commander.version') {
    handleError(err);
  }
  process.exit(err.exitCode);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
```

---

## 9. BUILD & PUBLISH

### 9.1 Build Script

```bash
npm run build
```

### 9.2 Test Locally

```bash
npm link
recoder auth login
recoder generate "create a react button"
```

### 9.3 Publish to NPM

```bash
npm login
npm publish
```

### 9.4 Create Binaries

```bash
npm run build:binary
```

---

## 10. TESTING

**File**: `tests/auth.test.ts`

```typescript
import { TokenManager } from '../src/auth/token-manager';
import fs from 'fs-extra';

describe('TokenManager', () => {
  const tokenManager = new TokenManager();

  beforeEach(async () => {
    await tokenManager.clearCredentials();
  });

  test('should save and load credentials', async () => {
    const tokens = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    await tokenManager.saveCredentials(tokens);
    const loaded = await tokenManager.loadCredentials();

    expect(loaded).toBeTruthy();
    expect(loaded?.access_token).toBe(tokens.access_token);
  });

  test('should detect authentication status', async () => {
    expect(await tokenManager.isAuthenticated()).toBe(false);

    await tokenManager.saveCredentials({
      access_token: 'test',
      refresh_token: 'test',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    expect(await tokenManager.isAuthenticated()).toBe(true);
  });
});
```

---

## 📝 IMPLEMENTATION CHECKLIST

### Phase 1: Setup & Auth
- [ ] Initialize project with TypeScript
- [ ] Install all dependencies
- [ ] Create project structure
- [ ] Implement DeviceFlowAuth class
- [ ] Implement TokenManager class
- [ ] Create auth commands (login, logout, status, whoami)
- [ ] Test authentication flow with real API

### Phase 2: API Client
- [ ] Create RecoderAPIClient class
- [ ] Add request/response interceptors
- [ ] Implement token refresh logic
- [ ] Add error handling
- [ ] Test API calls

### Phase 3: Core Commands
- [ ] Implement generate command
- [ ] Implement chat command
- [ ] Add interactive prompts
- [ ] Add file output support
- [ ] Test all commands

### Phase 4: Polish & Distribution
- [ ] Add comprehensive error handling
- [ ] Create tests
- [ ] Write README
- [ ] Build and test locally
- [ ] Publish to NPM
- [ ] Create standalone binaries

---

## 🎯 ACCEPTANCE CRITERIA

**Authentication**:
- [ ] `recoder auth login` opens browser and completes OAuth flow
- [ ] Credentials saved securely in ~/.recoder/
- [ ] Token refresh works automatically
- [ ] `recoder auth logout` clears credentials

**Code Generation**:
- [ ] `recoder generate "prompt"` returns AI-generated code
- [ ] Different models can be specified
- [ ] Output can be saved to file
- [ ] Interactive mode works

**Chat**:
- [ ] `recoder chat` starts interactive conversation
- [ ] Conversation history maintained
- [ ] Can exit with "exit" or "quit"

**Error Handling**:
- [ ] Clear error messages for all failure cases
- [ ] Network errors handled gracefully
- [ ] Auth errors prompt re-login

**Quality**:
- [ ] All TypeScript types correct
- [ ] No console errors
- [ ] Fast performance (< 2s for most operations)
- [ ] Works on macOS, Linux, Windows

---

## 🚀 READY TO IMPLEMENT

This guide contains everything needed to build the `recoder-code` CLI from scratch. An AI can follow this step-by-step to create a fully functional CLI tool that authenticates with Recoder.xyz and provides AI-powered code generation from the terminal.

**Backend is 100% ready** - Just implement the CLI client following this guide!

---

**Last Updated**: October 16, 2025  
**Status**: Complete implementation guide ready for AI coding
