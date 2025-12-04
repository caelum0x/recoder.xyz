# Recoder Docker Backend

Production-ready execution backend replacing WebContainer.

## Features

- 🌍 **Multi-language**: Node.js, Python, Rust, Go, Java, Ruby, PHP, Bun
- 📦 **recoder-code**: Pre-installed globally
- 🔌 **WebSocket**: Real-time terminal & file sync
- 🧹 **Auto-cleanup**: Idle containers removed after 30 min
- 🔒 **Isolated**: Each project gets its own container

## Quick Start

```bash
# 1. Build the base image (one time)
cd docker
docker build -t recoder-universal:latest .

# 2. Install dependencies
cd ..
npm install

# 3. Run the server
npm run dev
```

## API Endpoints

### REST

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/container` | Create container for project |
| DELETE | `/api/container/:projectId` | Stop & remove container |
| POST | `/api/file/:projectId` | Write file |
| GET | `/api/file/:projectId?path=` | Read file |
| GET | `/api/files/:projectId?path=` | List files |
| POST | `/api/exec/:projectId` | Execute command |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/terminal/:projectId` | Interactive terminal |
| `/sync/:projectId` | Real-time file sync |

## Usage in recoder-web

```typescript
import { createDockerClient } from 'recoder-docker-backend/client';

const client = createDockerClient('http://localhost:3100', 'project-123');

// Initialize container
await client.init();

// Write files
await client.writeFile('/src/index.ts', 'console.log("hello")');

// Execute commands
const output = await client.exec('npm install');
console.log(output);

// Connect terminal
const terminal = client.connectTerminal((data) => {
  console.log(data); // Terminal output
});
terminal.write('ls -la\n');

// Real-time file sync
const sync = client.connectSync((event) => {
  console.log(event); // { action: 'written', path: '...' }
});
sync.write('/src/app.ts', 'export const x = 1');

// Cleanup
await client.destroy();
```

## Deployment

### Option 1: Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Option 2: Manual

```bash
# Build base image
docker build -t recoder-universal:latest ./docker

# Build & run server
npm run build
PORT=3100 npm start
```

### Option 3: Railway/Fly.io

```bash
# Railway
railway up

# Fly.io
fly launch
fly deploy
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3100 | Server port |
| ALLOWED_ORIGINS | * | CORS origins |

## Languages Included

| Language | Version | Package Manager |
|----------|---------|-----------------|
| Node.js | 20 | npm, pnpm, yarn |
| Python | 3.11 | pip |
| Rust | latest | cargo |
| Go | 1.21 | go mod |
| Java | 17 | - |
| Ruby | 3.x | gem |
| PHP | 8.x | composer |
| Bun | latest | bun |

## Resource Limits (per container)

- Memory: 1GB
- CPU: 100% of 1 core
- Idle timeout: 30 minutes
