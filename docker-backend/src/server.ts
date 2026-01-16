import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { Duplex } from 'stream';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import http from 'http';
import { mountFiles } from './fileMount.js';
import * as pty from 'node-pty';
import { WebSocketRPC } from './websocket-rpc.js';
import { devServerManager } from './dev-server.js';
import { ContainerLifecycleManager } from './container-lifecycle.js';
import { snapshotManager } from './snapshot-manager.js';
import { autoRestoreManager, parseAllErrors, hasBlockingErrors } from './auto-restore.js';
import { languageServerManager } from './language-server.js';
import { searchService } from './search.js';
import { fileWatcher } from './file-watcher.js';
import { sessionStore } from './session-store.js';
import { containerPool } from './container-pool.js';

dotenv.config();

// Initialize Redis connection (non-blocking)
sessionStore.connect().catch(() => {
  console.log('[Server] Redis not available, using memory fallback for sessions');
});

// Initialize container pool (non-blocking) - pre-warms containers for faster project creation
const ENABLE_CONTAINER_POOL = process.env.ENABLE_CONTAINER_POOL !== 'false';

const docker = new Docker();

// App API URL for fetching user tokens
const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

// Fetch user's Claude Code OAuth token from app API
async function fetchClaudeCodeToken(userId: string): Promise<string | null> {
  if (!userId || !INTERNAL_SERVICE_KEY) {
    console.log(`[Claude Code] Missing userId or serviceKey - userId: ${!!userId}, key: ${!!INTERNAL_SERVICE_KEY}`);
    return null;
  }

  try {
    console.log(`[Claude Code] Fetching token for user ${userId} from ${APP_API_URL}`);
    const response = await fetch(`${APP_API_URL}/api/user/claude-code`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
    });

    if (!response.ok) {
      console.log(`[Claude Code] Failed to fetch token for user ${userId}: ${response.status}`);
      return null;
    }

    const data = await response.json() as { hasToken: boolean; token?: string };
    if (data.hasToken && data.token) {
      console.log(`[Claude Code] Token retrieved for user ${userId}`);
      return data.token;
    }

    console.log(`[Claude Code] No token found for user ${userId}`);
    return null;
  } catch (error: any) {
    console.error(`[Claude Code] Error fetching token: ${error.message}`);
    return null;
  }
}
const { app } = expressWs(express());

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const containerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 container creates per minute
  message: { error: 'Container creation rate limited' },
});

// CORS headers - no restrictive COEP/COOP that block cross-origin
app.use(cors({ 
  origin: ['https://recoder.xyz', 'https://www.recoder.xyz', 'https://web.recoder.xyz', 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true 
}));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use('/api/', apiLimiter);

// Container registry: projectId -> containerId + port + ptyPort
// Added backgroundDev flag so we can auto-tail dev server logs into the PTY when users attach
const containers = new Map<string, { id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean }>();

// Track containers being created to prevent race conditions
const creatingContainers = new Map<string, Promise<{ containerId: string; port: number; ptyPort: number }>>();

const IMAGE_NAME = 'recoder-workspace:latest';
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min
const MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB (1GB caused OOM with bun install + vite)
const CPU_QUOTA = 100000; // 100% of 1 CPU

// Track allocated ports to prevent race conditions
const allocatedPorts = new Set<number>();

// Port allocation - find free port by checking Docker + our tracking
async function allocatePort(): Promise<{ preview: number; pty: number }> {
  const dockerContainers = await docker.listContainers({ all: true });
  const usedPorts = new Set<number>(allocatedPorts);
  
  for (const c of dockerContainers) {
    for (const p of c.Ports || []) {
      if (p.PublicPort) {
        usedPorts.add(p.PublicPort);
        usedPorts.add(p.PublicPort + 1);
        usedPorts.add(p.PublicPort + 2);
        usedPorts.add(p.PublicPort + 3);
      }
    }
  }
  
  // Also add ports from our container registry
  for (const entry of containers.values()) {
    usedPorts.add(entry.port);
    usedPorts.add(entry.port + 1);
    usedPorts.add(entry.port + 2);
    usedPorts.add(entry.ptyPort);
  }
  
  // Find first free port in range 10000-20000
  for (let port = 10000; port < 20000; port += 4) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1) && !usedPorts.has(port + 2) && !usedPorts.has(port + 3)) {
      allocatedPorts.add(port);
      allocatedPorts.add(port + 1);
      allocatedPorts.add(port + 2);
      allocatedPorts.add(port + 3);
      return { preview: port, pty: port + 3 };
    }
  }
  throw new Error('No free ports available');
}

// Release ports when container is removed
function releasePorts(port: number, ptyPort: number) {
  allocatedPorts.delete(port);
  allocatedPorts.delete(port + 1);
  allocatedPorts.delete(port + 2);
  allocatedPorts.delete(ptyPort);
}

// Initialize container pool with shared port management
// NOTE: Actual initialization happens in startupSequence() below to avoid race with cleanup

/**
 * Execute a command inside a container and return stdout
 */
async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const chunks: Buffer[] = [];
  
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks);
      let result = '';
      let i = 0;
      while (i < raw.length) {
        if (i + 8 <= raw.length) {
          const size = raw.readUInt32BE(i + 4);
          if (i + 8 + size <= raw.length) {
            result += raw.slice(i + 8, i + 8 + size).toString();
            i += 8 + size;
            continue;
          }
        }
        result += raw.slice(i).toString();
        break;
      }
      resolve(result.trim());
    });
    stream.on('error', reject);
  });
}

/**
 * Ensure a container is running (auto-restart if stopped)
 * Returns true if container is running, false if it needs to be recreated
 */
async function ensureContainerRunning(
  entry: { id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean },
  projectId: string
): Promise<{ running: boolean; restarted: boolean; error?: string }> {
  try {
    const container = docker.getContainer(entry.id);
    const info = await container.inspect();

    if (info.State.Running) {
      // Container is already running
      return { running: true, restarted: false };
    }

    if (info.State.Status === 'exited' || info.State.Status === 'stopped') {
      // Container is stopped, try to restart it
      console.log(`🔄 [Container] Restarting stopped container for ${projectId}: ${entry.id.slice(0, 12)}`);
      await container.start();
      console.log(`✅ [Container] Successfully restarted container for ${projectId}`);
      return { running: true, restarted: true };
    }

    if (info.State.Status === 'paused') {
      // Container is paused, unpause it
      console.log(`▶️ [Container] Unpausing container for ${projectId}: ${entry.id.slice(0, 12)}`);
      await container.unpause();
      return { running: true, restarted: true };
    }

    // Container is in some other state (created, dead, etc.)
    console.log(`⚠️ [Container] Container ${entry.id.slice(0, 12)} is in state: ${info.State.Status}`);
    return { running: false, restarted: false, error: `Container in unexpected state: ${info.State.Status}` };
  } catch (error: any) {
    // Container doesn't exist or other error
    console.error(`❌ [Container] Error checking container ${entry.id.slice(0, 12)}:`, error.message);

    // If container not found, remove from registry so it can be recreated
    if (error.statusCode === 404) {
      console.log(`🗑️ [Container] Removing stale container entry for ${projectId}`);
      containers.delete(projectId);
      releasePorts(entry.port, entry.ptyPort);
    }

    return { running: false, restarted: false, error: error.message };
  }
}

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', containers: containers.size });
});

// Pool stats endpoint
app.get('/api/pool/stats', (_, res) => {
  if (!ENABLE_CONTAINER_POOL) {
    return res.json({ enabled: false });
  }
  const stats = containerPool.getStats();
  res.json({ enabled: true, ...stats });
});

// Create or get container for project
app.post('/api/container', containerLimiter, async (req, res) => {
  try {
    const { projectId, userId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Fetch user's Claude Code token if userId provided
    const claudeCodeToken = userId ? await fetchClaudeCodeToken(userId) : null;

    // Return existing container (after ensuring it's running)
    const existing = containers.get(projectId);
    if (existing) {
      existing.lastActive = Date.now();

      // Check if container is actually running, restart if needed
      const containerStatus = await ensureContainerRunning(existing, projectId);

      if (containerStatus.running) {
        if (containerStatus.restarted) {
          console.log(`🔄 Restarted and reusing container: ${existing.id.slice(0, 12)} for ${projectId}`);
        } else {
          console.log(`♻️ Reusing existing container: ${existing.id.slice(0, 12)} for ${projectId}`);
        }
        return res.json({ containerId: existing.id, reused: true, port: existing.port, ptyPort: existing.ptyPort });
      }

      // Container couldn't be restarted, will be recreated below
      console.log(`⚠️ Container ${existing.id.slice(0, 12)} couldn't be restarted, creating new one`);
    }

    // 🔒 RACE CONDITION FIX: Check if container is already being created
    const inProgress = creatingContainers.get(projectId);
    if (inProgress) {
      console.log(`⏳ Waiting for in-progress container creation: ${projectId}`);
      try {
        const result = await inProgress;
        console.log(`✅ Joined completed container creation: ${result.containerId.slice(0, 12)} for ${projectId}`);
        return res.json({ containerId: result.containerId, reused: true, port: result.port, ptyPort: result.ptyPort });
      } catch (err: any) {
        // Creation failed, let this request retry
        console.error(`❌ In-progress container creation failed: ${err.message}`);
        return res.status(500).json({ error: err.message });
      }
    }

    // Create the container creation promise and store it
    const creationPromise = (async () => {
      let hostPort: number | undefined;
      let ptyPort: number | undefined;
      let containerId: string | undefined;
      let fromPool = false;

      try {
        // 🚀 TRY POOL FIRST - instant container acquisition
        if (ENABLE_CONTAINER_POOL) {
          const pooled = await containerPool.acquire();
          if (pooled) {
            console.log(`🚀 [Pool] Acquired pre-warmed container ${pooled.id.slice(0, 12)} for ${projectId}`);
            containerId = pooled.id;
            hostPort = pooled.port;
            ptyPort = pooled.ptyPort;
            fromPool = true;

            // Inject project-specific env vars into pooled container
            const containerInstance = docker.getContainer(containerId);
            const exec = await containerInstance.exec({
              Cmd: ['sh', '-c', `export RECODER_PROJECT_ID=${projectId}`],
              AttachStdout: false,
              AttachStderr: false,
            });
            await exec.start({ Detach: true });

            // Inject Claude Code token if available
            if (claudeCodeToken) {
              const tokenExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `export CLAUDE_CODE_OAUTH_TOKEN=${claudeCodeToken}`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await tokenExec.start({ Detach: true });
              console.log(`[Claude Code] Injecting OAuth token into pooled container for project ${projectId}`);
            }
          }
        }

        // FALLBACK: Create new container if pool empty
        if (!containerId) {
          // Allocate host ports for preview and PTY
          const ports = await allocatePort();
          hostPort = ports.preview;
          ptyPort = ports.pty;

          // Build environment variables for container
          const containerEnv = [
            'PTY_PORT=9999',
            'RECODER_CONTAINER=true',
            `RECODER_PROJECT_ID=${projectId}`,
            `DOCKER_BACKEND_URL=https://docker.recoder.xyz`,
          ];

          // Inject Claude Code OAuth token if user has one configured
          if (claudeCodeToken) {
            containerEnv.push(`CLAUDE_CODE_OAUTH_TOKEN=${claudeCodeToken}`);
            console.log(`[Claude Code] Injecting OAuth token into container for project ${projectId}`);
          }

          // Create new container with security sandbox and port mapping
          const container = await docker.createContainer({
            Image: IMAGE_NAME,
            Tty: true,
            OpenStdin: true,
            WorkingDir: '/workspace',
            Env: containerEnv,
            ExposedPorts: { '3000/tcp': {}, '5173/tcp': {}, '8080/tcp': {}, '9999/tcp': {} },
            HostConfig: {
              Memory: MEMORY_LIMIT,
              CpuPeriod: 100000,
              CpuQuota: CPU_QUOTA,
              NetworkMode: 'bridge',
              PortBindings: {
                '3000/tcp': [{ HostPort: String(hostPort) }],
                '5173/tcp': [{ HostPort: String(hostPort + 1) }],
                '8080/tcp': [{ HostPort: String(hostPort + 2) }],
                '9999/tcp': [{ HostPort: String(ptyPort) }],
              },
              // Named volume for node_modules persistence
              Binds: [
                `recoder-${projectId}-node_modules:/workspace/node_modules`,
                `recoder-pnpm-store:/pnpm-store`,
              ],
            },
          });

          const containerInstance = await container;
          await containerInstance.start();
          containerId = containerInstance.id;
        }

        // Register container
        containers.set(projectId, { id: containerId, lastActive: Date.now(), port: hostPort!, ptyPort: ptyPort!, backgroundDev: false });

        console.log(`✅ Container ${fromPool ? '(from pool)' : 'created'}: ${containerId.slice(0, 12)} for ${projectId} (preview: ${hostPort}, pty: ${ptyPort})`);
        return { containerId, port: hostPort!, ptyPort: ptyPort!, fromPool };
      } catch (err) {
        // Cleanup allocated ports on failure (only if not from pool)
        if (!fromPool && hostPort !== undefined && ptyPort !== undefined) {
          releasePorts(hostPort, ptyPort);
        }
        throw err;
      } finally {
        // Remove from in-progress map
        creatingContainers.delete(projectId);
      }
    })();

    // Store the creation promise
    creatingContainers.set(projectId, creationPromise);

    // Wait for creation to complete and return result
    const result = await creationPromise;
    res.json({ 
      containerId: result.containerId, 
      reused: false, 
      fromPool: result.fromPool,
      port: result.port, 
      ptyPort: result.ptyPort 
    });
  } catch (err: any) {
    console.error('❌ Container create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop container
app.delete('/api/container/:projectId', async (req, res) => {
  try {
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const container = docker.getContainer(entry.id);
    await container.stop().catch(() => {});
    await container.remove().catch(() => {});
    releasePorts(entry.port, entry.ptyPort);
    containers.delete(req.params.projectId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mount local files/folders into container
app.post('/api/mount/:projectId', async (req, res) => {
  try {
    const { files } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    if (!files?.length) return res.status(400).json({ error: 'files array required' });

    entry.lastActive = Date.now();
    const mounted = await mountFiles(entry.id, files);
    res.json({ mounted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Write file to container
app.post('/api/file/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  console.log('📝 File write request:', projectId, req.body?.path);
  try {
    const { path, content } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running before file operations
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Create directory if needed
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      await execCommand(container, `mkdir -p "${dir}"`);
    }

    // Write file using base64 to handle special chars
    const b64 = Buffer.from(content).toString('base64');
    await execCommand(container, `echo "${b64}" | base64 -d > "${path}"`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch write multiple files at once (much faster than individual writes)
app.post('/api/files/:projectId/batch', async (req, res) => {
  const projectId = req.params.projectId;
  try {
    const { files } = req.body; // Array of { path, content }
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running before file operations
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Create a tar archive with all files and extract in one command
    const tarData: string[] = [];
    const dirs = new Set<string>();
    
    for (const file of files) {
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      if (dir) dirs.add(dir);
    }
    
    // Create all directories first in one command
    if (dirs.size > 0) {
      await execCommand(container, `mkdir -p ${Array.from(dirs).map(d => `"${d}"`).join(' ')}`);
    }
    
    // Write files in parallel batches of 10
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(async (file: { path: string; content: string }) => {
        const b64 = Buffer.from(file.content).toString('base64');
        await execCommand(container, `echo "${b64}" | base64 -d > "${file.path}"`);
      }));
    }

    res.json({ success: true, count: files.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Read file from container
app.get('/api/file/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  try {
    const { path } = req.query;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    const content = await execCommand(container, `cat "${path}"`);

    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file or folder
app.delete('/api/file/:projectId', async (req, res) => {
  try {
    const { path } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    
    // Create snapshot before delete
    await snapshotManager.createSnapshot(entry.id, req.params.projectId, `Before delete: ${path}`, 'auto');
    
    // Delete file or folder
    await execCommand(container, `rm -rf "${path}"`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename/move file or folder
app.put('/api/file/:projectId/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    
    // Create snapshot before rename
    await snapshotManager.createSnapshot(entry.id, req.params.projectId, `Before rename: ${oldPath}`, 'auto');
    
    // Create parent directory if needed
    const dir = newPath.substring(0, newPath.lastIndexOf('/'));
    if (dir) {
      await execCommand(container, `mkdir -p "${dir}"`);
    }
    
    // Move/rename
    await execCommand(container, `mv "${oldPath}" "${newPath}"`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create folder
app.post('/api/folder/:projectId', async (req, res) => {
  try {
    const { path } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    
    await execCommand(container, `mkdir -p "${path}"`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List files in container
app.get('/api/files/:projectId', async (req, res) => {
  try {
    const { path = '/workspace' } = req.query;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    const output = await execCommand(container, `find "${path}" -maxdepth 2 -type f -o -type d 2>/dev/null | head -200`);

    res.json({ files: output.split('\n').filter(Boolean) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Execute command in container
app.post('/api/exec/:projectId', async (req, res) => {
  try {
    let { command, cwd = '/workspace', background = false } = req.body;
    const projectId = req.params.projectId;

    // Sanitize cwd - ensure it's a valid absolute path
    if (!cwd || typeof cwd !== 'string') cwd = '/workspace';
    cwd = cwd.trim();
    if (!cwd.startsWith('/')) cwd = `/workspace/${cwd}`;
    // Remove duplicate /workspace if present
    cwd = cwd.replace(/\/workspace\/workspace/, '/workspace');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running before exec
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({
        error: 'Container not running',
        message: containerStatus.error || 'Container could not be started',
        canRetry: true
      });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // For background commands (like dev servers), start and return immediately
    if (background) {
      // Kill any existing dev server first (exit code 143 is expected and OK)
      await execCommand(container, `pkill -f "npm run dev|vite|next dev" || true`, true).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Use nohup to keep process running in background
      // Ensure cwd exists before cd
      await execCommand(container, `mkdir -p "${cwd}"`);

      // Start the dev server using setsid for proper daemonization
      // NOTE: No & at the end! Docker exec Detach: true handles backgrounding
      // BROWSER=none prevents Vite from trying to open xdg-open (which doesn't exist in Docker)
      const startScript = `cd "${cwd}" && BROWSER=none exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`;

      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', startScript],
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
      });

      await exec.start({ Detach: true });
      console.log('📝 Dev server started in background');

      // Wait a moment for process to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if npm/vite process is actually running
      try {
        const psCheck = await execCommand(container, `ps aux | grep -E "npm|vite|node" | grep -v grep || echo "No dev server process"`);
        console.log('🔍 Process check after 3s:', psCheck);

        if (psCheck.includes('No dev server process')) {
          console.error('❌ Dev server process not found!');
          // Read the logs to see what went wrong
          const errorLogs = await execCommand(container, `cat /tmp/dev.log 2>&1 || echo "No logs"`);
          console.error('💥 Dev server logs:', errorLogs);
        } else {
          console.log('✅ Dev server process is running');
        }
      } catch (e) {
        console.error('Could not check process status:', e);
      }

      console.log('📝 Dev server process started, performing health check...');

      // 🔧 FIX: Wait for dev server to actually respond (up to 30 seconds)
      const portsToCheck = [entry.port + 1, entry.port, entry.port + 2]; // Vite (5173), Next.js (3000), Other (8080)
      const healthCheck = await waitForDevServer(portsToCheck, 30000);

      if (healthCheck.ready) {
        console.log(`✅ Dev server verified on port ${healthCheck.port}`);
        // mark that this project has a background dev server (so terminal can auto-tail)
        const currentEntry = containers.get(req.params.projectId);
        if (currentEntry) currentEntry.backgroundDev = true;
        return res.json({
          output: 'Started in background',
          background: true,
          ready: true,
          port: healthCheck.port
        });
      } else {
        console.warn('⚠️ Dev server started but not responding yet. May need more time to build.');

        // Check process status even if HTTP not ready
        const psOutput = await execCommand(container, `ps aux | grep -E "vite|next|node" | grep -v grep || echo "No processes found"`).catch(() => 'Error checking processes');
        console.log(`📊 Dev server processes:\n${psOutput}`);

        // mark that a background dev server was started (logs will be in /tmp/dev.log)
        const currentEntry = containers.get(req.params.projectId);
        if (currentEntry) currentEntry.backgroundDev = true;

         return res.json({
           output: 'Started in background (building...)',
           background: true,
           ready: false,
           processes: psOutput
         });
       }
     }

    const output = await execCommand(container, `cd "${cwd}" && ${command}`);
    res.json({ output });
  } catch (err: any) {
    console.error('❌ Command execution failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Read dev server logs
app.get('/api/logs/:projectId', async (req, res) => {
  try {
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const tail = parseInt(req.query.tail as string) || 100;
    const logs = await devServerManager.getLogs(entry.id, req.params.projectId, tail);

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get parsed build errors for frontend
app.get('/api/errors/:projectId', async (req, res) => {
  try {
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    // Get recent logs
    const tail = parseInt(req.query.tail as string) || 200;
    const logs = await devServerManager.getLogs(entry.id, req.params.projectId, tail);

    // Parse errors from logs
    const errors = parseAllErrors(logs);
    const blocking = hasBlockingErrors(logs);

    // Get dev server status
    const devStatus = devServerManager.getStatus(req.params.projectId);

    // Auto-restore on blocking errors (if enabled)
    let autoRestoreResult = null;
    if (blocking && req.query.autoRestore !== 'false') {
      const { hasError } = autoRestoreManager.detectErrors(logs);
      if (hasError && autoRestoreManager.shouldRestore(req.params.projectId)) {
        console.log(`[AutoRestore] Blocking errors detected for ${req.params.projectId}, attempting restore...`);
        autoRestoreResult = await autoRestoreManager.attemptRestore(entry.id, req.params.projectId);
        if (autoRestoreResult.success) {
          console.log(`[AutoRestore] Successfully restored to ${autoRestoreResult.restoredTo}`);
        }
      }
    } else if (!blocking && errors.length === 0) {
      // Reset error count when build succeeds
      autoRestoreManager.resetErrors(req.params.projectId);
    }

    res.json({
      errors,
      hasBlockingErrors: blocking,
      devServerStatus: devStatus?.status === 'running' ? 'running' : (blocking ? 'crashed' : 'idle'),
      errorCount: errors.length,
      lastLogTimestamp: Date.now(),
      autoRestore: autoRestoreResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manually trigger auto-restore
app.post('/api/auto-restore/:projectId', async (req, res) => {
  try {
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    // Force restore (bypass cooldown check)
    const { force = false, snapshotId } = req.body;

    if (snapshotId) {
      // Restore to specific snapshot
      const snapshot = await snapshotManager.restoreSnapshot(entry.id, req.params.projectId, snapshotId);
      res.json({ success: true, restoredTo: snapshotId, snapshot });
    } else {
      // Auto-restore to last working snapshot
      const result = await autoRestoreManager.attemptRestore(entry.id, req.params.projectId);
      res.json(result);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start dev server in background
app.post('/api/dev-server/start', async (req, res) => {
  try {
    const { projectId, framework = 'vite' } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const ports = [entry.port + 1, entry.port, entry.port + 2]; // Vite, Next.js, Other
    
    const result = await devServerManager.start(entry.id, projectId, framework, ports);
    entry.backgroundDev = true;
    
    res.json(result);
  } catch (err: any) {
    console.error('❌ Dev server start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop dev server
app.post('/api/dev-server/stop', async (req, res) => {
  try {
    const { projectId } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const success = await devServerManager.stop(entry.id, projectId);
    entry.backgroundDev = false;
    
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restart dev server
app.post('/api/dev-server/restart', async (req, res) => {
  try {
    const { projectId } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const ports = [entry.port + 1, entry.port, entry.port + 2];
    
    const result = await devServerManager.restart(entry.id, projectId, ports);
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get dev server status
app.get('/api/dev-server/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const status = devServerManager.getStatus(projectId);
    const isRunning = devServerManager.isRunning(projectId);
    
    res.json({ status, isRunning, backgroundDev: entry.backgroundDev });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configure auto-restore
app.post('/api/auto-restore/config', async (req, res) => {
  try {
    const { enabled, maxRetries, cooldownMs } = req.body;
    autoRestoreManager.configure({ enabled, maxRetries, cooldownMs });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Snapshot API - Git-based project state management
// ============================================================

// Create a snapshot (save current state)
app.post('/api/snapshot/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message = 'Manual snapshot', author = 'user' } = req.body;
    
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const snapshot = await snapshotManager.createSnapshot(entry.id, projectId, message, author);
    
    res.json(snapshot);
  } catch (err: any) {
    console.error('❌ Snapshot create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all snapshots
app.get('/api/snapshots/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const snapshots = await snapshotManager.listSnapshots(entry.id, limit);
    
    res.json({ snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get current snapshot (HEAD)
app.get('/api/snapshot/:projectId/current', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const snapshot = await snapshotManager.getCurrentSnapshot(entry.id);
    
    res.json({ snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restore to a specific snapshot
app.post('/api/snapshot/:projectId/restore', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { snapshotId } = req.body;
    
    if (!snapshotId) {
      return res.status(400).json({ error: 'snapshotId required' });
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    await snapshotManager.restoreSnapshot(entry.id, projectId, snapshotId);
    
    res.json({ success: true, restoredTo: snapshotId });
  } catch (err: any) {
    console.error('❌ Snapshot restore error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get diff between snapshots
app.get('/api/snapshot/:projectId/diff', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { from, to = 'HEAD' } = req.query;
    
    if (!from) {
      return res.status(400).json({ error: 'from snapshot required' });
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const diff = await snapshotManager.getDiff(entry.id, from as string, to as string);
    
    res.json(diff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get file diff between snapshots
app.get('/api/snapshot/:projectId/file-diff', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path, from, to = 'HEAD' } = req.query;
    
    if (!path || !from) {
      return res.status(400).json({ error: 'path and from snapshot required' });
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const diff = await snapshotManager.getFileDiff(
      entry.id, 
      path as string, 
      from as string, 
      to as string
    );
    
    res.json({ diff });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get file content at a specific snapshot
app.get('/api/snapshot/:projectId/file', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path, snapshotId } = req.query;
    
    if (!path || !snapshotId) {
      return res.status(400).json({ error: 'path and snapshotId required' });
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const content = await snapshotManager.getFileAtSnapshot(
      entry.id,
      path as string,
      snapshotId as string
    );
    
    if (content === null) {
      return res.status(404).json({ error: 'File not found at snapshot' });
    }

    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check for unsaved changes
app.get('/api/snapshot/:projectId/status', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const hasChanges = await snapshotManager.hasUnsavedChanges(entry.id);
    const current = await snapshotManager.getCurrentSnapshot(entry.id);
    
    res.json({ hasChanges, current });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Enable/disable auto-save
app.post('/api/snapshot/:projectId/auto-save', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { enabled, intervalMs = 5 * 60 * 1000 } = req.body;
    
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    if (enabled) {
      snapshotManager.startAutoSave(entry.id, projectId, intervalMs);
    } else {
      snapshotManager.stopAutoSave(projectId);
    }
    
    res.json({ success: true, autoSaveEnabled: enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compress snapshots (git gc)
app.post('/api/snapshot/:projectId/compress', async (req, res) => {
  try {
    const { projectId } = req.params;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const result = await snapshotManager.compress(entry.id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prune old snapshots
app.post('/api/snapshot/:projectId/prune', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { keepCount = 50 } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const pruned = await snapshotManager.pruneOldSnapshots(entry.id, keepCount);
    res.json({ success: true, prunedCount: pruned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get snapshot stats
app.get('/api/snapshot/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const stats = await snapshotManager.getStats(entry.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Keep-alive / reset timer endpoint
app.post('/api/keep-alive/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    lifecycleManager.resetTimer(projectId);
    
    const timeRemaining = lifecycleManager.getIdleTimeRemaining(projectId);
    res.json({ success: true, timeRemaining });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Wait for PTY server to be ready (with retries)
async function waitForPtyServer(port: number, maxRetries = 10, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to establish a test connection
      const testWs = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        testWs.on('open', () => {
          testWs.close();
          resolve(true);
        });
        testWs.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 1000);
      });
      return true; // PTY server is ready
    } catch {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
}

// Helper: Wait for dev server to be ready (HTTP health check)
async function waitForDevServer(ports: number[], maxWaitMs = 60000): Promise<{ ready: boolean; port?: number }> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every 1 second

  console.log(`🔍 Waiting for dev server on ports: ${ports.join(', ')}`);

  while (Date.now() - startTime < maxWaitMs) {
    // Check all ports in parallel
    for (const port of ports) {
      try {
        const isReady = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
            // Any response (even 404) means server is up
            resolve(res.statusCode !== undefined && res.statusCode < 500);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (isReady) {
          console.log(`✅ Dev server responding on port ${port}`);
          return { ready: true, port };
        }
      } catch {
        // Continue checking
      }
    }

    // Log progress every 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 5000 < checkInterval) {
      console.log(`⏳ Still waiting for dev server... (${Math.round(elapsed / 1000)}s elapsed)`);
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  console.log(`⏱️ Dev server health check timeout after ${maxWaitMs}ms`);
  return { ready: false };
}

// Terminal WebSocket - Proxy to container's PTY server
// Each terminal gets its own independent session with RPC support
const terminalSessions = new Map<string, { pty: pty.IPty; projectId: string; rpc: WebSocketRPC }>();

// Initialize Container Lifecycle Manager
const lifecycleManager = new ContainerLifecycleManager(containers);
lifecycleManager.setCleanupHandler(async (projectId, containerId) => {
  try {
    const container = docker.getContainer(containerId);
    await container.stop().catch(() => {});
    await container.remove().catch(() => {});
    const entry = containers.get(projectId);
    if (entry) {
      releasePorts(entry.port, entry.ptyPort);
      containers.delete(projectId);
    }
    console.log(`[Lifecycle] Cleaned up container for ${projectId}`);
  } catch (error: any) {
    console.error(`[Lifecycle] Cleanup error: ${error.message}`);
  }
});

app.ws('/terminal/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const terminalId = req.query.terminalId as string || `term-${Date.now()}`;

  let entry = containers.get(projectId);
  
  // Try to recover container from Docker if not in memory (after backend restart)
  if (!entry) {
    console.log(`⚠️ [Terminal] Container not in memory for ${projectId}, attempting recovery...`);
    try {
      const allContainers = await docker.listContainers({ all: false });
      for (const containerInfo of allContainers) {
        const volumes = Object.keys(containerInfo.Mounts?.reduce((acc: any, m: any) => {
          if (m.Name) acc[m.Name] = true;
          return acc;
        }, {}) || {});
        
        if (volumes.some(v => v.includes(`recoder-${projectId}`))) {
          const ports = containerInfo.Ports || [];
          let basePort = 0;
          let ptyPort = 0;
          
          for (const p of ports) {
            if (p.PrivatePort === 3000 && p.PublicPort) basePort = p.PublicPort;
            if (p.PrivatePort === 5173 && p.PublicPort && !basePort) basePort = p.PublicPort - 1;
            if (p.PrivatePort === 9999 && p.PublicPort) ptyPort = p.PublicPort;
          }
          
          if (basePort > 0) {
            entry = {
              id: containerInfo.Id,
              lastActive: Date.now(),
              port: basePort,
              ptyPort: ptyPort || basePort + 3,
              backgroundDev: false
            };
            containers.set(projectId, entry);
            console.log(`🔄 [Terminal] Recovered container for ${projectId}: ${containerInfo.Id.slice(0, 12)}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(`❌ [Terminal] Recovery failed for ${projectId}:`, err);
    }
  }
  
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  entry.lastActive = Date.now();
  lifecycleManager.resetTimer(projectId);

  // Initialize WebSocket RPC for this connection
  const rpc = new WebSocketRPC(ws as any);

  // Check if this terminal session already exists
  let session = terminalSessions.get(terminalId);
  
  if (!session) {
    // Create new independent PTY session via docker exec
    const container = docker.getContainer(entry.id);
    
    // Create exec instance for interactive shell
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true }) as Duplex;
    
    console.log(`✅ Terminal session created: ${terminalId} for ${projectId}`);

    // Send initial prompt setup
    stream.write('cd /workspace && clear\n');

    // Handle data from container to client
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    stream.on('error', (err: Error) => {
      console.error(`Terminal ${terminalId} error:`, err.message);
    });

    stream.on('end', () => {
      console.log(`Terminal ${terminalId} stream ended`);
      terminalSessions.delete(terminalId);
      if (ws.readyState === ws.OPEN) {
        ws.close(1000);
      }
    });

    // Save terminal session to Redis for persistence
    sessionStore.saveTerminalSession({
      projectId,
      terminalId,
      createdAt: Date.now(),
      lastActive: Date.now(),
      history: [],
      cwd: '/workspace',
      env: {},
    }).catch(() => {});

    // Register RPC handlers for this terminal session
    rpc.register('terminal.resize', async ({ cols, rows }) => {
      // Docker exec doesn't support resize directly, but we acknowledge
      console.log(`[RPC] Terminal resize: ${cols}x${rows}`);
      return { success: true };
    });

    rpc.register('terminal.clear', async () => {
      stream.write('\x1bc'); // Clear screen ANSI escape
      return { success: true };
    });

    rpc.register('terminal.kill', async () => {
      stream.write('\x03'); // Send Ctrl+C
      return { success: true };
    });

    rpc.register('terminal.saveHistory', async ({ command }) => {
      // Save command to container's bash history
      await execInContainer(entry.id, `echo "${command.replace(/"/g, '\\"')}" >> ~/.bash_history`);
      // Also save to Redis for persistence
      sessionStore.addCommandToHistory(projectId, terminalId, command).catch(() => {});
      return { success: true };
    });

    rpc.register('terminal.getHistory', async () => {
      // Try Redis first, fallback to container
      const redisSession = await sessionStore.getTerminalSession(projectId, terminalId);
      if (redisSession?.history?.length) {
        return { history: redisSession.history };
      }
      // Fallback to container's bash history
      const history = await execInContainer(entry.id, 'tail -n 100 ~/.bash_history || echo ""');
      return { history: history.split('\n').filter(Boolean) };
    });

    rpc.register('resetTimer', async () => {
      lifecycleManager.resetTimer(projectId);
      sessionStore.updateTerminalActivity(projectId, terminalId).catch(() => {});
      return { success: true };
    });

    // Store session with stream and RPC reference
    session = { pty: stream as any, projectId, rpc };
    terminalSessions.set(terminalId, session);

    // Handle data from client to container
    ws.on('message', async (data: Buffer | string) => {
      entry.lastActive = Date.now();
      lifecycleManager.resetTimer(projectId);

      // Check if it's an RPC message
      if (typeof data === 'string') {
        const handled = await rpc.handleMessage(data);
        if (handled) return;
      }

      // Otherwise, write to terminal
      stream.write(data);
    });

    ws.on('close', () => {
      console.log(`Terminal ${terminalId} WebSocket closed`);
      // Don't destroy session immediately - allow reconnection
      setTimeout(() => {
        const s = terminalSessions.get(terminalId);
        if (s) {
          stream.end();
          terminalSessions.delete(terminalId);
        }
      }, 5000); // 5 second grace period for reconnection
    });
  } else {
    // Reconnect to existing session
    console.log(`♻️ Reconnecting to terminal session: ${terminalId}`);
    const stream = session.pty as unknown as Duplex;
    
    // Update RPC reference for reconnected session
    session.rpc = rpc;

    // Re-register RPC handlers
    rpc.register('terminal.resize', async ({ cols, rows }) => {
      console.log(`[RPC] Terminal resize: ${cols}x${rows}`);
      return { success: true };
    });

    rpc.register('terminal.clear', async () => {
      stream.write('\x1bc');
      return { success: true };
    });

    rpc.register('terminal.kill', async () => {
      stream.write('\x03');
      return { success: true };
    });

    rpc.register('resetTimer', async () => {
      lifecycleManager.resetTimer(projectId);
      return { success: true };
    });
    
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    ws.on('message', async (data: Buffer | string) => {
      entry.lastActive = Date.now();
      lifecycleManager.resetTimer(projectId);

      if (typeof data === 'string') {
        const handled = await rpc.handleMessage(data);
        if (handled) return;
      }

      stream.write(data);
    });

    ws.on('close', () => {
      console.log(`Terminal ${terminalId} WebSocket closed (reconnectable)`);
    });
  }
});

// WebSocket endpoint for LSP diagnostics
app.ws('/diagnostics/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const entry = containers.get(projectId);
  
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  console.log(`[LSP] Diagnostics WebSocket connected for ${projectId}`);

  // Start language server if not already running
  try {
    await languageServerManager.autoStart(entry.id, projectId);
  } catch (error: any) {
    console.error(`[LSP] Failed to start:`, error.message);
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }

  // Listen for diagnostic updates
  const diagnosticHandler = ({ projectId: pid, diagnostics }: any) => {
    if (pid === projectId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'diagnostics', diagnostics }));
    }
  };

  languageServerManager.on('diagnostics', diagnosticHandler);

  // Send initial diagnostics
  languageServerManager.getAllDiagnostics(entry.id, projectId).then(diagnostics => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'diagnostics', diagnostics }));
    }
  });

  ws.on('close', () => {
    languageServerManager.removeListener('diagnostics', diagnosticHandler);
    console.log(`[LSP] Diagnostics WebSocket closed for ${projectId}`);
  });
});

// WebSocket endpoint for file watching (CLI integration)
// Used by recoder-code CLI to sync file changes with web editor
app.ws('/watch/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const entry = containers.get(projectId);
  
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  console.log(`[FileWatch] WebSocket connected for ${projectId}`);

  // Start file watcher for this project
  fileWatcher.startWatching(entry.id, projectId);

  // Listen for file changes and forward to client
  const changeHandler = ({ projectId: pid, changes }: any) => {
    if (pid === projectId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'file-changes', changes }));
    }
  };

  fileWatcher.on('changes', changeHandler);

  ws.on('close', () => {
    fileWatcher.removeListener('changes', changeHandler);
    fileWatcher.stopWatching(projectId);
    console.log(`[FileWatch] WebSocket closed for ${projectId}`);
  });

  ws.on('error', (err) => {
    console.error(`[FileWatch] Error for ${projectId}:`, err.message);
  });
});

// Get code fixes for a diagnostic
app.post('/api/code-fixes', async (req, res) => {
  try {
    const { projectId, diagnostic } = req.body;
    const entry = containers.get(projectId);
    
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    const fixes = await languageServerManager.getCodeFixes(entry.id, diagnostic);
    res.json({ fixes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Apply code fix
app.post('/api/apply-fix', async (req, res) => {
  try {
    const { projectId, fix } = req.body;
    const entry = containers.get(projectId);
    
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    const success = await languageServerManager.applyCodeFix(entry.id, fix);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Hover info
app.post('/api/hover/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { file, line, character } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    
    const result = await languageServerManager.getHover(entry.id, file, line, character);
    res.json(result || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Go to definition
app.post('/api/definition/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { file, line, character } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    
    const result = await languageServerManager.getDefinition(entry.id, file, line, character);
    res.json(result || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search in files
app.post('/api/search/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { query, options } = req.body;
    let entry = containers.get(projectId);
    
    // Try to recover container from Docker if not in memory
    if (!entry) {
      console.log(`⚠️ [Search] Container not in memory for ${projectId}, attempting recovery...`);
      const allContainers = await docker.listContainers({ all: false });
      for (const containerInfo of allContainers) {
        const volumes = Object.keys(containerInfo.Mounts?.reduce((acc: any, m: any) => {
          if (m.Name) acc[m.Name] = true;
          return acc;
        }, {}) || {});
        if (volumes.some(v => v.includes(`recoder-${projectId}`))) {
          const ports = containerInfo.Ports || [];
          let basePort = 0;
          for (const p of ports) {
            if (p.PrivatePort === 3000 && p.PublicPort) basePort = p.PublicPort;
            if (p.PrivatePort === 5173 && p.PublicPort && !basePort) basePort = p.PublicPort - 1;
          }
          if (basePort > 0) {
            entry = { id: containerInfo.Id, lastActive: Date.now(), port: basePort, ptyPort: basePort + 3, backgroundDev: false };
            containers.set(projectId, entry);
            console.log(`🔄 [Search] Recovered container for ${projectId}`);
            break;
          }
        }
      }
    }
    
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    const results = await searchService.search(entry.id, query, options);
    res.json({ results, total: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Replace in files
app.post('/api/replace/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { searchQuery, replaceText, files } = req.body;
    const entry = containers.get(projectId);
    
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    const result = await searchService.replace(entry.id, searchQuery, replaceText, files);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// File sync WebSocket (real-time)
app.ws('/sync/:projectId', async (ws, req) => {
  const entry = containers.get(req.params.projectId);
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  const container = docker.getContainer(entry.id);

  ws.on('message', async (data) => {
    try {
      entry.lastActive = Date.now();
      const msg = JSON.parse(data.toString());

      if (msg.action === 'write') {
        const dir = msg.path.substring(0, msg.path.lastIndexOf('/'));
        if (dir) await execCommand(container, `mkdir -p "${dir}"`);
        const b64 = Buffer.from(msg.content).toString('base64');
        await execCommand(container, `echo "${b64}" | base64 -d > "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'written', path: msg.path }));
      }

      if (msg.action === 'read') {
        const content = await execCommand(container, `cat "${msg.path}" 2>/dev/null || echo ""`);
        ws.send(JSON.stringify({ action: 'content', path: msg.path, content }));
      }

      if (msg.action === 'delete') {
        await execCommand(container, `rm -rf "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'deleted', path: msg.path }));
      }

      if (msg.action === 'list') {
        const output = await execCommand(container, `find "${msg.path || '/workspace'}" -maxdepth 3 2>/dev/null | head -500`);
        ws.send(JSON.stringify({ action: 'files', files: output.split('\n').filter(Boolean) }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ action: 'error', error: err.message }));
    }
  });
});

// Helper: execute command in container
async function execCommand(container: Docker.Container, cmd: string, allowTermination = false): Promise<string> {
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const output = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk: Buffer) => {
      // Docker multiplexes stdout/stderr, skip header bytes
      out += chunk.slice(8).toString();
    });
    stream.on('end', () => resolve(out.trim()));
    stream.on('error', reject);
  });

  // Check exit code
  const inspection = await exec.inspect();

  // 🔧 FIX: Exit code 143 (SIGTERM) is OK if explicitly allowed
  // This is normal when killing background processes like dev servers
  if (inspection.ExitCode === 143 && allowTermination) {
    console.log('✅ Process terminated gracefully (exit code 143)');
    return output;
  }

  if (inspection.ExitCode !== 0 && inspection.ExitCode !== null) {
    throw new Error(`Command failed with exit code ${inspection.ExitCode}: ${output}`);
  }

  return output;
}

// Cleanup idle containers
setInterval(async () => {
  const now = Date.now();
  for (const [projectId, entry] of containers) {
    if (now - entry.lastActive > IDLE_TIMEOUT) {
      try {
        const container = docker.getContainer(entry.id);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
        releasePorts(entry.port, entry.ptyPort);
        containers.delete(projectId);
        console.log(`Cleaned up idle container: ${projectId}`);
      } catch {}
    }
  }
}, 60000); // Check every minute

// Snapshot compression and cleanup - runs every 10 minutes
const lastCompression = new Map<string, number>();
setInterval(async () => {
  const now = Date.now();
  const COMPRESSION_INTERVAL = 10 * 60 * 1000; // 10 minutes

  for (const [projectId, entry] of containers) {
    const lastCompress = lastCompression.get(projectId) || 0;

    // Only compress if container has been active and hasn't been compressed recently
    if (now - lastCompress > COMPRESSION_INTERVAL && now - entry.lastActive < IDLE_TIMEOUT) {
      try {
        // Run git gc to compress snapshots
        await snapshotManager.compress(entry.id);

        // Prune old snapshots (keep last 50)
        await snapshotManager.pruneOldSnapshots(entry.id, 50);

        lastCompression.set(projectId, now);
        console.log(`[Snapshot] Compressed and pruned snapshots for ${projectId}`);
      } catch (err) {
        // Silently ignore errors - compression is best-effort
      }
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

// Startup sequence - cleanup THEN pool initialization (in correct order)
async function startupSequence() {
  // Step 1: Cleanup old containers FIRST
  console.log('🧹 [Startup] Cleaning up old containers...');
  try {
    console.log('🧹 [Startup] Listing containers...');
    const allContainers = await docker.listContainers({ all: true });
    console.log(`🧹 [Startup] Found ${allContainers.length} total containers`);

    const recoderContainers = allContainers.filter(c => c.Image === IMAGE_NAME);
    console.log(`🧹 [Startup] Found ${recoderContainers.length} recoder containers to clean`);

    for (const c of recoderContainers) {
      try {
        console.log(`🧹 [Startup] Removing container ${c.Id.slice(0, 12)}...`);
        const container = docker.getContainer(c.Id);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
        console.log(`🧹 [Startup] Removed ${c.Id.slice(0, 12)}`);
      } catch (err: any) {
        console.error(`🧹 [Startup] Failed to remove ${c.Id.slice(0, 12)}:`, err.message);
      }
    }
    console.log('✅ [Startup] Cleanup complete');
  } catch (e: any) {
    console.error('❌ [Startup] Cleanup failed:', e.message);
    console.error('❌ [Startup] Full error:', e);
  }

  // Step 2: THEN initialize container pool (after cleanup is done)
  if (ENABLE_CONTAINER_POOL) {
    console.log('🚀 [Startup] Initializing container pool...');
    containerPool.setPortManager(allocatePort, releasePorts);
    try {
      await containerPool.initialize();
      console.log('✅ [Startup] Container pool ready');
    } catch (err: any) {
      console.error('❌ [Startup] Container pool initialization failed:', err.message);
    }
  }
}

// NOTE: startupSequence() is called inside app.listen() callback below

// Import and setup preview proxy
import { setupPreviewProxy } from './preview';
setupPreviewProxy(app as any, containers);

// File Watch WebSocket - notifies frontend of file changes from CLI tools
const fileWatchClients = new Map<string, Set<WebSocket>>();

app.ws('/watch/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const entry = containers.get(projectId);
  
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  // Add client to watch list
  if (!fileWatchClients.has(projectId)) {
    fileWatchClients.set(projectId, new Set());
  }
  fileWatchClients.get(projectId)!.add(ws as any);

  // Start file watcher for this project if not already running
  fileWatcher.startWatching(entry.id, projectId);

  console.log(`[FileWatch] Client connected for ${projectId}`);

  ws.on('close', () => {
    const clients = fileWatchClients.get(projectId);
    if (clients) {
      clients.delete(ws as any);
      if (clients.size === 0) {
        fileWatcher.stopWatching(projectId);
        fileWatchClients.delete(projectId);
      }
    }
    console.log(`[FileWatch] Client disconnected for ${projectId}`);
  });
});

// Forward file watcher events to WebSocket clients
fileWatcher.on('changes', ({ projectId, changes }) => {
  const clients = fileWatchClients.get(projectId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({ type: 'file-changes', changes });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, async () => {
  console.log(`🚀 Recoder Docker Backend running on port ${PORT}`);
  console.log(`📦 Image: ${IMAGE_NAME}`);
  console.log(`🌐 Preview URL: http://localhost:${PORT}/preview/{projectId}`);

  // Run startup sequence AFTER server is listening
  // This ensures cleanup happens first, then pool is initialized
  await startupSequence();
});
