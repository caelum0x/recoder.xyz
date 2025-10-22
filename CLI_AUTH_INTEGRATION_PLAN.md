# 🔐 CLI Authentication Integration Plan for `recoder-code`

## 📋 Overview

You already have a **complete OAuth Device Code Flow** implementation in `/app` and `/backend`. This guide shows how to integrate it with your external `recoder-code` CLI package.

---

## 🏗️ Architecture

### Current Infrastructure ✅

**Database Models** (Already exist):
- `DeviceCode` - Temporary codes for device auth flow
- `CLISession` - Active CLI sessions with tokens
- `User` - User accounts

**Backend Services** (Already exist):
- `CLIAuthService` - Complete device code flow logic
- Token generation and validation
- Session management

**API Endpoints** (Already exist):
```
POST   /api/auth/cli/device        - Generate device code
POST   /api/auth/cli/authorize     - Authorize device (web UI)
GET    /api/auth/cli/authorize     - Get device info (web UI)
POST   /api/auth/cli/token         - Poll for tokens / Refresh
POST   /api/auth/cli/verify        - Verify access token
GET    /api/auth/cli/sessions      - List active sessions
DELETE /api/auth/cli/sessions/:id  - Revoke session
POST   /api/auth/cli/keys          - Generate API key
GET    /api/auth/cli/keys          - List API keys
DELETE /api/auth/cli/keys/:id      - Revoke API key
```

**Web Pages** (Already exist):
- `/cli/auth` - Device code authorization page
- `/cli/setup` - CLI setup guide

---

## 🔄 Authentication Flow

### Device Code Flow (OAuth 2.0 Device Authorization Grant)

```
┌─────────────┐                                    ┌─────────────┐
│             │                                    │             │
│  recoder-   │                                    │  recoder.   │
│   code      │                                    │    xyz      │
│   (CLI)     │                                    │   (API)     │
│             │                                    │             │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. POST /api/auth/cli/device                   │
       │ ─────────────────────────────────────────────>  │
       │                                                  │
       │  2. device_code, user_code, verification_uri    │
       │  <─────────────────────────────────────────────  │
       │                                                  │
       │                                                  │
       │  3. Display to user:                            │
       │     "Visit: https://recoder.xyz/cli/auth"       │
       │     "Enter code: ABCD-1234"                     │
       │                                                  │
       ┌──────────────────────────────────────────────┐  │
       │         User opens browser                    │  │
       │    https://recoder.xyz/cli/auth?code=ABCD-1234  │
       │                                               │  │
       │    [Login if not authenticated]               │  │
       │    [Confirm: "Authorize CLI access?"]        │  │
       │    [Click "Authorize"]                        │  │
       └──────────────────────────────────────────────┘  │
       │                                                  │
       │                                     POST /api/auth/cli/authorize
       │                                     user confirms ────>
       │                                                  │
       │  4. Poll: POST /api/auth/cli/token              │
       │     { grant_type: "device_code",                │
       │       device_code: "..." }                      │
       │ ─────────────────────────────────────────────>  │
       │                                                  │
       │  5. Response:                                    │
       │     { access_token, refresh_token, expires_in } │
       │  <─────────────────────────────────────────────  │
       │                                                  │
       │  6. Save tokens locally                          │
       │     ~/.recoder/credentials.json                  │
       │                                                  │
       │  7. Use access_token for API calls              │
       │     Authorization: Bearer reco_...              │
       │ ─────────────────────────────────────────────>  │
       │                                                  │
```

---

## 💻 CLI Implementation (`recoder-code`)

### 1. Authentication Module

Create `src/auth/device-flow.ts` in your `recoder-code` package:

```typescript
import axios from 'axios';
import open from 'open';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

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

const API_BASE_URL = process.env.RECODER_API_URL || 'https://recoder.xyz';
const CREDENTIALS_DIR = path.join(os.homedir(), '.recoder');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

export class RecoderAuth {
  /**
   * Step 1: Initiate device code flow
   */
  static async initiateDeviceFlow(): Promise<DeviceCodeResponse> {
    try {
      const response = await axios.post<DeviceCodeResponse>(
        `${API_BASE_URL}/api/auth/cli/device`,
        {
          client_id: 'recoder-cli',
          scope: 'cli:full',
        }
      );
      
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to initiate auth: ${error.message}`);
    }
  }

  /**
   * Step 2: Poll for authorization
   */
  static async pollForAuthorization(
    deviceCode: string,
    interval: number = 5,
    expiresIn: number = 600
  ): Promise<TokenResponse> {
    const maxAttempts = Math.floor(expiresIn / interval);
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.post<TokenResponse>(
          `${API_BASE_URL}/api/auth/cli/token`,
          {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: 'recoder-cli',
          }
        );

        // If we get here, authorization succeeded
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 428) {
          // Authorization pending - continue polling
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          attempts++;
          continue;
        }

        if (error.response?.status === 403) {
          throw new Error('Authorization denied by user');
        }

        if (error.response?.status === 410) {
          throw new Error('Device code expired. Please try again.');
        }

        throw new Error(`Authorization failed: ${error.message}`);
      }
    }

    throw new Error('Authorization timeout. Please try again.');
  }

  /**
   * Step 3: Save credentials
   */
  static async saveCredentials(tokens: TokenResponse): Promise<void> {
    await fs.ensureDir(CREDENTIALS_DIR);
    
    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_at: Date.now() + tokens.expires_in * 1000,
      user: tokens.user,
      created_at: new Date().toISOString(),
    };

    await fs.writeJSON(CREDENTIALS_FILE, credentials, { spaces: 2 });
    
    // Set file permissions to user-only
    await fs.chmod(CREDENTIALS_FILE, 0o600);
  }

  /**
   * Load saved credentials
   */
  static async loadCredentials(): Promise<any> {
    try {
      if (await fs.pathExists(CREDENTIALS_FILE)) {
        return await fs.readJSON(CREDENTIALS_FILE);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.access_token) {
      return false;
    }

    // Check if token is expired
    if (credentials.expires_at && Date.now() >= credentials.expires_at) {
      // Try to refresh
      return await this.refreshToken();
    }

    // Verify token with API
    try {
      await axios.post(`${API_BASE_URL}/api/auth/cli/verify`, {
        access_token: credentials.access_token,
      });
      return true;
    } catch (error) {
      // Try to refresh
      return await this.refreshToken();
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.refresh_token) {
      return false;
    }

    try {
      const response = await axios.post<TokenResponse>(
        `${API_BASE_URL}/api/auth/cli/token`,
        {
          grant_type: 'refresh_token',
          refresh_token: credentials.refresh_token,
          client_id: 'recoder-cli',
        }
      );

      await this.saveCredentials(response.data);
      return true;
    } catch (error) {
      // Refresh failed, need to re-authenticate
      return false;
    }
  }

  /**
   * Get access token for API calls
   */
  static async getAccessToken(): Promise<string | null> {
    const credentials = await this.loadCredentials();
    
    if (!credentials || !credentials.access_token) {
      return null;
    }

    // Check if expired and refresh if needed
    if (credentials.expires_at && Date.now() >= credentials.expires_at - 60000) {
      await this.refreshToken();
      const refreshed = await this.loadCredentials();
      return refreshed?.access_token || null;
    }

    return credentials.access_token;
  }

  /**
   * Logout - remove credentials
   */
  static async logout(): Promise<void> {
    const credentials = await this.loadCredentials();
    
    if (credentials && credentials.access_token) {
      // Revoke session on server
      try {
        await axios.delete(`${API_BASE_URL}/api/auth/cli/sessions/current`, {
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
          },
        });
      } catch (error) {
        // Ignore errors, just remove local credentials
      }
    }

    // Remove local credentials
    if (await fs.pathExists(CREDENTIALS_FILE)) {
      await fs.remove(CREDENTIALS_FILE);
    }
  }

  /**
   * Get current user info
   */
  static async getCurrentUser(): Promise<any> {
    const credentials = await this.loadCredentials();
    return credentials?.user || null;
  }
}
```

---

### 2. CLI Command Implementation

Create `src/commands/auth.ts` in your `recoder-code` package:

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { RecoderAuth } from '../auth/device-flow';
import boxen from 'boxen';

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
        console.log(chalk.blue.bold('\n🔐 Recoder.xyz Authentication\n'));

        // Check if already authenticated
        if (await RecoderAuth.isAuthenticated()) {
          const user = await RecoderAuth.getCurrentUser();
          console.log(chalk.green('✓ Already authenticated'));
          console.log(chalk.gray(`  Logged in as: ${user?.email || 'Unknown'}`));
          console.log(chalk.gray(`  Plan: ${user?.plan || 'Free'}\n`));
          
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          
          const answer = await new Promise<string>(resolve => {
            readline.question('Do you want to login again? (y/N) ', resolve);
          });
          readline.close();
          
          if (answer.toLowerCase() !== 'y') {
            return;
          }
        }

        const spinner = ora('Initiating authentication...').start();

        // Step 1: Get device code
        const deviceFlow = await RecoderAuth.initiateDeviceFlow();
        spinner.succeed('Device code generated');

        // Step 2: Display instructions to user
        console.log(
          boxen(
            chalk.bold('Complete authentication in your browser:\n\n') +
            chalk.cyan(`URL: ${deviceFlow.verification_uri}\n`) +
            chalk.yellow.bold(`Code: ${deviceFlow.user_code}\n\n`) +
            chalk.gray(`Or visit: ${deviceFlow.verification_uri_complete}`),
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
          await open(deviceFlow.verification_uri_complete);
        }

        // Step 3: Poll for authorization
        spinner.start('Waiting for authorization...');
        const tokens = await RecoderAuth.pollForAuthorization(
          deviceFlow.device_code,
          deviceFlow.interval,
          deviceFlow.expires_in
        );

        spinner.succeed('Authorization successful!');

        // Step 4: Save credentials
        await RecoderAuth.saveCredentials(tokens);

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

        console.log(chalk.cyan('\nYou can now use recoder-code commands.\n'));
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
        const spinner = ora('Logging out...').start();
        await RecoderAuth.logout();
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
        const isAuth = await RecoderAuth.isAuthenticated();
        
        if (isAuth) {
          const user = await RecoderAuth.getCurrentUser();
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
        const user = await RecoderAuth.getCurrentUser();
        
        if (user) {
          console.log(chalk.cyan('\nCurrent user:'));
          console.log(chalk.white(`  Name:  ${user.name}`));
          console.log(chalk.white(`  Email: ${user.email}`));
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

### 3. API Client with Auth

Create `src/api/client.ts` in your `recoder-code` package:

```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { RecoderAuth } from '../auth/device-flow';
import chalk from 'chalk';

const API_BASE_URL = process.env.RECODER_API_URL || 'https://recoder.xyz';

class RecoderAPIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-code-cli/1.0.0',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Get access token
        const token = await RecoderAuth.getAccessToken();
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for auth errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          console.error(chalk.red('\n✗ Authentication expired. Please run "recoder auth login"\n'));
          process.exit(1);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate code with AI
   */
  async generateCode(prompt: string, options: any = {}) {
    const response = await this.client.post('/api/ai/generate', {
      prompt,
      ...options,
    });
    return response.data;
  }

  /**
   * Get user usage stats
   */
  async getUsage() {
    const response = await this.client.get('/api/user/usage');
    return response.data;
  }

  /**
   * Get user profile
   */
  async getProfile() {
    const response = await this.client.get('/api/user/profile');
    return response.data;
  }

  /**
   * Create project
   */
  async createProject(data: any) {
    const response = await this.client.post('/api/projects', data);
    return response.data;
  }

  /**
   * List projects
   */
  async listProjects() {
    const response = await this.client.get('/api/projects');
    return response.data;
  }
}

// Export singleton
export const apiClient = new RecoderAPIClient();
```

---

### 4. Main CLI Entry Point

Update `src/index.ts` in your `recoder-code` package:

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth';
import { registerGenerateCommands } from './commands/generate';
import chalk from 'chalk';

const program = new Command();

program
  .name('recoder')
  .description('Recoder.xyz CLI - AI-powered code generation from your terminal')
  .version('1.0.0');

// Register command groups
registerAuthCommands(program);
registerGenerateCommands(program);

// Add other commands...
program
  .command('init')
  .description('Initialize a new project')
  .action(async () => {
    // Require auth for this command
    const { RecoderAuth } = await import('./auth/device-flow');
    if (!(await RecoderAuth.isAuthenticated())) {
      console.error(chalk.red('\n✗ Please login first: recoder auth login\n'));
      process.exit(1);
    }
    
    // Project init logic...
  });

program.parse();
```

---

## 📦 Package Dependencies

Add to your `recoder-code` package.json:

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "boxen": "^7.1.0",
    "open": "^9.1.0",
    "fs-extra": "^11.1.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 🔧 Environment Variables

Create `.env` in `recoder-code`:

```bash
# API Base URL
RECODER_API_URL=https://recoder.xyz

# For development
# RECODER_API_URL=http://localhost:3000
```

---

## 🧪 Testing the Flow

### From CLI Side:

```bash
# Install recoder-code CLI
npm install -g recoder-code

# Login
recoder auth login

# Output:
# 🔐 Recoder.xyz Authentication
# 
# ┌──────────────────────────────────────┐
# │ Complete authentication in browser:  │
# │                                      │
# │ URL: https://recoder.xyz/cli/auth    │
# │ Code: ABCD-1234                      │
# │                                      │
# │ Or visit: https://recoder.xyz/...    │
# └──────────────────────────────────────┘
# 
# Waiting for authorization...

# After user authorizes in browser:
# ✓ Authorization successful!
# 
# ┌──────────────────────────────────────┐
# │ ✓ Successfully authenticated!        │
# │                                      │
# │ Welcome, John Doe!                   │
# │ Plan: Pro                            │
# │ Email: john@example.com              │
# └──────────────────────────────────────┘

# Check status
recoder auth status

# Who am I?
recoder auth whoami

# Use authenticated commands
recoder generate "create a react component"

# Logout
recoder auth logout
```

---

## 📋 Implementation Checklist

### Backend (Already Complete ✅)
- [x] DeviceCode model in database
- [x] CLISession model in database
- [x] CLIAuthService with device flow
- [x] API routes for device flow
- [x] Web page for authorization
- [x] Token generation and validation
- [x] Session management

### CLI Package (To Implement)
- [ ] Install dependencies (axios, commander, chalk, ora, etc.)
- [ ] Create `src/auth/device-flow.ts`
- [ ] Create `src/commands/auth.ts`
- [ ] Create `src/api/client.ts`
- [ ] Update `src/index.ts`
- [ ] Add environment configuration
- [ ] Test authentication flow
- [ ] Handle token refresh
- [ ] Add error handling
- [ ] Test with real API

### User Experience
- [ ] Clear terminal output
- [ ] Progress indicators
- [ ] Error messages
- [ ] Success confirmations
- [ ] Help documentation

---

## 🎯 Next Steps

1. **Implement CLI auth module** following the code examples above
2. **Test locally** with `RECODER_API_URL=http://localhost:3000`
3. **Handle edge cases** (network errors, expired tokens, etc.)
4. **Add to documentation**
5. **Publish CLI package**

---

## 🔒 Security Considerations

✅ **Already Handled**:
- Credentials stored in `~/.recoder/credentials.json` with 600 permissions
- Tokens are long and cryptographically secure
- Access tokens expire (90 days)
- Refresh tokens for seamless re-auth
- Server-side session management
- Token revocation on logout

✅ **Best Practices**:
- Never log tokens to console
- Use HTTPS in production
- Validate tokens on every request
- Handle token expiration gracefully
- Clear local credentials on logout

---

This integration plan gives you everything you need to add authentication to `recoder-code`! The backend is already 100% ready - you just need to implement the CLI client side. 🚀
