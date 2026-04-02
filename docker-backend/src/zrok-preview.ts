/**
 * @module zrok-preview
 *
 * Manages zrok2 tunnel shares for instant sandbox preview URLs.
 *
 * The deployed preview stack uses zrok2 enable tokens plus long-lived
 * `zrok2 share public ...` processes. This module keeps that local environment
 * enabled and maintains one background share process per active project.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { logger } from './logger.js';

const ZROK2_BINARY = process.env.ZROK2_BINARY ?? 'zrok2';
const ZROK2_API_ENDPOINT = process.env.ZROK2_API_ENDPOINT ?? process.env.ZROK_API_URL ?? 'http://zrok-controller:18080';
const ZROK_ENABLE_TOKEN = process.env.ZROK_TOKEN ?? '';
const ZROK_FRONTEND = process.env.ZROK_FRONTEND ?? 'preview.recoder.xyz';
const ZROK_NAMESPACE_TOKEN = process.env.ZROK_NAMESPACE_TOKEN ?? 'public';
const ZROK_STATE_DIR = process.env.ZROK_STATE_DIR ?? path.join(process.env.HOME ?? '/tmp', '.zrok2-recoder-backend');
const ZROK_ENVIRONMENT_FILE = path.join(ZROK_STATE_DIR, '.zrok2', 'environment.json');
const ZROK_CONFIG_HOME = path.join(ZROK_STATE_DIR, '.config');
const ZROK_ENABLE_DESCRIPTION = process.env.ZROK_ENABLE_DESCRIPTION ?? 'recoder-docker-backend';
const SHARE_DISCOVERY_TIMEOUT_MS = 30_000;
const SHARE_DISCOVERY_INTERVAL_MS = 1_000;

interface ZrokEnabledEnvironment {
  envZId: string;
  apiEndpoint: string;
  token: string;
}

interface ListedShare {
  envZId?: string;
  frontendEndpoints?: string[];
  shareToken?: string;
  target?: string;
  updatedAt?: number;
}

interface ZrokShare {
  sandboxId: string;
  sandboxHost?: string;
  targetPort: number;
  shareToken: string;
  frontendEndpoint: string;
  backendTarget: string;
  envZId: string;
  process: ChildProcess;
  createdAt: string;
}

const activeShares = new Map<string, ZrokShare>();
const pendingShareCreates = new Map<string, Promise<{ previewUrl: string; shareToken: string } | null>>();
let enablePromise: Promise<ZrokEnabledEnvironment> | null = null;

function isZrokConfigured(): boolean {
  return Boolean(ZROK_ENABLE_TOKEN);
}

function ensureStateDirs(): void {
  mkdirSync(ZROK_STATE_DIR, { recursive: true });
  mkdirSync(ZROK_CONFIG_HOME, { recursive: true });
}

function buildZrokEnv(): NodeJS.ProcessEnv {
  ensureStateDirs();
  return {
    ...process.env,
    HOME: ZROK_STATE_DIR,
    XDG_CONFIG_HOME: ZROK_CONFIG_HOME,
    ZROK2_API_ENDPOINT,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPreviewUrl(shareToken: string): string {
  return `https://${shareToken}.${ZROK_FRONTEND}`;
}

function parseShareTokenFromText(text: string): string | null {
  const match = new RegExp(`([a-z0-9-]+)\\.${escapeRegExp(ZROK_FRONTEND)}`, 'i').exec(text);
  return match?.[1]?.toLowerCase() ?? null;
}

function loadEnabledEnvironment(): ZrokEnabledEnvironment | null {
  if (!existsSync(ZROK_ENVIRONMENT_FILE)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(ZROK_ENVIRONMENT_FILE, 'utf-8')) as {
      api_endpoint?: string;
      ziti_identity?: string;
      zrok_token?: string;
    };

    if (!raw.ziti_identity) {
      return null;
    }

    return {
      envZId: raw.ziti_identity,
      apiEndpoint: raw.api_endpoint ?? ZROK2_API_ENDPOINT,
      token: raw.zrok_token ?? ZROK_ENABLE_TOKEN,
    };
  } catch (err) {
    logger.warn({ err }, '[zrok] Failed to load enabled environment metadata');
    return null;
  }
}

function runZrokCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ZROK2_BINARY, args, {
      env: buildZrokEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.once('error', (err) => {
      reject(err);
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`zrok2 ${args.join(' ')} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}: ${(stderr || stdout).trim()}`));
    });
  });
}

async function listShares(envZId: string): Promise<ListedShare[]> {
  const { stdout } = await runZrokCommand(['list', 'shares', '--json']);
  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout) as { shares?: ListedShare[] };
  return (parsed.shares ?? [])
    .filter((share) => share.envZId === envZId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

async function ensureEnabledEnvironment(): Promise<ZrokEnabledEnvironment> {
  const existing = loadEnabledEnvironment();
  if (existing) {
    return existing;
  }

  if (!isZrokConfigured()) {
    throw new Error('zrok2 enable token is not configured');
  }

  if (!enablePromise) {
    enablePromise = (async () => {
      await runZrokCommand(['enable', '--headless', '--description', ZROK_ENABLE_DESCRIPTION, ZROK_ENABLE_TOKEN]);
      const enabled = loadEnabledEnvironment();
      if (!enabled) {
        throw new Error('zrok2 environment enable succeeded but no environment metadata was written');
      }
      logger.info({ envZId: enabled.envZId }, '[zrok] zrok2 environment enabled');
      return enabled;
    })().finally(() => {
      enablePromise = null;
    });
  }

  return enablePromise;
}

function buildBackendTarget(sandboxId: string, targetPort: number, sandboxHost?: string): string {
  return sandboxHost
    ? `http://${sandboxHost}:${targetPort}`
    : `http://${sandboxId}:${targetPort}`;
}

function attachUnexpectedExitHandler(projectId: string, child: ChildProcess): void {
  child.once('exit', (code, signal) => {
    const current = activeShares.get(projectId);
    if (current?.process === child) {
      activeShares.delete(projectId);
      logger.info({ projectId, code, signal }, '[zrok] Preview share process exited');
    }
  });
}

async function waitForShareReady(child: ChildProcess, envZId: string, backendTarget: string): Promise<{ shareToken: string; frontendEndpoint: string }> {
  let parsedShareToken: string | null = null;
  let lastOutput = '';

  const capture = (chunk: Buffer | string) => {
    const text = chunk.toString();
    lastOutput += text;
    const token = parseShareTokenFromText(text);
    if (token) {
      parsedShareToken = token;
    }
  };

  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const startedAt = Date.now();
  while (Date.now() - startedAt < SHARE_DISCOVERY_TIMEOUT_MS) {
    if (parsedShareToken) {
      return {
        shareToken: parsedShareToken,
        frontendEndpoint: buildPreviewUrl(parsedShareToken),
      };
    }

    const currentShares = await listShares(envZId).catch(() => []);
    const matching = currentShares.find((share) => share.target === backendTarget && share.shareToken);
    if (matching?.shareToken) {
      return {
        shareToken: matching.shareToken,
        frontendEndpoint: matching.frontendEndpoints?.[0]
          ? `https://${matching.frontendEndpoints[0]}`
          : buildPreviewUrl(matching.shareToken),
      };
    }

    if (child.exitCode !== null || child.killed) {
      break;
    }

    await sleep(SHARE_DISCOVERY_INTERVAL_MS);
  }

  throw new Error(`zrok2 share did not become ready for ${backendTarget}: ${lastOutput.trim()}`);
}

async function spawnShare(params: {
  projectId: string;
  sandboxId: string;
  sandboxHost?: string;
  targetPort: number;
  env: ZrokEnabledEnvironment;
}): Promise<{ previewUrl: string; shareToken: string }> {
  const { projectId, sandboxId, sandboxHost, targetPort, env } = params;
  const backendTarget = buildBackendTarget(sandboxId, targetPort, sandboxHost);

  const child = spawn(ZROK2_BINARY, [
    'share',
    'public',
    backendTarget,
    '--headless',
    '--force-local',
    '--open',
    '-n',
    ZROK_NAMESPACE_TOKEN,
  ], {
    env: buildZrokEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  attachUnexpectedExitHandler(projectId, child);

  try {
    const ready = await waitForShareReady(child, env.envZId, backendTarget);
    const share: ZrokShare = {
      sandboxId,
      sandboxHost,
      targetPort,
      shareToken: ready.shareToken,
      frontendEndpoint: ready.frontendEndpoint,
      backendTarget,
      envZId: env.envZId,
      process: child,
      createdAt: new Date().toISOString(),
    };
    activeShares.set(projectId, share);
    logger.info({ projectId, shareToken: share.shareToken, frontendEndpoint: share.frontendEndpoint, backendTarget }, '[zrok] Preview share created');
    return { previewUrl: share.frontendEndpoint, shareToken: share.shareToken };
  } catch (err) {
    child.kill('SIGTERM');
    throw err;
  }
}

async function createPreviewShareInternal(params: {
  sandboxId: string;
  projectId: string;
  targetPort?: number;
  sandboxHost?: string;
}): Promise<{ previewUrl: string; shareToken: string } | null> {
  if (!isZrokConfigured()) {
    logger.debug('[zrok] Not configured — skipping share creation');
    return null;
  }

  const { sandboxId, projectId, targetPort = 5173, sandboxHost } = params;
  const backendTarget = buildBackendTarget(sandboxId, targetPort, sandboxHost);
  const existing = activeShares.get(projectId);

  if (existing && existing.backendTarget === backendTarget && existing.process.exitCode === null && !existing.process.killed) {
    return { previewUrl: existing.frontendEndpoint, shareToken: existing.shareToken };
  }

  if (existing) {
    await destroyPreviewShare(projectId);
  }

  try {
    const env = await ensureEnabledEnvironment();
    return await spawnShare({ projectId, sandboxId, sandboxHost, targetPort, env });
  } catch (err) {
    logger.warn({ err, projectId }, '[zrok] Failed to create zrok2 preview share — falling back to Daytona preview');
    return null;
  }
}

export async function createPreviewShare(params: {
  sandboxId: string;
  projectId: string;
  targetPort?: number;
  sandboxHost?: string;
}): Promise<{ previewUrl: string; shareToken: string } | null> {
  const pending = pendingShareCreates.get(params.projectId);
  if (pending) {
    return pending;
  }

  const created = createPreviewShareInternal(params).finally(() => {
    pendingShareCreates.delete(params.projectId);
  });
  pendingShareCreates.set(params.projectId, created);
  return created;
}

/**
 * zrok2 no longer has the old reserved-share frontdoor model this codebase
 * originally assumed. Keep publish on the stable web publish URL for now.
 */
export async function reservePreviewShare(projectId: string): Promise<{ previewUrl: string } | null> {
  if (!isZrokConfigured()) return null;

  if (!activeShares.has(projectId)) {
    logger.warn({ projectId }, '[zrok] No active share to promote for publish');
    return null;
  }

  logger.info({ projectId }, '[zrok] zrok2 does not support the legacy reserved-share publish flow; skipping zrok publish URL');
  return null;
}

export async function destroyPreviewShare(projectId: string): Promise<void> {
  const existing = activeShares.get(projectId);
  if (!existing) return;

  activeShares.delete(projectId);

  try {
    await runZrokCommand(['delete', 'share', existing.shareToken, '--envzid', existing.envZId]);
    logger.info({ projectId, shareToken: existing.shareToken }, '[zrok] Preview share destroyed');
  } catch (err) {
    logger.warn({ err, projectId, shareToken: existing.shareToken }, '[zrok] Failed to delete share record (may already be gone)');
  }

  if (!existing.process.killed && existing.process.exitCode === null) {
    existing.process.kill('SIGTERM');
  }
}

export function getPreviewUrl(projectId: string): string | null {
  return activeShares.get(projectId)?.frontendEndpoint ?? null;
}

export async function updateShareTarget(projectId: string, newPort: number): Promise<boolean> {
  const existing = activeShares.get(projectId);
  if (!existing || !isZrokConfigured()) {
    return false;
  }

  if (existing.targetPort === newPort) {
    return true;
  }

  await destroyPreviewShare(projectId);
  const recreated = await createPreviewShare({
    projectId,
    sandboxId: existing.sandboxId,
    sandboxHost: existing.sandboxHost,
    targetPort: newPort,
  });

  return Boolean(recreated);
}

export function zrokStats(): { configured: boolean; activeShares: number; reservedShares: number } {
  return { configured: isZrokConfigured(), activeShares: activeShares.size, reservedShares: 0 };
}

export function __resetZrokPreviewStateForTests(): void {
  enablePromise = null;
  pendingShareCreates.clear();
  for (const share of activeShares.values()) {
    if (!share.process.killed && share.process.exitCode === null) {
      share.process.kill('SIGTERM');
    }
  }
  activeShares.clear();
}
