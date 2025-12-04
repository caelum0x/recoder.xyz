import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { Duplex } from 'stream';
import dotenv from 'dotenv';
import { mountFiles } from './fileMount.js';

dotenv.config();

const docker = new Docker();
const { app } = expressWs(express());

// CORS and COEP headers for iframe embedding
app.use(cors({ origin: '*', credentials: true }));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use(express.json({ limit: '50mb' }));

// Container registry: projectId -> containerId
const containers = new Map<string, { id: string; lastActive: number }>();

const IMAGE_NAME = 'recoder-universal:latest';
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min
const MEMORY_LIMIT = 1024 * 1024 * 1024; // 1GB
const CPU_QUOTA = 100000; // 100% of 1 CPU

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', containers: containers.size });
});

// Create or get container for project
app.post('/api/container', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Return existing container
    const existing = containers.get(projectId);
    if (existing) {
      existing.lastActive = Date.now();
      return res.json({ containerId: existing.id, reused: true });
    }

    // Create new container with security sandbox
    const container = await docker.createContainer({
      Image: IMAGE_NAME,
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/workspace',
      HostConfig: {
        Memory: MEMORY_LIMIT,
        CpuPeriod: 100000,
        CpuQuota: CPU_QUOTA,
        NetworkMode: 'bridge',
        // Security sandbox
        ReadonlyRootfs: false,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER'],
        PidsLimit: 256,
        Ulimits: [
          { Name: 'nofile', Soft: 1024, Hard: 2048 },
          { Name: 'nproc', Soft: 128, Hard: 256 }
        ],
      },
      Labels: { projectId, createdAt: Date.now().toString() },
    });

    await container.start();
    containers.set(projectId, { id: container.id, lastActive: Date.now() });

    console.log(`✅ Container created: ${container.id.slice(0, 12)} for ${projectId}`);
    res.json({ containerId: container.id, reused: false });
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
    const { command, cwd = '/workspace' } = req.body;
    const entry = containers.get(req.params.projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    const output = await execCommand(container, `cd "${cwd}" && ${command}`);

    res.json({ output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Terminal WebSocket
app.ws('/terminal/:projectId', async (ws, req) => {
  const entry = containers.get(req.params.projectId);
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  entry.lastActive = Date.now();
  const container = docker.getContainer(entry.id);

  try {
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true }) as Duplex;

    stream.on('data', (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk.toString());
      }
    });

    ws.on('message', (data) => {
      entry.lastActive = Date.now();
      stream.write(data.toString());
    });

    ws.on('close', () => stream.end());
    stream.on('end', () => ws.close());
  } catch (err: any) {
    console.error('Terminal error:', err.message);
    ws.close(1011, err.message);
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
async function execCommand(container: Docker.Container, cmd: string): Promise<string> {
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  return new Promise((resolve, reject) => {
    let output = '';
    stream.on('data', (chunk: Buffer) => {
      // Docker multiplexes stdout/stderr, skip header bytes
      output += chunk.slice(8).toString();
    });
    stream.on('end', () => resolve(output.trim()));
    stream.on('error', reject);
  });
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
        containers.delete(projectId);
        console.log(`🧹 Cleaned up idle container: ${projectId}`);
      } catch {}
    }
  }
}, 60000); // Check every minute

// Import and setup preview proxy
import { setupPreviewProxy } from './preview';
setupPreviewProxy(app as any, containers);

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`🚀 Recoder Docker Backend running on port ${PORT}`);
  console.log(`📦 Image: ${IMAGE_NAME}`);
  console.log(`🌐 Preview URL: http://localhost:${PORT}/preview/{projectId}`);
});
