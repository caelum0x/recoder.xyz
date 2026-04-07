"use strict";
/**
 * Simple JSON file persistence utility
 * Provides load/save with atomic writes and debounced saving
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStore = loadStore;
exports.saveStore = saveStore;
exports.debouncedSave = debouncedSave;
exports.generateSlug = generateSlug;
exports.registerSlug = registerSlug;
exports.getSlugForProject = getSlugForProject;
exports.unregisterSlug = unregisterSlug;
exports.changeSlug = changeSlug;
exports.getPublishedPath = getPublishedPath;
exports.getPublishMeta = getPublishMeta;
exports.savePublishMeta = savePublishMeta;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = process.env.DATA_DIR || path_1.default.join(process.cwd(), 'data');
// Ensure data directory exists
if (!fs_1.default.existsSync(DATA_DIR)) {
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
function loadStore(name, defaultValue) {
    const filePath = path_1.default.join(DATA_DIR, `${name}.json`);
    try {
        if (fs_1.default.existsSync(filePath)) {
            return JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        }
    }
    catch (e) {
        console.error(`[persistence] Failed to load ${name}:`, e);
    }
    return defaultValue;
}
function saveStore(name, data) {
    const filePath = path_1.default.join(DATA_DIR, `${name}.json`);
    const tmpPath = filePath + '.tmp';
    try {
        fs_1.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs_1.default.renameSync(tmpPath, filePath); // atomic write
    }
    catch (e) {
        console.error(`[persistence] Failed to save ${name}:`, e);
    }
}
/**
 * Create a debounced save function to avoid excessive writes during burst operations
 */
const pendingTimers = new Map();
function debouncedSave(name, data, delayMs = 100) {
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
let _slugRegistry = null;
function ensurePublishedDir() {
    const publishedDir = path_1.default.join(DATA_DIR, 'published');
    if (!fs_1.default.existsSync(publishedDir)) {
        fs_1.default.mkdirSync(publishedDir, { recursive: true });
    }
}
function loadSlugRegistry() {
    if (_slugRegistry)
        return _slugRegistry;
    ensurePublishedDir();
    _slugRegistry = loadStore(SLUG_REGISTRY_FILE, { projectToSlug: {}, slugToProject: {} });
    return _slugRegistry;
}
function saveSlugRegistry() {
    if (!_slugRegistry)
        return;
    ensurePublishedDir();
    saveStore(SLUG_REGISTRY_FILE, _slugRegistry);
}
/**
 * Generate a URL-safe slug from a project name
 */
function generateSlug(name) {
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
function registerSlug(projectId, desiredSlug) {
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
function getSlugForProject(projectId) {
    const registry = loadSlugRegistry();
    return registry.projectToSlug[projectId] || null;
}
/**
 * Remove slug registration for a project.
 */
function unregisterSlug(projectId) {
    const registry = loadSlugRegistry();
    const slug = registry.projectToSlug[projectId];
    if (!slug)
        return null;
    delete registry.projectToSlug[projectId];
    delete registry.slugToProject[slug];
    saveSlugRegistry();
    return slug;
}
/**
 * Change the slug for an already-published project.
 * Validates format, checks availability, renames the directory, and updates the registry + metadata.
 */
function changeSlug(projectId, newSlug) {
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
    if (fs_1.default.existsSync(oldPath)) {
        fs_1.default.renameSync(oldPath, newPath);
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
function getPublishedPath(slug) {
    return path_1.default.join(DATA_DIR, 'published', slug);
}
/**
 * Read publish metadata for a project
 */
function getPublishMeta(slug) {
    const metaPath = path_1.default.join(getPublishedPath(slug), '.publish-meta.json');
    try {
        if (fs_1.default.existsSync(metaPath)) {
            return JSON.parse(fs_1.default.readFileSync(metaPath, 'utf-8'));
        }
    }
    catch {
        // ignore
    }
    return null;
}
/**
 * Save publish metadata for a project
 */
function savePublishMeta(slug, meta) {
    const dir = getPublishedPath(slug);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    fs_1.default.writeFileSync(path_1.default.join(dir, '.publish-meta.json'), JSON.stringify(meta, null, 2));
}
