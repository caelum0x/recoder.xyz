# Recoder Code CLI - Authentication Commands

This document describes the authentication commands added to the Recoder Code CLI.

## Commands

### `recoder-code auth`

Main authentication command group. Shows available subcommands when run without arguments.

### `recoder-code auth login`

Authenticates with Recoder.xyz. Supports multiple authentication methods:

**Options:**
- `--web` - Use web browser OAuth flow (default)
- `--device` or `--device-flow` - Use device flow for SSH/headless environments
- `--api-key <key>` - Authenticate using an API key
- `--force` or `-f` - Force re-authentication even if already logged in

**Examples:**
```bash
# Default web OAuth
recoder-code auth login

# Device flow for SSH
recoder-code auth login --device

# API key authentication
recoder-code auth login --api-key rcli_xxx

# Force re-authentication
recoder-code auth login --force
```

### `recoder-code auth logout`

Logs out from Recoder.xyz and removes stored credentials.

**Example:**
```bash
recoder-code auth logout
```

### `recoder-code auth status`

Shows current authentication status including user information and quota details.

**Example:**
```bash
recoder-code auth status
```

**Output includes:**
- Authentication status
- User email and name
- Subscription plan
- Quota information (requests remaining, usage percentage)
- OpenRouter API key status (for free tier users)

### `recoder-code auth whoami`

Shows information about the currently authenticated user.

**Example:**
```bash
recoder-code auth whoami
```

**Output includes:**
- User name
- Email
- User ID
- Subscription plan

### `recoder-code auth quota`

Displays detailed quota information including usage statistics and reset date.

**Example:**
```bash
recoder-code auth quota
```

**Output includes:**
- Subscription plan
- Requests used/remaining/limit
- Usage percentage
- Visual progress bar
- Reset date
- Warning if approaching quota limit

### `recoder-code auth set-api-key <api-key>`

Sets the OpenRouter API key (required for free tier users).

**Example:**
```bash
recoder-code auth set-api-key sk-or-v1-xxx
```

**Notes:**
- Only required for free tier users
- API key must start with `sk-or-`
- Get your API key at https://openrouter.ai

## Implementation Details

### Files Created

1. **Command Structure:**
   - `src/commands/auth.ts` - Main auth command module
   - `src/commands/auth/login.ts` - Login subcommand
   - `src/commands/auth/logout.ts` - Logout subcommand
   - `src/commands/auth/status.ts` - Status subcommand
   - `src/commands/auth/whoami.ts` - Whoami subcommand
   - `src/commands/auth/quota.ts` - Quota subcommand
   - `src/commands/auth/set-api-key.ts` - Set API key subcommand

2. **Service Integration:**
   - Uses existing `RecoderAuthService` from `src/services/RecoderAuthService.ts`
   - Integrates with yargs command framework
   - Follows same pattern as MCP commands

3. **Configuration Updates:**
   - Added auth command registration in `src/config/config.ts`
   - Added to command routing logic for proper exit handling

### Authentication Flow

1. **Web OAuth (Default):**
   - Opens browser for authentication
   - Starts local callback server
   - Exchanges authorization code for tokens
   - Stores credentials in `~/.recoder/auth.json`

2. **Device Flow:**
   - Generates device code
   - Shows verification URL and code
   - Polls for authorization
   - Stores tokens when authorized

3. **API Key:**
   - Validates API key with server
   - Stores credentials with long expiry

### Storage

Credentials are stored in `~/.recoder/auth.json` with restricted permissions (0600).

The file contains:
- Access token
- Refresh token
- Token expiration
- User information
- User ID

### Token Refresh

The service automatically refreshes expired tokens when:
- Token is expired
- Token expires within 5 minutes
- API request returns 401 Unauthorized

## Testing

All commands have been built and tested:

```bash
# Test help
node dist/index.js auth --help

# Test login help
node dist/index.js auth login --help

# Test status (when not authenticated)
node dist/index.js auth status
# Output: ❌ Not authenticated

# Test all subcommands
node dist/index.js auth whoami
node dist/index.js auth quota
node dist/index.js auth logout
```

## Phase 4 Implementation Status

✅ **CLI Package** - Authentication commands implemented
- ✅ Add `/auth` command with subcommands
- ✅ Implement device code/token flow  
- ✅ Store and use API key for requests
- ✅ Add login, logout, status, whoami, quota, set-api-key commands
- ✅ Integration with existing RecoderAuthService
- ✅ Yargs command framework integration

## Next Steps

The authentication system is now fully integrated into the CLI. Users can authenticate using any of the three methods and the CLI will use stored credentials for API requests.

For future enhancements:
- Add session management (list/revoke sessions)
- Add API key rotation support
- Add organization features (OAuth PKCE)
- Add provider routing preferences
