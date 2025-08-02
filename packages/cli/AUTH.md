# CLI Authentication System

## Overview

The Recoder CLI now supports multiple authentication methods through a unified authentication system that provides:

- **Cross-platform session synchronization** - Sessions work across CLI, web, extension, and router
- **Device flow authentication** - Secure authentication for headless environments
- **API key authentication** - For programmatic access and automation
- **Enhanced security** - Risk assessment, session management, and token refresh
- **Backward compatibility** - Existing email/password auth still works

## Authentication Methods

### 1. Traditional Email/Password

```bash
recoder auth login
# or
recoder auth login --email user@example.com
```

### 2. Device Flow (Recommended for Headless)

```bash
recoder auth login --device-flow
# or
recoder auth login --headless
```

This method:
- Opens a browser window for authentication
- Generates a user-friendly code to enter
- Works great for servers, CI/CD, and headless environments
- Provides the most secure authentication flow

### 3. API Key Authentication

First, generate an API key (requires web login):

```bash
recoder auth keys --generate --name "My CLI Key" --scopes "basic,generate"
```

Then use it:

```bash
recoder auth login --api-key rcd_abc123_def456...
```

API keys are perfect for:
- Automation and scripts
- CI/CD pipelines
- Long-running processes
- Shared environments

### 4. Token-based Login (Legacy)

```bash
recoder auth login --token <your-token>
```

## Session Management

### View Current Status

```bash
recoder auth status
recoder auth status --sync  # Force sync with backend
```

### Manage Active Sessions

```bash
# List all active sessions across devices
recoder auth sessions

# Revoke a specific session
recoder auth sessions --revoke <device-id>

# Revoke all other sessions (security cleanup)
recoder auth sessions --revoke-all
```

### API Key Management

```bash
# List API keys
recoder auth keys

# Generate new API key
recoder auth keys --generate --name "Production Key" --scopes "basic,generate,deploy"

# Revoke API key
recoder auth keys --revoke <key-id>
```

## Available Scopes

- `basic` - Basic CLI functionality
- `chat` - AI chat interactions
- `generate` - Code generation
- `deploy` - Deployment operations
- `admin` - Administrative functions

## Security Features

### Automatic Token Refresh

The CLI automatically refreshes expired tokens in the background, ensuring seamless operation.

### Risk Assessment

The system automatically assesses login risk based on:
- Geographic location changes
- Unknown devices
- Suspicious user agents
- Failed authentication attempts

### Session Monitoring

All authentication events are logged and monitored for security analysis.

## Environment Variables

- `RECODER_BACKEND_URL` - Override the default backend URL
- `NEXTAUTH_URL` - Web application URL (fallback for backend)

## Migration from Legacy Auth

If you're using the old email/password authentication:

1. Your existing session will continue to work
2. Consider upgrading to device flow: `recoder auth login --device-flow`
3. For automation, generate API keys: `recoder auth keys --generate`

The CLI will show a migration suggestion in the status command.

## Troubleshooting

### Backend Connection Issues

```bash
# Check if backend is available
recoder auth status

# Try device flow if direct login fails
recoder auth login --device-flow
```

### Session Expired

```bash
# Status will show if session expired
recoder auth status

# Re-authenticate
recoder auth login
```

### API Key Issues

```bash
# Verify API key is valid
recoder auth login --api-key <your-key>

# Generate new API key if needed
recoder auth keys --generate
```

## Examples

### Development Workflow

```bash
# Initial setup
recoder auth login --device-flow

# Check status
recoder auth status

# Generate code
recoder generate "React todo app"

# Logout when done
recoder auth logout
```

### CI/CD Pipeline

```bash
# Generate API key (one time, in web interface or CLI)
recoder auth keys --generate --name "CI Pipeline"

# Use in CI
export RECODER_API_KEY="rcd_abc123_def456..."
recoder auth login --api-key $RECODER_API_KEY
recoder generate "deployment scripts"
```

### Security Cleanup

```bash
# List all sessions
recoder auth sessions

# Revoke old/unused sessions
recoder auth sessions --revoke-all

# List and revoke unused API keys
recoder auth keys
recoder auth keys --revoke <old-key-id>
```