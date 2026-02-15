/**
 * Vercel Integration Store
 * Manages Vercel access tokens, project linking, and deployment history.
 * Uses JSON file persistence via loadStore/saveStore.
 */

import { loadStore, saveStore } from '../persistence.js';

// ── Types ──────────────────────────────────────────────────────────

export interface VercelDeployment {
  uid: string;
  url: string;
  state: string; // QUEUED, BUILDING, READY, ERROR, CANCELED
  createdAt: number;
  target: string | null; // 'production' | 'preview' | null
  readyState: string;
}

export interface VercelProjectLink {
  vercelProjectId: string;
  vercelProjectName: string;
  vercelTeamId: string | null;
  vercelDeploymentUrl: string | null;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
}

interface VercelStore {
  // userId → access token
  tokens: Record<string, string>;
  // recoderProjectId → Vercel project link
  projectLinks: Record<string, VercelProjectLink>;
}

const STORE_NAME = 'vercel-integrations';

// ── Helpers ────────────────────────────────────────────────────────

function load(): VercelStore {
  return loadStore<VercelStore>(STORE_NAME, { tokens: {}, projectLinks: {} });
}

function save(data: VercelStore): void {
  saveStore(STORE_NAME, data);
}

// ── Token Management ──────────────────────────────────────────────

export function getVercelToken(userId: string): string | null {
  const store = load();
  return store.tokens[userId] || null;
}

export function setVercelToken(userId: string, token: string): void {
  const store = load();
  store.tokens[userId] = token;
  save(store);
}

export function removeVercelToken(userId: string): void {
  const store = load();
  delete store.tokens[userId];
  save(store);
}

// ── Project Linking ───────────────────────────────────────────────

export function getVercelProjectLink(projectId: string): VercelProjectLink | null {
  const store = load();
  return store.projectLinks[projectId] || null;
}

export function setVercelProjectLink(projectId: string, link: VercelProjectLink): void {
  const store = load();
  store.projectLinks[projectId] = link;
  save(store);
}

export function removeVercelProjectLink(projectId: string): void {
  const store = load();
  delete store.projectLinks[projectId];
  save(store);
}

// ── Vercel API Client ─────────────────────────────────────────────

const VERCEL_API = 'https://api.vercel.com';

async function vercelFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {},
  teamId?: string | null,
): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const teamParam = teamId ? `${separator}teamId=${teamId}` : '';
  const url = `${VERCEL_API}${path}${teamParam}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vercel API ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Vercel API Functions ──────────────────────────────────────────

export async function validateVercelToken(token: string): Promise<{ valid: boolean; username?: string }> {
  try {
    const user = await vercelFetch<{ user: { username: string; name: string } }>(token, '/v2/user');
    return { valid: true, username: user.user.username };
  } catch {
    return { valid: false };
  }
}

export async function listVercelTeams(token: string): Promise<Array<{ id: string; slug: string; name: string }>> {
  try {
    const result = await vercelFetch<{ teams: Array<{ id: string; slug: string; name: string }> }>(token, '/v2/teams');
    return result.teams || [];
  } catch {
    return [];
  }
}

export async function listVercelProjects(
  token: string,
  teamId?: string | null,
): Promise<VercelProject[]> {
  const result = await vercelFetch<{ projects: Array<{ id: string; name: string; framework: string | null }> }>(
    token,
    '/v9/projects?limit=50',
    {},
    teamId,
  );
  return (result.projects || []).map(p => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
  }));
}

export async function getVercelDeployments(
  token: string,
  projectId: string,
  teamId?: string | null,
): Promise<VercelDeployment[]> {
  const result = await vercelFetch<{
    deployments: Array<{
      uid: string;
      url: string;
      state: string;
      created: number;
      target: string | null;
      readyState: string;
    }>;
  }>(token, `/v6/deployments?projectId=${projectId}&limit=10`, {}, teamId);

  return (result.deployments || []).map(d => ({
    uid: d.uid,
    url: d.url,
    state: d.state || d.readyState,
    createdAt: d.created,
    target: d.target,
    readyState: d.readyState,
  }));
}

export async function isProjectNameAvailable(
  token: string,
  name: string,
  teamId?: string | null,
): Promise<boolean> {
  try {
    const result = await vercelFetch<{ projects: Array<{ name: string }> }>(
      token,
      `/v9/projects?search=${encodeURIComponent(name)}`,
      {},
      teamId,
    );
    return !(result.projects || []).some(p => p.name.toLowerCase() === name.toLowerCase());
  } catch {
    return false;
  }
}

export async function createVercelProject(
  token: string,
  name: string,
  framework?: string,
  teamId?: string | null,
): Promise<VercelProject> {
  const body: Record<string, unknown> = { name };
  if (framework) body.framework = framework;

  const result = await vercelFetch<{ id: string; name: string; framework: string | null }>(
    token,
    '/v9/projects',
    { method: 'POST', body: JSON.stringify(body) },
    teamId,
  );

  return { id: result.id, name: result.name, framework: result.framework };
}

export async function connectToExistingProject(
  token: string,
  vercelProjectId: string,
  teamId?: string | null,
): Promise<{ id: string; name: string; framework: string | null }> {
  return vercelFetch<{ id: string; name: string; framework: string | null }>(
    token,
    `/v9/projects/${vercelProjectId}`,
    {},
    teamId,
  );
}

/**
 * Detect framework from common config files present in the project.
 */
export function detectFramework(fileList: string[]): string | null {
  const fileSet = new Set(fileList.map(f => f.split('/').pop() || ''));

  if (fileSet.has('next.config.js') || fileSet.has('next.config.mjs') || fileSet.has('next.config.ts')) return 'nextjs';
  if (fileSet.has('nuxt.config.js') || fileSet.has('nuxt.config.ts')) return 'nuxtjs';
  if (fileSet.has('astro.config.mjs') || fileSet.has('astro.config.ts')) return 'astro';
  if (fileSet.has('svelte.config.js')) return 'sveltekit';
  if (fileSet.has('remix.config.js') || fileSet.has('remix.config.ts')) return 'remix';
  if (fileSet.has('vite.config.js') || fileSet.has('vite.config.ts') || fileSet.has('vite.config.mjs')) return 'vite';
  if (fileSet.has('angular.json')) return 'angular';
  if (fileSet.has('gatsby-config.js') || fileSet.has('gatsby-config.ts')) return 'gatsby';

  return null;
}
