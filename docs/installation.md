# Installation Guide

This guide will help you install and set up CodeCraft on your development machine.

## Prerequisites

Before installing CodeCraft, ensure you have the following prerequisites:

### Required
- **Node.js 18+**: [Download from nodejs.org](https://nodejs.org/)
- **npm 8+**: Usually comes with Node.js
- **Git**: [Download from git-scm.com](https://git-scm.com/)

### Optional but Recommended
- **Docker**: For containerized development and deployment
- **VS Code**: For the CodeCraft extension
- **PostgreSQL**: For backend database (if developing locally)
- **Redis**: For caching and session storage

## Installation Methods

### Method 1: npm Global Installation (Recommended)

Install the CodeCraft CLI globally:

```bash
npm install -g @codecraft/cli
```

Verify the installation:

```bash
codecraft --version
cc --version  # Short alias
```

### Method 2: Development Installation

For contributing to CodeCraft or running the latest development version:

```bash
# Clone the repository
git clone https://github.com/codecraft-team/codecraft.git
cd codecraft

# Run the setup script
npm run setup

# Build all packages
npm run build

# Link the CLI globally
npm link packages/cli
```

### Method 3: Docker Installation

Run CodeCraft in a containerized environment:

```bash
# Pull the Docker image
docker pull codecraft/cli:latest

# Run CodeCraft CLI
docker run --rm -v $(pwd):/workspace codecraft/cli codecraft --help

# Or use the provided docker-compose
git clone https://github.com/codecraft-team/codecraft.git
cd codecraft
docker-compose up
```

## Post-Installation Setup

### 1. Authentication

Authenticate with CodeCraft services:

```bash
codecraft auth login
```

Or configure manually:

```bash
codecraft auth config
```

### 2. VS Code Extension

Install the CodeCraft VS Code extension:

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "CodeCraft"
4. Click "Install"

Or install from command line:

```bash
code --install-extension codecraft.codecraft-vscode
```

### 3. Environment Configuration

Create a `.env` file for your local configuration:

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your preferred editor
nano .env  # or code .env
```

Essential environment variables:

```env
# CodeCraft Configuration
CODECRAFT_API_URL=https://api.codecraft.dev
CODECRAFT_DEFAULT_MODEL=gpt-4

# AI Service API Keys (optional)
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Database (for backend development)
DATABASE_URL=postgresql://user:password@localhost:5432/codecraft

# Redis (for caching)
REDIS_URL=redis://localhost:6379
```

## Verification

Verify your installation by running:

```bash
# Check CLI installation
codecraft --version
codecraft auth status

# Check health of all components
codecraft health

# Generate a test project
codecraft project plan "Simple web app with authentication"
```

## Platform-Specific Instructions

### Windows

1. Install Node.js from the official website
2. Open PowerShell as Administrator
3. Enable script execution: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned`
4. Install CodeCraft: `npm install -g @codecraft/cli`

### macOS

```bash
# Install Node.js using Homebrew (recommended)
brew install node

# Install CodeCraft
npm install -g @codecraft/cli

# If you encounter permission issues
sudo npm install -g @codecraft/cli
# Or better, fix npm permissions:
# https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```

### Linux (Ubuntu/Debian)

```bash
# Install Node.js from NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install CodeCraft
npm install -g @codecraft/cli

# If you encounter permission issues, use a Node version manager like nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
npm install -g @codecraft/cli
```

## Development Environment Setup

For a complete development environment:

### 1. Clone and Setup

```bash
git clone https://github.com/codecraft-team/codecraft.git
cd codecraft

# Run the comprehensive setup
npm run setup
```

### 2. Database Setup (PostgreSQL)

```bash
# Create database
createdb codecraft_development

# Run migrations
npm run migrate

# Seed with sample data
npm run db:seed
```

### 3. Redis Setup

```bash
# Install Redis (macOS)
brew install redis
brew services start redis

# Install Redis (Ubuntu)
sudo apt install redis-server
sudo systemctl start redis-server
```

### 4. Start Development Servers

```bash
# Start all services in development mode
npm run dev

# Or start individual services
npm run dev:cli      # CLI development
npm run dev:backend  # Backend API
npm run dev:web      # Web dashboard
```

## Configuration Options

### CLI Configuration

Configure the CLI with your preferences:

```bash
codecraft config set model gpt-4
codecraft config set output-dir ./projects
codecraft config set auto-validate true
codecraft config set log-level info
```

### VS Code Settings

Configure the VS Code extension in your settings.json:

```json
{
  "codecraft.apiUrl": "https://api.codecraft.dev",
  "codecraft.defaultModel": "gpt-4",
  "codecraft.autoValidate": true,
  "codecraft.productionMode": true,
  "codecraft.outputDirectory": "./generated"
}
```

## Troubleshooting

### Common Issues

#### Permission Errors on npm install
```bash
# Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Command not found after installation
```bash
# Check if npm global bin is in PATH
npm config get prefix
echo $PATH

# Add npm global bin to PATH
echo 'export PATH=$(npm config get prefix)/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### VS Code Extension Not Loading
1. Restart VS Code
2. Check extension logs: View → Output → CodeCraft
3. Reinstall extension: Uninstall → Reload → Install

#### API Connection Issues
```bash
# Check network connectivity
codecraft auth status

# Verify API endpoint
ping api.codecraft.dev

# Check firewall/proxy settings
export HTTPS_PROXY=your-proxy-url
```

### Getting Help

If you encounter issues not covered here:

1. Check our [Troubleshooting Guide](./troubleshooting/common-issues.md)
2. Search [GitHub Issues](https://github.com/codecraft-team/codecraft/issues)
3. Ask on [GitHub Discussions](https://github.com/codecraft-team/codecraft/discussions)
4. Join our [Discord community](https://discord.gg/codecraft)

## Next Steps

After successful installation:

1. [Quick Start Guide](./quickstart.md) - Generate your first project
2. [CLI Commands](./cli/README.md) - Learn the CLI commands
3. [VS Code Extension](./vscode/README.md) - Use the VS Code extension
4. [Examples](./examples/README.md) - Explore example projects

---

*Installation successful! Ready to build something amazing? 🚀*