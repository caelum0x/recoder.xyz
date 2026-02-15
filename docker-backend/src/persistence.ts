/**
 * Simple JSON file persistence utility
 * Provides load/save with atomic writes and debounced saving
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadStore<T>(name: string, defaultValue: T): T {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[persistence] Failed to load ${name}:`, e);
  }
  return defaultValue;
}

export function saveStore(name: string, data: unknown): void {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath); // atomic write
  } catch (e) {
    console.error(`[persistence] Failed to save ${name}:`, e);
  }
}

/**
 * Create a debounced save function to avoid excessive writes during burst operations
 */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function debouncedSave(name: string, data: unknown, delayMs: number = 100): void {
  const existing = pendingTimers.get(name);
  if (existing) {
    clearTimeout(existing);
  }
  pendingTimers.set(name, setTimeout(() => {
    pendingTimers.delete(name);
    saveStore(name, data);
  }, delayMs));
}

// ==================== Slug Registry for Publishing ====================

const SLUG_REGISTRY_FILE = 'published/.slug-registry';
const RESERVED_SLUGS = new Set([
  'api', 'app', 'admin', 'www', 'docs', 'blog', 'help',
  'status', 'auth', 'login', 'signup', 'dashboard', 'settings',
]);

interface SlugRegistry {
  projectToSlug: Record<string, string>;
  slugToProject: Record<string, string>;
}

let _slugRegistry: SlugRegistry | null = null;

function ensurePublishedDir(): void {
  const publishedDir = path.join(DATA_DIR, 'published');
  if (!fs.existsSync(publishedDir)) {
    fs.mkdirSync(publishedDir, { recursive: true });
  }
}

function loadSlugRegistry(): SlugRegistry {
  if (_slugRegistry) return _slugRegistry;
  ensurePublishedDir();
  _slugRegistry = loadStore<SlugRegistry>(SLUG_REGISTRY_FILE, { projectToSlug: {}, slugToProject: {} });
  return _slugRegistry;
}

function saveSlugRegistry(): void {
  if (!_slugRegistry) return;
  ensurePublishedDir();
  saveStore(SLUG_REGISTRY_FILE, _slugRegistry);
}

/**
 * Generate a URL-safe slug from a project name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'project';
}

/**
 * Register a slug for a project. Handles collisions with auto-increment.
 * Returns the final slug.
 */
export function registerSlug(projectId: string, desiredSlug: string): string {
  const registry = loadSlugRegistry();

  // If project already has a slug, return it
  if (registry.projectToSlug[projectId]) {
    return registry.projectToSlug[projectId];
  }

  let slug = desiredSlug;
  let counter = 2;

  // Check availability: not reserved and not taken
  while (RESERVED_SLUGS.has(slug) || (registry.slugToProject[slug] && registry.slugToProject[slug] !== projectId)) {
    slug = `${desiredSlug}-${counter}`;
    counter++;
  }

  registry.projectToSlug[projectId] = slug;
  registry.slugToProject[slug] = projectId;
  saveSlugRegistry();

  return slug;
}

/**
 * Get the slug for a project, or null if not published.
 */
export function getSlugForProject(projectId: string): string | null {
  const registry = loadSlugRegistry();
  return registry.projectToSlug[projectId] || null;
}

/**
 * Remove slug registration for a project.
 */
export function unregisterSlug(projectId: string): string | null {
  const registry = loadSlugRegistry();
  const slug = registry.projectToSlug[projectId];
  if (!slug) return null;

  delete registry.projectToSlug[projectId];
  delete registry.slugToProject[slug];
  saveSlugRegistry();

  return slug;
}

/**
 * Change the slug for an already-published project.
 * Validates format, checks availability, renames the directory, and updates the registry + metadata.
 */
export function changeSlug(
  projectId: string,
  newSlug: string
): { success: boolean; slug: string; error?: string } {
  // 1. Validate slug format: lowercase, alphanumeric + hyphens, 3-50 chars, no leading/trailing hyphens
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  if (!slugRegex.test(newSlug)) {
    return {
      success: false,
      slug: newSlug,
      error: 'Invalid slug format. Must be 3-50 characters, lowercase alphanumeric and hyphens, no leading/trailing hyphens.',
    };
  }

  // 2. Check reserved slugs
  if (RESERVED_SLUGS.has(newSlug)) {
    return { success: false, slug: newSlug, error: `Slug "${newSlug}" is reserved.` };
  }

  // 3. Check if taken by another project
  const registry = loadSlugRegistry();
  const existingOwner = registry.slugToProject[newSlug];
  if (existingOwner && existingOwner !== projectId) {
    return { success: false, slug: newSlug, error: `Slug "${newSlug}" is already taken.` };
  }

  // 4. Get old slug
  const oldSlug = getSlugForProject(projectId);
  if (!oldSlug) {
    return { success: false, slug: newSlug, error: 'Project is not published.' };
  }

  // No-op if same slug
  if (oldSlug === newSlug) {
    return { success: true, slug: newSlug };
  }

  // 5. Rename directory
  const oldPath = getPublishedPath(oldSlug);
  const newPath = getPublishedPath(newSlug);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }

  // 6. Update registry
  delete registry.projectToSlug[projectId];
  delete registry.slugToProject[oldSlug];
  registry.projectToSlug[projectId] = newSlug;
  registry.slugToProject[newSlug] = projectId;
  saveSlugRegistry();

  // 7. Update .publish-meta.json
  const meta = getPublishMeta(newSlug);
  if (meta) {
    savePublishMeta(newSlug, { ...meta, slug: newSlug });
  }

  return { success: true, slug: newSlug };
}

/**
 * Get the published directory path for a slug
 */
export function getPublishedPath(slug: string): string {
  return path.join(DATA_DIR, 'published', slug);
}

/**
 * Read publish metadata for a project
 */
export function getPublishMeta(slug: string): Record<string, unknown> | null {
  const metaPath = path.join(getPublishedPath(slug), '.publish-meta.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Save publish metadata for a project
 */
export function savePublishMeta(slug: string, meta: Record<string, unknown>): void {
  const dir = getPublishedPath(slug);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, '.publish-meta.json'), JSON.stringify(meta, null, 2));
}
