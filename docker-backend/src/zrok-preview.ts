/**
 * @module zrok-preview
 *
 * Manages zrok2 tunnel shares for instant sandbox preview URLs.
 *
 * The deployed preview stack uses zrok2 enable tokens plus long-lived
 * `zrok2 share public ...` processes. This module keeps that local environment
 * enabled and maintains one background share process per active project.
 *
 * zrok v2 replaces the old `reserve` / `share reserved` flow with namespaces
 * and reserved names. Instant sandbox previews still use ephemeral public
 * shares, while published sites use a reserved name derived from the project id
 * so they keep the same public URL across publish updates and backend restarts.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { logger } from './logger.js';

const ZROK2_BINARY = process.env.ZROK2_BINARY ?? 'zrok2';
const ZROK2_API_ENDPOINT = process.env.ZROK2_API_ENDPOINT ?? process.env.ZROK_API_URL ?? 'http://zrok-controller:18080';
const ZROK_ENABLE_TOKEN = process.env.ZROK_TOKEN ?? '';
const ZROK_PUBLIC_BASE_DOMAIN = process.env.ZROK_PUBLIC_BASE_DOMAIN ?? 'recoder.xyz';
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

interface ListedName {
  name?: string;
  namespaceToken?: string;
  reserved?: boolean;
  shareToken?: string;
}

interface ZrokPreviewShare {
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

interface ZrokPublishedShare {
  publishedPath: string;
  reservedName: string;
  shareToken: string;
  frontendEndpoint: string;
  backendTarget: string;
  envZId: string;
  process: ChildProcess;
  createdAt: string;
}

const activePreviewShares = new Map<string, ZrokPreviewShare>();
const activePublishedShares = new Map<string, ZrokPublishedShare>();
const pendingPreviewShareCreates = new Map<string, Promise<{ previewUrl: string; shareToken: string } | null>>();
const pendingPublishedShareCreates = new Map<string, Promise<{ previewUrl: string; shareToken: string } | null>>();
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPreviewUrl(shareToken: string): string {
  // Public preview URLs stay under *.recoder.xyz so Cloudflare Universal SSL
  // can cover them. nginx rewrites the Host header back to zrok's native
  // {token}.preview.recoder.xyz shape before proxying to the frontend.
  return `https://preview-${shareToken}.${ZROK_PUBLIC_BASE_DOMAIN}`;
}

function buildPublishedShareName(projectId: string): string {
  const normalized = projectId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized.slice(0, 63) || 'project';
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

async function listNames(namespaceToken = ZROK_NAMESPACE_TOKEN): Promise<ListedName[]> {
  const args = ['list', 'names'];
  if (namespaceToken) {
    args.push('-n', namespaceToken);
  }
  args.push('--json');

  const { stdout } = await runZrokCommand(args);
  if (!stdout.trim()) {
    return [];
  }

  return JSON.parse(stdout) as ListedName[];
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

function attachUnexpectedExitHandler<T extends { process: ChildProcess }>(
  projectId: string,
  child: ChildProcess,
  shares: Map<string, T>,
  label: string,
): void {
  child.once('exit', (code, signal) => {
    const current = shares.get(projectId);
    if (current?.process === child) {
      shares.delete(projectId);
      logger.info({ projectId, code, signal }, `[zrok] ${label} share process exited`);
    }
  });
}

async function waitForShareReady(child: ChildProcess, envZId: string, backendTarget: string): Promise<ListedShare> {
  let lastOutput = '';

  const capture = (chunk: Buffer | string) => {
    lastOutput += chunk.toString();
  };

  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const startedAt = Date.now();
  while (Date.now() - startedAt < SHARE_DISCOVERY_TIMEOUT_MS) {
    const currentShares = await listShares(envZId).catch(() => []);
    const matching = currentShares.find((share) => share.target === backendTarget && share.shareToken);
    if (matching) {
      return matching;
    }

    if (child.exitCode !== null || child.killed) {
      break;
    }

    await sleep(SHARE_DISCOVERY_INTERVAL_MS);
  }

  throw new Error(`zrok2 share did not become ready for ${backendTarget}: ${lastOutput.trim()}`);
}

async function ensureReservedPublicName(name: string): Promise<void> {
  const existing = (await listNames(ZROK_NAMESPACE_TOKEN)).find(
    (entry) => entry.name === name && entry.namespaceToken === ZROK_NAMESPACE_TOKEN,
  );

  if (!existing) {
    await runZrokCommand(['create', 'name', '-n', ZROK_NAMESPACE_TOKEN, name]);
    logger.info({ namespace: ZROK_NAMESPACE_TOKEN, name }, '[zrok] Reserved public name created');
    return;
  }

  if (!existing.reserved) {
    await runZrokCommand(['modify', 'name', '-n', ZROK_NAMESPACE_TOKEN, '-r', name]);
    logger.info({ namespace: ZROK_NAMESPACE_TOKEN, name }, '[zrok] Public name promoted to reserved');
  }
}

async function deleteReservedPublicName(name: string): Promise<void> {
  try {
    await runZrokCommand(['delete', 'name', '-n', ZROK_NAMESPACE_TOKEN, name]);
    logger.info({ namespace: ZROK_NAMESPACE_TOKEN, name }, '[zrok] Reserved public name deleted');
  } catch (err) {
    logger.warn({ err, namespace: ZROK_NAMESPACE_TOKEN, name }, '[zrok] Failed to delete reserved public name');
  }
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

  attachUnexpectedExitHandler(projectId, child, activePreviewShares, 'Preview');

  try {
    const ready = await waitForShareReady(child, env.envZId, backendTarget);
    if (!ready.shareToken) {
      throw new Error(`zrok2 preview share for ${backendTarget} did not return a share token`);
    }

    const share: ZrokPreviewShare = {
      sandboxId,
      sandboxHost,
      targetPort,
      shareToken: ready.shareToken,
      frontendEndpoint: buildPreviewUrl(ready.shareToken),
      backendTarget,
      envZId: env.envZId,
      process: child,
      createdAt: new Date().toISOString(),
    };
    activePreviewShares.set(projectId, share);
    logger.info({ projectId, shareToken: share.shareToken, frontendEndpoint: share.frontendEndpoint, backendTarget }, '[zrok] Preview share created');
    return { previewUrl: share.frontendEndpoint, shareToken: share.shareToken };
  } catch (err) {
    child.kill('SIGTERM');
    throw err;
  }
}

async function spawnPublishedShare(params: {
  projectId: string;
  publishedPath: string;
  reservedName: string;
  env: ZrokEnabledEnvironment;
}): Promise<{ previewUrl: string; shareToken: string }> {
  const { projectId, publishedPath, reservedName, env } = params;
  const backendTarget = path.resolve(publishedPath);
  const nameSelection = `${ZROK_NAMESPACE_TOKEN}:${reservedName}`;

  const child = spawn(ZROK2_BINARY, [
    'share',
    'public',
    backendTarget,
    '--backend-mode',
    'web',
    '--headless',
    '--force-local',
    '--open',
    '-n',
    nameSelection,
  ], {
    env: buildZrokEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  attachUnexpectedExitHandler(projectId, child, activePublishedShares, 'Published');

  try {
    const ready = await waitForShareReady(child, env.envZId, backendTarget);
    if (!ready.shareToken) {
      throw new Error(`zrok2 published share for ${backendTarget} did not return a share token`);
    }

    const share: ZrokPublishedShare = {
      publishedPath: backendTarget,
      reservedName,
      shareToken: ready.shareToken,
      frontendEndpoint: buildPreviewUrl(reservedName),
      backendTarget,
      envZId: env.envZId,
      process: child,
      createdAt: new Date().toISOString(),
    };
    activePublishedShares.set(projectId, share);
    logger.info({ projectId, shareToken: share.shareToken, frontendEndpoint: share.frontendEndpoint, backendTarget }, '[zrok] Published share created');
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
  const existing = activePreviewShares.get(projectId);

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
  const pending = pendingPreviewShareCreates.get(params.projectId);
  if (pending) {
    return pending;
  }

  const created = createPreviewShareInternal(params).finally(() => {
    pendingPreviewShareCreates.delete(params.projectId);
  });
  pendingPreviewShareCreates.set(params.projectId, created);
  return created;
}

/**
 * Published shares use a reserved public name derived from the project id.
 * The share process is recreated against the latest published directory as
 * needed, but the public URL remains stable.
 */
async function ensurePublishedShareInternal(params: {
  projectId: string;
  publishedPath: string;
}): Promise<{ previewUrl: string; shareToken: string } | null> {
  if (!isZrokConfigured()) {
    logger.debug('[zrok] Not configured — skipping published share creation');
    return null;
  }

  const { projectId, publishedPath } = params;
  const backendTarget = path.resolve(publishedPath);
  const reservedName = buildPublishedShareName(projectId);
  const existing = activePublishedShares.get(projectId);

  if (
    existing
    && existing.backendTarget === backendTarget
    && existing.reservedName === reservedName
    && existing.process.exitCode === null
    && !existing.process.killed
  ) {
    return { previewUrl: existing.frontendEndpoint, shareToken: existing.shareToken };
  }

  if (existing) {
    await destroyPublishedShare(projectId, { deleteName: false });
  }

  try {
    const env = await ensureEnabledEnvironment();
    await ensureReservedPublicName(reservedName);
    return await spawnPublishedShare({
      projectId,
      publishedPath: backendTarget,
      reservedName,
      env,
    });
  } catch (err) {
    logger.warn({ err, projectId, publishedPath: backendTarget }, '[zrok] Failed to create persistent published share');
    return null;
  }
}

export async function ensurePublishedShare(params: {
  projectId: string;
  publishedPath: string;
}): Promise<{ previewUrl: string; shareToken: string } | null> {
  const pending = pendingPublishedShareCreates.get(params.projectId);
  if (pending) {
    return pending;
  }

  const created = ensurePublishedShareInternal(params).finally(() => {
    pendingPublishedShareCreates.delete(params.projectId);
  });
  pendingPublishedShareCreates.set(params.projectId, created);
  return created;
}

export async function restorePublishedShares(entries: Array<{
  projectId: string;
  publishedPath: string;
}>): Promise<void> {
  if (!isZrokConfigured()) {
    return;
  }

  for (const entry of entries) {
    if (!entry.projectId || !entry.publishedPath) {
      continue;
    }

    await ensurePublishedShare(entry).catch((err) => {
      logger.warn({ err, projectId: entry.projectId, publishedPath: entry.publishedPath }, '[zrok] Failed to restore published share');
    });
  }
}

export async function destroyPreviewShare(projectId: string): Promise<void> {
  const existing = activePreviewShares.get(projectId);
  if (!existing) return;

  activePreviewShares.delete(projectId);

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

export async function destroyPublishedShare(
  projectId: string,
  options: { deleteName?: boolean } = {},
): Promise<void> {
  const existing = activePublishedShares.get(projectId);
  if (!existing) {
    if (options.deleteName) {
      await deleteReservedPublicName(buildPublishedShareName(projectId));
    }
    return;
  }

  activePublishedShares.delete(projectId);

  try {
    await runZrokCommand(['delete', 'share', existing.shareToken, '--envzid', existing.envZId]);
    logger.info({ projectId, shareToken: existing.shareToken }, '[zrok] Published share destroyed');
  } catch (err) {
    logger.warn({ err, projectId, shareToken: existing.shareToken }, '[zrok] Failed to delete published share record (may already be gone)');
  }

  if (!existing.process.killed && existing.process.exitCode === null) {
    existing.process.kill('SIGTERM');
  }

  if (options.deleteName) {
    await deleteReservedPublicName(existing.reservedName);
  }
}

export function getPreviewUrl(projectId: string): string | null {
  return activePreviewShares.get(projectId)?.frontendEndpoint ?? null;
}

export function getPublishedShareUrl(projectId: string): string | null {
  return activePublishedShares.get(projectId)?.frontendEndpoint ?? null;
}

export async function updateShareTarget(projectId: string, newPort: number): Promise<boolean> {
  const existing = activePreviewShares.get(projectId);
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
  return {
    configured: isZrokConfigured(),
    activeShares: activePreviewShares.size,
    reservedShares: activePublishedShares.size,
  };
}

export function __resetZrokPreviewStateForTests(): void {
  enablePromise = null;
  pendingPreviewShareCreates.clear();
  pendingPublishedShareCreates.clear();
  for (const share of activePreviewShares.values()) {
    if (!share.process.killed && share.process.exitCode === null) {
      share.process.kill('SIGTERM');
    }
  }
  for (const share of activePublishedShares.values()) {
    if (!share.process.killed && share.process.exitCode === null) {
      share.process.kill('SIGTERM');
    }
  }
  activePreviewShares.clear();
  activePublishedShares.clear();
}
