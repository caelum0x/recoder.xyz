# Recoder.xyz CLI Integration Guide

## Quick Start (For Developers)

This guide shows you how to integrate the Recoder.xyz authentication system into the recoder-code CLI.

## Step 1: Wire Up the Commands

### Option A: Add to main CLI entry point

Edit `packages/cli/src/gemini.tsx` to check for `auth` command:

```typescript
// Add near the top where other imports are
import { handleRecoderAuthCommand } from './commands/recoderAuth.js';

// In the main() function, before starting the interactive UI
export async function main() {
  // ... existing code ...

  // Check if user is running auth command
  const args = process.argv.slice(2);
  if (args[0] === 'auth') {
    await handleRecoderAuthCommand(args.slice(1));
    process.exit(0);
  }

  // ... rest of existing code ...
}
```

### Option B: Add as a yargs command

If you're using yargs for command parsing, add:

```typescript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { handleRecoderAuthCommand } from './commands/recoderAuth.js';

yargs(hideBin(process.argv))
  .command(
    'auth <command>',
    'Authenticate with recoder.xyz',
    (yargs) => {
      return yargs
        .positional('command', {
          describe: 'Auth command to run',
          type: 'string',
          choices: ['login', 'logout', 'status', 'set-api-key', 'quota'],
        })
        .option('web', {
          describe: 'Use web browser for login',
          type: 'boolean',
        })
        .option('device', {
          describe: 'Use device flow for login',
          type: 'boolean',
        })
        .option('api-key', {
          describe: 'API key for authentication',
          type: 'string',
        });
    },
    async (argv) => {
      const args = [argv.command, ...(argv._ as string[])];
      await handleRecoderAuthCommand(args);
    }
  )
  .parse();
```

## Step 2: Add Slash Commands to Interactive Mode

Edit `packages/cli/src/ui/commands/` and add the Recoder commands to your command registry:

```typescript
// In your commands index or registry file
export { 
  recoderLoginCommand,
  recoderLogoutCommand,
  recoderStatusCommand,
  recoderSetApiKeyCommand,
} from './recoderLoginCommand.js';
```

Then register them in your command service:

```typescript
import {
  recoderLoginCommand,
  recoderLogoutCommand,
  recoderStatusCommand,
  recoderSetApiKeyCommand,
} from './commands/recoderLoginCommand.js';

// Register commands
commandService.register(recoderLoginCommand);
commandService.register(recoderLogoutCommand);
commandService.register(recoderStatusCommand);
commandService.register(recoderSetApiKeyCommand);
```

## Step 3: Add Authentication Check on Startup

Add an authentication check when the CLI starts:

```typescript
import { RecoderAuthService } from './services/RecoderAuthService.js';

async function checkAuthentication() {
  const authService = new RecoderAuthService();
  const isAuthenticated = await authService.isAuthenticated();

  if (!isAuthenticated) {
    console.log('');
    console.log('👋 Welcome to Recoder Code!');
    console.log('');
    console.log('To get started, please authenticate:');
    console.log('  recoder auth login');
    console.log('');
    console.log('Or continue without authentication (limited features)');
    console.log('');
    
    // Optional: Wait for user choice
    const answer = await promptUser('Authenticate now? (y/N): ');
    if (answer.toLowerCase() === 'y') {
      await authService.loginWithWeb();
    }
  } else {
    const user = await authService.getUser();
    console.log(`✅ Logged in as ${user?.email}`);
  }
}

// Call on startup
await checkAuthentication();
```

## Step 4: Use Authentication in AI Requests

Modify your AI request logic to use Recoder authentication:

```typescript
import { RecoderAuthService } from './services/RecoderAuthService.js';

async function makeAIRequest(prompt: string) {
  const authService = new RecoderAuthService();

  // Check authentication
  const isAuth = await authService.isAuthenticated();
  if (!isAuth) {
    throw new Error('Not authenticated. Run: recoder auth login');
  }

  // Check quota
  const quotaCheck = await authService.checkQuota();
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.reason);
  }

  // Get user info
  const user = await authService.getUser();
  
  // Determine which API key to use
  let apiKey: string;
  let apiKeySource: 'user' | 'platform';

  if (user?.subscription_plan === 'free') {
    // Free users: get their OpenRouter API key from server
    if (!user.has_own_api_key) {
      throw new Error(
        'Free tier requires your own OpenRouter API key.\n' +
        'Get one at: https://openrouter.ai\n' +
        'Then run: recoder auth set-api-key <your-key>'
      );
    }

    // Get user's API key from server
    const token = await authService.getAccessToken();
    const response = await fetch('https://recoder.xyz/api/user/openrouter', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    apiKey = data.data.api_key;
    apiKeySource = 'user';
  } else {
    // Premium users: server will provide API key
    // Make request through server proxy that uses platform keys
    const token = await authService.getAccessToken();
    return await makeProxiedRequest(prompt, token);
  }

  // Make OpenRouter request with user's key
  const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3-sonnet',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await openrouterResponse.json();

  // Track usage
  const token = await authService.getAccessToken();
  await trackUsage(token, {
    model: result.model,
    tokens: result.usage.total_tokens,
    cost: result.usage.cost || 0,
  });

  return result;
}

async function trackUsage(token: string, usage: any) {
  await fetch('https://recoder.xyz/api/usage/track', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(usage),
  });
}
```

## Step 5: Add AUTH_TYPE Selection

Add `RECODER_AUTH` to your auth type selection:

```typescript
import { AuthType } from '@qwen-code/qwen-code-core';

// In your auth selection UI
const authOptions = [
  { value: AuthType.RECODER_AUTH, label: 'Recoder.xyz (Recommended)' },
  { value: AuthType.USE_OPENAI, label: 'OpenAI API Key' },
  { value: AuthType.USE_GEMINI, label: 'Google Gemini API Key' },
  // ... other options
];
```

## Step 6: Build and Test

```bash
# Build the CLI
cd packages/cli
npm run build

# Test authentication
node dist/index.js auth login

# Test status
node dist/index.js auth status

# Test in interactive mode
node dist/index.js
# Then type: /login
```

## Step 7: Update Package Dependencies

Ensure your `package.json` includes:

```json
{
  "dependencies": {
    "open": "^10.1.2",
    // ... other dependencies
  }
}
```

## Complete Example Integration

Here's a complete example showing how to integrate everything:

```typescript
// packages/cli/src/index.ts
import { RecoderAuthService } from './services/RecoderAuthService.js';
import { handleRecoderAuthCommand } from './commands/recoderAuth.js';

async function main() {
  const args = process.argv.slice(2);

  // Handle auth commands
  if (args[0] === 'auth') {
    await handleRecoderAuthCommand(args.slice(1));
    return;
  }

  // Check authentication on startup
  const authService = new RecoderAuthService();
  const isAuth = await authService.isAuthenticated();

  if (!isAuth) {
    console.log('⚠️  Not authenticated. Run: recoder auth login');
    console.log('Or continue with limited features...');
  } else {
    const user = await authService.getUser();
    console.log(`✅ Logged in as ${user?.email} (${user?.subscription_plan})`);

    // Show quota
    const quota = await authService.getQuota();
    if (quota) {
      const percentUsed = ((quota.requests_limit - quota.requests_remaining) / quota.requests_limit * 100).toFixed(0);
      console.log(`📊 Quota: ${quota.requests_remaining}/${quota.requests_limit} (${percentUsed}% used)`);
    }
  }

  // Start main CLI
  // ... your existing code ...
}

main().catch(console.error);
```

## Testing the Integration

### 1. Test Auth Commands
```bash
recoder auth login --web
recoder auth status
recoder auth logout
```

### 2. Test Free User Flow
```bash
# Login
recoder auth login

# Check status (should prompt for API key)
recoder auth status

# Set API key
recoder auth set-api-key sk-or-v1-xxx

# Try making a request
recoder "generate a hello world"
```

### 3. Test Quota
```bash
# Check quota
recoder auth quota

# Make several requests to use quota
recoder "test 1"
recoder "test 2"

# Check quota again
recoder auth quota
```

## Environment Variables (Optional)

For development/testing:

```bash
# Point to local backend
export RECODER_API_URL=http://localhost:3000

# Enable debug logging
export DEBUG=recoder:*
```

## Deployment Checklist

Before deploying to production:

- [ ] Backend API endpoints are live at recoder.xyz
- [ ] Database is set up with proper tables
- [ ] Payment integration is working (Paddle/DODO)
- [ ] API key encryption is configured
- [ ] Rate limiting is enabled
- [ ] Usage tracking is working
- [ ] Email notifications are set up
- [ ] Monitoring and logging are enabled
- [ ] Error tracking is configured (Sentry, etc.)

## Troubleshooting

### "Cannot find module 'RecoderAuthService'"
```bash
cd packages/cli
npm run build
```

### "Network request failed"
```bash
# Check backend is running
curl https://recoder.xyz/api/health

# Check environment variable
echo $RECODER_API_URL
```

### "Invalid API key format"
```bash
# Ensure key starts with sk-or-
# Get key from: https://openrouter.ai
```

## Next Steps

1. **Complete Backend Integration**: Ensure all API endpoints are implemented
2. **Add Usage Tracking**: Track every AI request
3. **Implement Quotas**: Enforce monthly limits
4. **Set Up Monitoring**: Track authentication success rates
5. **Add Analytics**: Understand user behavior
6. **Create Upgrade Flows**: Make it easy to upgrade from free to pro

## Support

Need help? Check:
- [Authentication Docs](./RECODER_AUTH_README.md)
- [Backend API Docs](../../auth%20docs/CLI_AUTH_GUIDE.md)
- [Architecture Guide](../../auth%20docs/COMPLETE_ARCHITECTURE_GUIDE.md)
