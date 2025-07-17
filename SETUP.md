# CodeCraft Monorepo Setup Complete! 🎉

This document provides an overview of the monorepo structure that has been created and instructions for getting started.

## 📁 Project Structure

```
codecraft/
├── packages/                          # Package workspaces
│   ├── cli/                          # Main CLI tool (@codecraft/cli)
│   │   ├── src/                      # TypeScript source code
│   │   ├── dist/                     # Compiled JavaScript (generated)
│   │   ├── package.json              # Package configuration
│   │   ├── tsconfig.json            # TypeScript configuration
│   │   └── project.json             # Nx project configuration
│   │
│   ├── shared/                       # Shared utilities (@codecraft/shared)
│   │   ├── src/                      # Shared types and utilities
│   │   ├── dist/                     # Compiled output (generated)
│   │   ├── package.json              # Package configuration
│   │   ├── tsconfig.json            # TypeScript configuration
│   │   └── project.json             # Nx project configuration
│   │
│   ├── vscode-extension/             # VS Code extension (@codecraft/vscode-extension)
│   │   ├── src/                      # Extension source code
│   │   ├── dist/                     # Webpack output (generated)
│   │   ├── package.json              # Extension manifest
│   │   └── webpack.config.js         # Webpack configuration
│   │
│   └── web/                          # Web dashboard (@codecraft/web)
│       ├── src/                      # Next.js application
│       ├── .next/                    # Next.js build output (generated)
│       ├── package.json              # Package configuration
│       ├── tsconfig.json            # TypeScript configuration
│       ├── next.config.js           # Next.js configuration
│       └── project.json             # Nx project configuration
│
├── backend/                          # API server
│   ├── src/                          # Backend source code
│   ├── dist/                         # Compiled output (generated)
│   ├── prisma/                       # Database schema and migrations
│   ├── package.json                  # Package configuration
│   ├── tsconfig.json                # TypeScript configuration
│   └── project.json                 # Nx project configuration
│
├── scripts/                          # Build and deployment scripts
│   ├── setup.js                     # Development environment setup
│   ├── build-all.js                 # Build all packages
│   ├── health-check.js              # System health check
│   └── package.json                 # Scripts package configuration
│
├── docs/                             # Documentation
│   ├── README.md                     # Documentation index
│   ├── installation.md              # Installation guide
│   ├── cli/                          # CLI documentation
│   ├── vscode/                       # VS Code extension docs
│   ├── api/                          # API documentation
│   └── examples/                     # Example projects
│
├── nx.json                           # Nx workspace configuration
├── tsconfig.base.json               # Base TypeScript configuration
├── tsconfig.json                    # Root TypeScript configuration
├── package.json                     # Root package with workspaces
├── jest.config.ts                   # Jest testing configuration
├── .eslintrc.json                   # ESLint configuration
├── .prettierrc                      # Prettier configuration
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore patterns
└── README.md                        # Main project README
```

## 🚀 Quick Start

### 1. Initial Setup

```bash
# Navigate to the project directory
cd codecraft

# Run the setup script
node scripts/setup.js

# Or manually install and build
npm install
npm run build
```

### 2. Development

```bash
# Start all development servers
npm run dev

# Or start individual services
npm run dev:cli      # CLI development with watch mode
npm run dev:backend  # Backend API server
npm run dev:web      # Web dashboard
npm run dev:shared   # Shared package with watch mode
```

### 3. Building

```bash
# Build all packages
npm run build

# Build specific packages
npm run build:cli
npm run build:shared
npm run build:backend
npm run build:web
npm run build:extension
```

### 4. Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific package tests
npm run test:cli
npm run test:backend
```

### 5. Linting and Formatting

```bash
# Lint all packages
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run typecheck
```

## 📦 Package Details

### CLI Package (`@codecraft/cli`)

- **Purpose**: Main command-line interface for CodeCraft
- **Technology**: TypeScript, Commander.js
- **Output**: Compiled to `dist/` directory
- **Binary**: `codecraft` and `cc` commands
- **Dependencies**: Shared utilities, external CLI libraries

### Shared Package (`@codecraft/shared`)

- **Purpose**: Common utilities, types, and constants
- **Technology**: TypeScript
- **Output**: Compiled to `dist/` directory
- **Usage**: Imported by other packages as `@codecraft/shared`
- **Contents**: Types, utilities, API clients

### VSCode Extension (`@codecraft/vscode-extension`)

- **Purpose**: Visual Studio Code integration
- **Technology**: TypeScript, Webpack
- **Output**: Bundled to `dist/extension.js`
- **Packaging**: Use `npm run package` to create `.vsix` file
- **Dependencies**: VS Code API, shared utilities

### Web Dashboard (`@codecraft/web`)

- **Purpose**: Web-based project management interface
- **Technology**: Next.js, React, TypeScript
- **Output**: Next.js build in `.next/` directory
- **Features**: Project management, team collaboration
- **Dependencies**: React ecosystem, shared utilities

### Backend API

- **Purpose**: REST API server and business logic
- **Technology**: Node.js, Express, TypeScript, Prisma
- **Output**: Compiled to `dist/` directory
- **Database**: PostgreSQL with Prisma ORM
- **Features**: Authentication, project management, AI integration

## 🔧 Configuration

### Nx Workspace

The monorepo uses Nx for efficient builds and dependency management:

- **Cache**: Build and test results are cached for faster execution
- **Dependencies**: Automatic dependency graph management
- **Parallel Execution**: Tasks run in parallel when possible
- **Code Generation**: Generators for creating new packages

### TypeScript

- **Base Configuration**: `tsconfig.base.json` with shared settings
- **Path Mapping**: Package aliases configured for imports
- **Strict Mode**: Enabled for all packages
- **Declaration Files**: Generated for libraries

### Package Manager

- **Workspaces**: npm workspaces for package management
- **Dependency Hoisting**: Shared dependencies hoisted to root
- **Local References**: Packages reference each other using `workspace:*`

## 🚦 Available Scripts

### Root Level Scripts

```bash
npm run build              # Build all packages
npm run dev               # Start all development servers
npm run test              # Run all tests
npm run lint              # Lint all packages
npm run clean             # Clean all build outputs
npm run setup             # Run setup script
npm run health            # Check system health
```

### Package-Specific Scripts

Each package has its own scripts accessible via:

```bash
# Using npm workspaces
npm run build --workspace=@codecraft/cli
npm run test --workspace=backend

# Or using Nx
npx nx build cli
npx nx test backend
```

## 🔄 Development Workflow

### Adding New Features

1. **Create Feature Branch**: `git checkout -b feature/new-feature`
2. **Make Changes**: Edit code in appropriate package
3. **Add Tests**: Write tests for new functionality
4. **Run Tests**: `npm test`
5. **Lint Code**: `npm run lint:fix`
6. **Build**: `npm run build`
7. **Commit**: Follow conventional commit format
8. **Push and PR**: Create pull request

### Adding New Packages

1. **Create Directory**: `mkdir packages/new-package`
2. **Package Configuration**: Add `package.json` and `project.json`
3. **TypeScript Config**: Add `tsconfig.json` extending base
4. **Update Root**: Add to workspace in root `package.json`
5. **Dependencies**: Add to other packages as needed

### Publishing

```bash
# Build and test
npm run build
npm test

# Version packages
npm run changeset

# Publish
npm run release
```

## 🛠️ Tools and Technologies

### Build System
- **Nx**: Monorepo management and build orchestration
- **TypeScript**: Type-safe JavaScript development
- **Webpack**: Module bundling (VS Code extension)
- **Next.js**: React framework (web dashboard)

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Jest**: Testing framework
- **Husky**: Git hooks
- **Changesets**: Version management

### Runtime Dependencies
- **Commander.js**: CLI framework
- **Express**: Web server framework
- **Prisma**: Database ORM
- **React**: UI library

## 📋 Next Steps

1. **Read Documentation**: Start with `docs/README.md`
2. **Configure Environment**: Copy and edit `.env.example` to `.env`
3. **Run Setup**: Execute `node scripts/setup.js`
4. **Start Development**: Run `npm run dev`
5. **Explore Examples**: Check out `docs/examples/`
6. **Join Community**: Discord, GitHub Discussions

## 🤝 Contributing

See the main [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

## 📞 Support

- **Documentation**: [docs/README.md](./docs/README.md)
- **Issues**: [GitHub Issues](https://github.com/codecraft-team/codecraft/issues)
- **Discussions**: [GitHub Discussions](https://github.com/codecraft-team/codecraft/discussions)
- **Discord**: [CodeCraft Community](https://discord.gg/codecraft)

---

**Welcome to CodeCraft development! Happy coding! 🚀**