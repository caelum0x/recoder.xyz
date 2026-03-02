# Recoder.xyz Development Guide

This guide covers setting up a local development environment for Recoder.xyz.

## Prerequisites

### Required Software
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (recommended) or npm
- **Docker** >= 20.0.0 with Docker Compose
- **Git**

### Optional
- **cloudflared** - For public tunnel testing
- **Redis** - For session persistence (falls back to memory)

## Project Structure

```
recoder.xyz/
├── app/                      # Next.js marketing site + auth
│   ├── app/                  # Next.js 14 app router
│   │   ├── [locale]/         # i18n pages
│   │   └── api/              # API routes (auth, billing, admin)
│   └── lib/                  # Shared utilities
│
├── docker-backend/           # Container orchestration service
│   ├── src/
│   │   ├── server.ts         # Main Express server
│   │   ├── container-pool.ts # Pre-warmed container management
│   │   ├── dev-server.ts     # Dev server management
│   │   ├── snapshot-manager.ts # Git-based snapshots
│   │   ├── mcp-manager.ts    # MCP server lifecycle
│   │   ├── url-cloner.ts     # Website cloning
│   │   ├── browser-automation.ts # Puppeteer automation
│   │   ├── code-index.ts     # Semantic code search
│   │   └── ...
│   ├── docker/
│   │   └── Dockerfile        # Workspace container image
│   └── .env.example
│
├── recoder-web/              # Remix-based Web IDE
│   ├── app/
│   │   ├── components/       # React components
│   │   ├── lib/              # Shared libraries
│   │   │   ├── .server/      # Server-only code
│   │   │   │   ├── llm/      # AI integration
│   │   │   │   └── mcp/      # MCP tools
│   │   │   ├── stores/       # Zustand stores
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   └── runtime/      # Action runner, message parser
│   │   └── routes/           # Remix routes + API
│   └── starters/             # Project starter templates
│
├── packages/
│   └── recoder-code/         # CLI tool (108K+ lines)
│       └── packages/cli/     # Main CLI package
│
└── docs/                     # Documentation
```

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/recoderxyz/recoder.xyz.git
cd recoder.xyz
```

### 2. Install Dependencies

```bash
# Install root dependencies
pnpm install

# Install all workspace dependencies
pnpm install --recursive
```

### 3. Docker Backend Setup

```bash
cd docker-backend

# Copy environment template
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Port configuration
PORT=3100
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Authentication
APP_API_URL=http://localhost:3000
INTERNAL_SERVICE_KEY=your-secret-key-here  # Generate with: openssl rand -hex 32
REQUIRE_AUTH=false  # Set to true in production

# Container pool
CONTAINER_POOL_MIN_SIZE=3      # For development, reduce to save resources
CONTAINER_POOL_MAX_SIZE=10
CONTAINER_MEMORY_LIMIT=1073741824  # 1GB per container
CONTAINER_CPU_QUOTA=50000      # 50% of 1 CPU

# Optional: Redis for session persistence
# REDIS_URL=redis://localhost:6379
```

### 4. Build the Workspace Docker Image

```bash
cd docker-backend/docker
docker build -t recoder-workspace:latest .
```

This builds the container image with:
- Node.js 20 LTS
- Python 3 with pip
- Rust (cargo)
- Go
- Git
- ripgrep
- Pre-installed CLI tools (claude, recoder-code, codex, gemini, opencode)
- Pre-installed MCP servers (filesystem, memory, fetch)

### 5. Start Docker Backend

```bash
cd docker-backend

# Development mode with hot reload
pnpm dev

# Or production mode
pnpm build && pnpm start
```

The server will:
1. Clean up old containers
2. Initialize the container pool (pre-warm containers)
3. Start listening on port 3100

### 6. Recoder-Web Setup

```bash
cd recoder-web

# Copy environment (if exists)
cp .env.example .env  # or create manually
```

Create/edit `.env`:

```bash
# Docker backend URL
DOCKER_BACKEND_URL=http://localhost:3100

# Main site URL (for auth redirects)
MAIN_SITE_URL=http://localhost:3000

# Database (optional for local dev)
# DATABASE_URL=postgresql://...

# AI Providers (for testing)
OPENROUTER_API_KEY=sk-or-...  # Optional, users bring their own
```

Start the development server:

```bash
pnpm dev
```

The Web IDE will be available at `http://localhost:5173`.

### 7. Main App Setup (Optional)

The marketing site + auth lives in `/app`:

```bash
cd app

# Copy environment
cp .env.example .env
```

Configure `.env`:

```bash
# Database
DATABASE_URL=postgresql://...

# Better Auth
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=http://localhost:3000

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Email (Resend)
RESEND_API_KEY=re_...

# Internal service key (must match docker-backend)
INTERNAL_SERVICE_KEY=same-as-docker-backend
```

Start the app:

```bash
pnpm dev
```

Available at `http://localhost:3000`.

## Development Workflow

### Running All Services

For full-stack development, run these in separate terminals:

```bash
# Terminal 1: Docker backend
cd docker-backend && pnpm dev

# Terminal 2: Web IDE
cd recoder-web && pnpm dev

# Terminal 3: Main app (optional)
cd app && pnpm dev
```

### Testing Changes

#### Docker Backend
```bash
cd docker-backend
pnpm test  # Run tests
pnpm lint  # Lint code
```

#### Recoder-Web
```bash
cd recoder-web
pnpm test
pnpm typecheck  # TypeScript check
pnpm lint
```

#### CLI
```bash
cd packages/recoder-code/packages/cli
pnpm build
pnpm test
```

### Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
cd docker-backend && pnpm build
cd recoder-web && pnpm build
```

## Database Setup

### Using Neon PostgreSQL (Recommended)

1. Create account at https://neon.tech
2. Create a new project
3. Copy connection string to `.env`:
   ```
   DATABASE_URL=<DATABASE_URL>
   ```

### Local PostgreSQL

```bash
# Using Docker
docker run -d \
  --name recoder-postgres \
  -e POSTGRES_USER=recoder \
  -e POSTGRES_PASSWORD=recoder \
  -e POSTGRES_DB=recoder \
  -p 5432:5432 \
  postgres:15
```

### Running Migrations

```bash
cd app
pnpm db:push  # Push schema to database
pnpm db:seed  # Seed initial data (if available)
```

## Container Configuration

### Memory & CPU Limits

Adjust based on your system:

| RAM | CONTAINER_POOL_MIN_SIZE | CONTAINER_POOL_MAX_SIZE | MEMORY_LIMIT |
|-----|------------------------|------------------------|--------------|
| 8GB  | 2 | 5 | 512MB |
| 16GB | 5 | 10 | 1GB |
| 32GB | 10 | 20 | 2GB |
| 64GB | 15 | 30 | 2GB |

### Container Recycling

```bash
CONTAINER_MAX_RECYCLES=10       # Recycle up to 10 times
CONTAINER_MAX_AGE_MS=7200000    # 2 hour max age
CONTAINER_STALE_TIMEOUT_MS=1800000  # 30 min idle timeout
```

## Common Issues & Solutions

### Docker Permission Issues

```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker
```

### Port Already in Use

```bash
# Find and kill process on port 3100
lsof -ti:3100 | xargs kill -9
```

### Container Pool Not Starting

Check Docker is running:
```bash
docker ps
docker info
```

Check image exists:
```bash
docker images | grep recoder-workspace
```

### WebSocket Connection Failed

Ensure CORS origins include your frontend URL:
```bash
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Authentication Issues

For development without auth:
```bash
REQUIRE_AUTH=false
```

For testing auth:
1. Ensure `APP_API_URL` points to running app
2. Ensure `INTERNAL_SERVICE_KEY` matches in both services
3. Check Better Auth is configured in app

## CLI Development

### Building the CLI

```bash
cd packages/recoder-code/packages/cli
pnpm build
```

### Testing CLI Locally

```bash
# Link globally
npm link

# Run commands
recoder-code "hello world"
recoder-code --help
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Register in `src/config/config.ts`
3. Export from index

Example:
```typescript
// src/commands/my-command.ts
import type { CommandModule } from 'yargs';

export const myCommand: CommandModule = {
  command: 'my-command',
  describe: 'Description here',
  handler: async (argv) => {
    console.log('My command executed!');
  },
};

// In config.ts, add to yargs builder:
.command(myCommand)
```

## Environment Variables Reference

### Docker Backend

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3100 | Server port |
| ALLOWED_ORIGINS | - | CORS allowed origins |
| APP_API_URL | https://recoder.xyz | Main app URL |
| INTERNAL_SERVICE_KEY | - | Service-to-service auth |
| REQUIRE_AUTH | false | Require auth on all endpoints |
| ENABLE_CONTAINER_POOL | true | Enable pre-warming |
| CONTAINER_POOL_MIN_SIZE | 10 | Pre-warmed containers |
| CONTAINER_POOL_MAX_SIZE | 25 | Maximum containers |
| CONTAINER_MEMORY_LIMIT | 2147483648 | Memory per container (bytes) |
| CONTAINER_CPU_QUOTA | 100000 | CPU quota per container |
| MAX_CONTAINERS_PER_USER | 5 | Container limit per user |
| REDIS_URL | - | Redis for sessions (optional) |

### Recoder-Web

| Variable | Default | Description |
|----------|---------|-------------|
| DOCKER_BACKEND_URL | http://localhost:3100 | Docker backend URL |
| MAIN_SITE_URL | http://localhost:3000 | Main app URL |
| DATABASE_URL | - | PostgreSQL connection |
| OPENROUTER_API_KEY | - | Default AI key (optional) |
| TAVILY_API_KEY | - | Tavily search (optional) |

### Main App

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | - | PostgreSQL connection |
| BETTER_AUTH_SECRET | - | Auth secret |
| BETTER_AUTH_URL | - | Auth callback URL |
| RESEND_API_KEY | - | Email API key |
| INTERNAL_SERVICE_KEY | - | Service-to-service auth |
| ENCRYPTION_KEY | - | API key encryption |
| GOOGLE_CLIENT_ID/SECRET | - | Google OAuth |
| GITHUB_CLIENT_ID/SECRET | - | GitHub OAuth |

## Debugging

### Docker Backend Logs

```bash
# Follow logs
docker-compose logs -f docker-backend

# Check specific container
docker logs <container_id>
```

### Enable Debug Mode

```bash
DEBUG=* pnpm dev  # All debug logs
DEBUG=recoder:* pnpm dev  # Recoder logs only
```

### VS Code Launch Config

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Docker Backend",
      "program": "${workspaceFolder}/docker-backend/src/server.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "PORT": "3100"
      }
    }
  ]
}
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes and test
4. Commit with conventional commits: `feat: add new feature`
5. Push and create PR

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- No unused imports
- Prefer async/await over callbacks
- Document public APIs with JSDoc
