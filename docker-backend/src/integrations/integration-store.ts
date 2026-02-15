/**
 * Integration Credentials & Project Links Store
 * Manages per-user credentials (Supabase, Neon) and per-project integration links.
 * Uses JSON file persistence via loadStore/saveStore.
 */

import { loadStore, saveStore } from '../persistence.js';

// ── Types ──────────────────────────────────────────────────────────

export interface IntegrationCredentials {
  supabase?: { accessToken: string };
  neon?: { apiKey: string };
}

export interface ProjectSupabaseLink {
  projectId: string;
  organizationSlug: string;
  parentProjectId?: string;
}

export interface ProjectNeonLink {
  projectId: string;
  developmentBranchId: string;
  previewBranchId?: string;
}

export interface ProjectIntegrationLinks {
  supabase?: ProjectSupabaseLink;
  neon?: ProjectNeonLink;
}

interface IntegrationsStore {
  credentials: Record<string, IntegrationCredentials>; // userId → credentials
  projectLinks: Record<string, ProjectIntegrationLinks>; // projectId → links
}

const STORE_NAME = 'integrations';

// ── Helpers ────────────────────────────────────────────────────────

function load(): IntegrationsStore {
  return loadStore<IntegrationsStore>(STORE_NAME, { credentials: {}, projectLinks: {} });
}

function save(data: IntegrationsStore): void {
  saveStore(STORE_NAME, data);
}

// ── Credential CRUD ────────────────────────────────────────────────

export function getUserCredentials(userId: string): IntegrationCredentials {
  const store = load();
  return store.credentials[userId] || {};
}

export function setUserCredentials(
  userId: string,
  provider: 'supabase' | 'neon',
  creds: { accessToken?: string; apiKey?: string },
): void {
  const store = load();
  if (!store.credentials[userId]) {
    store.credentials[userId] = {};
  }
  if (provider === 'supabase' && creds.accessToken) {
    store.credentials[userId].supabase = { accessToken: creds.accessToken };
  } else if (provider === 'neon' && creds.apiKey) {
    store.credentials[userId].neon = { apiKey: creds.apiKey };
  }
  save(store);
}

export function removeUserCredentials(userId: string, provider: 'supabase' | 'neon'): void {
  const store = load();
  if (store.credentials[userId]) {
    delete store.credentials[userId][provider];
    if (!store.credentials[userId].supabase && !store.credentials[userId].neon) {
      delete store.credentials[userId];
    }
    save(store);
  }
}

// ── Project Link CRUD ──────────────────────────────────────────────

export function getProjectLinks(projectId: string): ProjectIntegrationLinks {
  const store = load();
  return store.projectLinks[projectId] || {};
}

export function setProjectLink(
  projectId: string,
  provider: 'supabase' | 'neon',
  link: ProjectSupabaseLink | ProjectNeonLink,
): void {
  const store = load();
  if (!store.projectLinks[projectId]) {
    store.projectLinks[projectId] = {};
  }
  if (provider === 'supabase') {
    store.projectLinks[projectId].supabase = link as ProjectSupabaseLink;
  } else {
    store.projectLinks[projectId].neon = link as ProjectNeonLink;
  }
  save(store);
}

export function removeProjectLink(projectId: string, provider: 'supabase' | 'neon'): void {
  const store = load();
  if (store.projectLinks[projectId]) {
    delete store.projectLinks[projectId][provider];
    if (!store.projectLinks[projectId].supabase && !store.projectLinks[projectId].neon) {
      delete store.projectLinks[projectId];
    }
    save(store);
  }
}
