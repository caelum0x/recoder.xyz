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

dotenv.config();

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
app.set('trust proxy', true);

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
const MEMORY_LIMIT = 1024 * 1024 * 1024; // 1GB
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

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', containers: containers.size });
});

// Create or get container for project
app.post('/api/container', containerLimiter, async (req, res) => {
  try {
    const { projectId, userId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Fetch user's Claude Code token if userId provided
    const claudeCodeToken = userId ? await fetchClaudeCodeToken(userId) : null;

    // Return existing container
    const existing = containers.get(projectId);
    if (existing) {
      existing.lastActive = Date.now();
      console.log(`♻️ Reusing existing container: ${existing.id.slice(0, 12)} for ${projectId}`);
      return res.json({ containerId: existing.id, reused: true, port: existing.port, ptyPort: existing.ptyPort });
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

      try {
        // Allocate host ports for preview and PTY
        const ports = await allocatePort();
        hostPort = ports.preview;
        ptyPort = ports.pty;

        // Build environment variables for container
        const containerEnv = ['PTY_PORT=9999'];

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
        // default: no background dev server started yet
        containers.set(projectId, { id: containerInstance.id, lastActive: Date.now(), port: hostPort, ptyPort, backgroundDev: false });

        console.log(`✅ Container created: ${containerInstance.id.slice(0, 12)} for ${projectId} (preview: ${hostPort}, pty: ${ptyPort})`);
        return { containerId: containerInstance.id, port: hostPort, ptyPort };
      } catch (err) {
        // Cleanup allocated ports on failure
        if (hostPort !== undefined && ptyPort !== undefined) {
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
    res.json({ containerId: result.containerId, reused: false, port: result.port, ptyPort: result.ptyPort });
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
  console.log('📝 File write request:', req.params.projectId, req.body?.path);
  try {
    const { path, content } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

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
  try {
    const { files } = req.body; // Array of { path, content }
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

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
  try {
    const { path } = req.query;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    const content = await execCommand(container, `cat "${path}"`);

    res.json({ content });
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

    // Sanitize cwd - ensure it's a valid absolute path
    if (!cwd || typeof cwd !== 'string') cwd = '/workspace';
    cwd = cwd.trim();
    if (!cwd.startsWith('/')) cwd = `/workspace/${cwd}`;
    // Remove duplicate /workspace if present
    cwd = cwd.replace(/\/workspace\/workspace/, '/workspace');

    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

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
      const startScript = `cd "${cwd}" && exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`;

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
    const container = docker.getContainer(entry.id);

    // Read last 100 lines of dev server logs
    const logs = await execCommand(container, `tail -n 100 /tmp/dev.log 2>/dev/null || echo "No logs found"`);

    res.json({ logs });
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
app.ws('/terminal/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  const entry = containers.get(projectId);
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  entry.lastActive = Date.now();

  // Wait for PTY server to be ready
  const ptyReady = await waitForPtyServer(entry.ptyPort);
  if (!ptyReady) {
    console.error('PTY server not ready for project:', projectId);
    ws.close(1011, 'PTY server not ready');
    return;
  }

  // Connect to container's PTY server
  const ptyWs = new WebSocket(`ws://127.0.0.1:${entry.ptyPort}`);

  ptyWs.on('open', () => {
    console.log('Terminal connected:', projectId);
    // If a background dev server was started, automatically tail its log file so the user
    // sees build output immediately. Users can still run commands in the shell to stop/start.
    try {
      if (entry.backgroundDev) {
        // Send command to the PTY shell to tail the dev log. This assumes the PTY spawns a bash shell.
        ptyWs.send('tail -n 200 -f /tmp/dev.log\n');
      }
    } catch (e) {
      console.error('Failed to send initial tail to PTY:', (e as any)?.message || e);
    }
  });

  ptyWs.on('message', (data: Buffer) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  ptyWs.on('error', (err: Error) => {
    console.error('PTY connection error:', err.message);
    ws.close(1011, 'PTY connection failed');
  });

  ptyWs.on('close', () => {
    if (ws.readyState === ws.OPEN) {
      ws.close(1000);
    }
  });

  ws.on('message', (data: Buffer | string) => {
    entry.lastActive = Date.now();
    if (ptyWs.readyState === WebSocket.OPEN) {
      ptyWs.send(data);
    }
  });

  ws.on('close', () => {
    ptyWs.close();
  });
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

// Startup cleanup - remove old recoder containers
(async () => {
  try {
    const allContainers = await docker.listContainers({ all: true });
    for (const c of allContainers) {
      if (c.Image === IMAGE_NAME) {
        try {
          const container = docker.getContainer(c.Id);
          await container.stop().catch(() => {});
          await container.remove().catch(() => {});
          console.log(`🧹 Startup cleanup: removed ${c.Id.slice(0, 12)}`);
        } catch {}
      }
    }
  } catch (e) {
    console.error('Startup cleanup failed:', e);
  }
})();

// Import and setup preview proxy
import { setupPreviewProxy } from './preview';
setupPreviewProxy(app as any, containers);

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`🚀 Recoder Docker Backend running on port ${PORT}`);
  console.log(`📦 Image: ${IMAGE_NAME}`);
  console.log(`🌐 Preview URL: http://localhost:${PORT}/preview/{projectId}`);
});
