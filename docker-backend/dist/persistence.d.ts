/**
 * Simple JSON file persistence utility
 * Provides load/save with atomic writes and debounced saving
 */
export declare function loadStore<T>(name: string, defaultValue: T): T;
export declare function saveStore(name: string, data: unknown): void;
export declare function debouncedSave(name: string, data: unknown, delayMs?: number): void;
/**
 * Generate a URL-safe slug from a project name
 */
export declare function generateSlug(name: string): string;
/**
 * Register a slug for a project. Handles collisions with auto-increment.
 * Returns the final slug.
 */
export declare function registerSlug(projectId: string, desiredSlug: string): string;
/**
 * Get the slug for a project, or null if not published.
 */
export declare function getSlugForProject(projectId: string): string | null;
/**
 * Remove slug registration for a project.
 */
export declare function unregisterSlug(projectId: string): string | null;
/**
 * Change the slug for an already-published project.
 * Validates format, checks availability, renames the directory, and updates the registry + metadata.
 */
export declare function changeSlug(projectId: string, newSlug: string): {
    success: boolean;
    slug: string;
    error?: string;
};
/**
 * Get the published directory path for a slug
 */
export declare function getPublishedPath(slug: string): string;
/**
 * Read publish metadata for a project
 */
export declare function getPublishMeta(slug: string): Record<string, unknown> | null;
/**
 * Save publish metadata for a project
 */
export declare function savePublishMeta(slug: string, meta: Record<string, unknown>): void;
