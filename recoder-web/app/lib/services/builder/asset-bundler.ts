/**
 * Asset Bundler Service
 *
 * Handles asset bundling, optimization, and manifest generation
 * for production deployments.
 */

import { dockerPost } from '../docker-api';

// ============================================
// Types
// ============================================

export interface AssetBundle {
  /** Bundle file path */
  path: string;
  /** Original file paths included */
  sources: string[];
  /** Bundle size in bytes */
  size: number;
  /** Content hash */
  hash: string;
  /** Bundle type */
  type: 'js' | 'css' | 'image' | 'font' | 'other';
  /** Whether this is a chunk */
  isChunk?: boolean;
  /** Whether this is an entry point */
  isEntry?: boolean;
  /** Dependencies (other bundle paths) */
  dependencies?: string[];
}

export interface AssetManifest {
  /** Manifest version */
  version: string;
  /** Build timestamp */
  buildTime: string;
  /** Entry points */
  entries: Record<string, string>;
  /** All assets keyed by original path */
  assets: Record<
    string,
    {
      path: string;
      hash: string;
      size: number;
      type: string;
    }
  >;
  /** CSS files */
  css: string[];
  /** JavaScript files */
  js: string[];
  /** Preload links */
  preload: string[];
  /** Total bundle size */
  totalSize: number;
}

export interface AssetStats {
  /** Total number of assets */
  totalAssets: number;
  /** Total size in bytes */
  totalSize: number;
  /** Size by type */
  byType: Record<string, { count: number; size: number }>;
  /** Largest assets */
  largest: Array<{ path: string; size: number }>;
  /** Compression savings */
  compressionSavings?: {
    gzip: number;
    brotli: number;
  };
}

export interface AssetOptimizationOptions {
  /** Enable JavaScript minification */
  minifyJs?: boolean;
  /** Enable CSS minification */
  minifyCss?: boolean;
  /** Enable HTML minification */
  minifyHtml?: boolean;
  /** Enable image optimization */
  optimizeImages?: boolean;
  /** Image quality (0-100) */
  imageQuality?: number;
  /** Maximum image dimensions */
  maxImageDimension?: number;
  /** Inline assets smaller than this (bytes) */
  inlineThreshold?: number;
  /** Generate preload hints */
  generatePreload?: boolean;
  /** Hash filenames */
  hashFilenames?: boolean;
  /** Hash length */
  hashLength?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_OPTIMIZATION_OPTIONS: AssetOptimizationOptions = {
  minifyJs: true,
  minifyCss: true,
  minifyHtml: true,
  optimizeImages: true,
  imageQuality: 85,
  maxImageDimension: 2048,
  inlineThreshold: 4096, // 4KB
  generatePreload: true,
  hashFilenames: true,
  hashLength: 8,
};

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.map': 'application/json',
};

// ============================================
// Asset Bundling
// ============================================

/**
 * Bundle assets from a build output directory
 */
export async function bundleAssets(
  projectId: string,
  options: {
    inputDir?: string;
    outputDir?: string;
    optimization?: Partial<AssetOptimizationOptions>;
  } = {}
): Promise<{
  success: boolean;
  bundles: AssetBundle[];
  manifest: AssetManifest;
  errors: string[];
}> {
  const inputDir = options.inputDir || 'dist';
  const outputDir = options.outputDir || inputDir;
  const optOptions = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options.optimization };

  try {
    // List all files in the build directory
    const listResult = await dockerPost<{
      success: boolean;
      files: Array<{
        path: string;
        size: number;
        isDirectory: boolean;
      }>;
      error?: string;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: inputDir }
    );

    if (!listResult.success) {
      return {
        success: false,
        bundles: [],
        manifest: createEmptyManifest(),
        errors: [listResult.error || 'Failed to list build files'],
      };
    }

    const files = listResult.files.filter((f) => !f.isDirectory);
    const bundles: AssetBundle[] = [];
    const errors: string[] = [];

    // Process each file
    for (const file of files) {
      try {
        const bundle = await processAssetFile(
          projectId,
          file.path,
          file.size,
          optOptions
        );
        if (bundle) {
          bundles.push(bundle);
        }
      } catch (error) {
        errors.push(`Failed to process ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Generate manifest
    const manifest = await generateManifest(projectId, bundles, inputDir);

    return {
      success: errors.length === 0,
      bundles,
      manifest,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      bundles: [],
      manifest: createEmptyManifest(),
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Process a single asset file
 */
async function processAssetFile(
  projectId: string,
  filePath: string,
  size: number,
  _options: AssetOptimizationOptions
): Promise<AssetBundle | null> {
  const ext = getExtension(filePath);
  const type = getAssetType(ext);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Calculate hash
  let hash = '';
  try {
    const hashResult = await dockerPost<{
      success: boolean;
      hash: string;
    }>(
      `/api/files/${projectId}/hash`,
      { path: filePath, algorithm: 'sha256' }
    );
    hash = hashResult.success ? hashResult.hash.slice(0, 8) : '';
  } catch {
    // Use size-based hash as fallback
    hash = size.toString(16).padStart(8, '0');
  }

  return {
    path: filePath,
    sources: [filePath],
    size,
    hash,
    type,
    isEntry: isEntryPoint(filePath),
    isChunk: isChunkFile(filePath),
  };
}

/**
 * Optimize assets in a directory
 */
export async function optimizeAssets(
  projectId: string,
  options: AssetOptimizationOptions = {}
): Promise<{
  success: boolean;
  optimized: Array<{
    path: string;
    originalSize: number;
    optimizedSize: number;
    savings: number;
  }>;
  errors: string[];
}> {
  const opts = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options };
  const optimized: Array<{
    path: string;
    originalSize: number;
    optimizedSize: number;
    savings: number;
  }> = [];
  const errors: string[] = [];

  try {
    // Get all files
    const listResult = await dockerPost<{
      success: boolean;
      files: Array<{ path: string; size: number }>;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: 'dist' }
    );

    if (!listResult.success) {
      return { success: false, optimized, errors: ['Failed to list files'] };
    }

    for (const file of listResult.files) {
      const ext = getExtension(file.path);
      const originalSize = file.size;
      let newSize = originalSize;

      // Minify JavaScript
      if (opts.minifyJs && (ext === '.js' || ext === '.mjs')) {
        const result = await minifyWithEsbuild(projectId, file.path, 'js');
        if (result.success && result.size) {
          newSize = result.size;
        } else if (result.error) {
          errors.push(result.error);
        }
      }

      // Minify CSS
      if (opts.minifyCss && ext === '.css') {
        const result = await minifyWithEsbuild(projectId, file.path, 'css');
        if (result.success && result.size) {
          newSize = result.size;
        } else if (result.error) {
          errors.push(result.error);
        }
      }

      if (newSize < originalSize) {
        optimized.push({
          path: file.path,
          originalSize,
          optimizedSize: newSize,
          savings: originalSize - newSize,
        });
      }
    }

    return {
      success: errors.length === 0,
      optimized,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      optimized,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Minify a file using esbuild
 */
async function minifyWithEsbuild(
  projectId: string,
  filePath: string,
  type: 'js' | 'css'
): Promise<{ success: boolean; size?: number; error?: string }> {
  try {
    const loader = type === 'css' ? '--loader=css' : '--loader=js';
    const command = `npx esbuild ${filePath} --minify ${loader} --outfile=${filePath} --allow-overwrite`;

    const result = await dockerPost<{
      success: boolean;
      output: string;
      error?: string;
    }>(
      `/api/shell/${projectId}`,
      { command, timeout: 30000 }
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Get new size
    const statResult = await dockerPost<{
      success: boolean;
      size: number;
    }>(
      `/api/files/${projectId}/stat`,
      { path: filePath }
    );

    return {
      success: true,
      size: statResult.success ? statResult.size : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Hash asset filenames for cache busting
 */
export async function hashAssets(
  projectId: string,
  inputDir: string = 'dist',
  options: { hashLength?: number } = {}
): Promise<{
  success: boolean;
  renamed: Array<{ original: string; hashed: string }>;
  errors: string[];
}> {
  const hashLength = options.hashLength || 8;
  const renamed: Array<{ original: string; hashed: string }> = [];
  const errors: string[] = [];

  try {
    const listResult = await dockerPost<{
      success: boolean;
      files: Array<{ path: string; size: number }>;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: inputDir }
    );

    if (!listResult.success) {
      return { success: false, renamed, errors: ['Failed to list files'] };
    }

    for (const file of listResult.files) {
      const ext = getExtension(file.path);

      // Only hash JS, CSS, and asset files
      if (!['.js', '.mjs', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        continue;
      }

      // Don't hash files that already have hashes
      if (/\.[a-f0-9]{6,}\.[a-z]+$/i.test(file.path)) {
        continue;
      }

      try {
        // Get file hash
        const hashResult = await dockerPost<{
          success: boolean;
          hash: string;
        }>(
          `/api/files/${projectId}/hash`,
          { path: file.path, algorithm: 'sha256' }
        );

        if (!hashResult.success) continue;

        const hash = hashResult.hash.slice(0, hashLength);
        const dirName = file.path.substring(0, file.path.lastIndexOf('/'));
        const baseName = file.path.substring(file.path.lastIndexOf('/') + 1);
        const nameWithoutExt = baseName.substring(0, baseName.lastIndexOf('.'));
        const newName = `${dirName}/${nameWithoutExt}.${hash}${ext}`;

        // Rename file
        const renameResult = await dockerPost<{ success: boolean }>(
          `/api/files/${projectId}/rename`,
          { from: file.path, to: newName }
        );

        if (renameResult.success) {
          renamed.push({ original: file.path, hashed: newName });
        }
      } catch (error) {
        errors.push(`Failed to hash ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      renamed,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      renamed,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Generate an asset manifest
 */
export async function generateManifest(
  projectId: string,
  bundles: AssetBundle[],
  baseDir: string = 'dist'
): Promise<AssetManifest> {
  const entries: Record<string, string> = {};
  const assets: Record<string, { path: string; hash: string; size: number; type: string }> = {};
  const cssFiles: string[] = [];
  const jsFiles: string[] = [];
  const preload: string[] = [];
  let totalSize = 0;

  for (const bundle of bundles) {
    const relativePath = bundle.path.replace(`${baseDir}/`, '');

    // Add to assets
    assets[relativePath] = {
      path: bundle.path,
      hash: bundle.hash,
      size: bundle.size,
      type: bundle.type,
    };

    totalSize += bundle.size;

    // Categorize by type
    if (bundle.type === 'css') {
      cssFiles.push(relativePath);
    } else if (bundle.type === 'js') {
      jsFiles.push(relativePath);

      // Add entry points
      if (bundle.isEntry) {
        const name = relativePath.replace(/\.[a-f0-9]+\.js$/, '').replace(/\.js$/, '');
        entries[name] = relativePath;
      }

      // Add preload hints for important chunks
      if (bundle.isEntry || bundle.path.includes('vendor')) {
        preload.push(relativePath);
      }
    }
  }

  // Write manifest file
  const manifest: AssetManifest = {
    version: '1.0.0',
    buildTime: new Date().toISOString(),
    entries,
    assets,
    css: cssFiles,
    js: jsFiles,
    preload,
    totalSize,
  };

  try {
    await dockerPost(
      `/api/files/${projectId}/write`,
      {
        path: `${baseDir}/manifest.json`,
        content: JSON.stringify(manifest, null, 2),
      }
    );
  } catch {
    // Ignore write errors
  }

  return manifest;
}

/**
 * Get asset statistics
 */
export async function getAssetStats(
  projectId: string,
  inputDir: string = 'dist'
): Promise<AssetStats> {
  try {
    const listResult = await dockerPost<{
      success: boolean;
      files: Array<{ path: string; size: number }>;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: inputDir }
    );

    if (!listResult.success) {
      return createEmptyStats();
    }

    const files = listResult.files;
    const byType: Record<string, { count: number; size: number }> = {};
    let totalSize = 0;

    for (const file of files) {
      const ext = getExtension(file.path);
      const type = getAssetType(ext);

      if (!byType[type]) {
        byType[type] = { count: 0, size: 0 };
      }

      byType[type].count++;
      byType[type].size += file.size;
      totalSize += file.size;
    }

    // Find largest assets
    const largest = files
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((f) => ({ path: f.path, size: f.size }));

    return {
      totalAssets: files.length,
      totalSize,
      byType,
      largest,
    };
  } catch {
    return createEmptyStats();
  }
}

/**
 * Compress assets using gzip and brotli
 */
export async function compressAssets(
  projectId: string,
  inputDir: string = 'dist',
  options: { gzip?: boolean; brotli?: boolean } = {}
): Promise<{
  success: boolean;
  compressed: Array<{
    path: string;
    originalSize: number;
    gzipSize?: number;
    brotliSize?: number;
  }>;
  errors: string[];
}> {
  const doGzip = options.gzip ?? true;
  const doBrotli = options.brotli ?? true;
  const compressed: Array<{
    path: string;
    originalSize: number;
    gzipSize?: number;
    brotliSize?: number;
  }> = [];
  const errors: string[] = [];

  try {
    const listResult = await dockerPost<{
      success: boolean;
      files: Array<{ path: string; size: number }>;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: inputDir }
    );

    if (!listResult.success) {
      return { success: false, compressed, errors: ['Failed to list files'] };
    }

    // Only compress text-based files
    const compressibleExts = ['.js', '.mjs', '.css', '.html', '.json', '.svg', '.xml', '.txt'];

    for (const file of listResult.files) {
      const ext = getExtension(file.path);

      if (!compressibleExts.includes(ext)) {
        continue;
      }

      const entry: typeof compressed[0] = {
        path: file.path,
        originalSize: file.size,
      };

      try {
        // Gzip compression
        if (doGzip) {
          const gzipResult = await dockerPost<{
            success: boolean;
            output: string;
          }>(
            `/api/shell/${projectId}`,
            {
              command: `gzip -kf9 "${file.path}" && stat -f%z "${file.path}.gz" 2>/dev/null || stat -c%s "${file.path}.gz"`,
              timeout: 30000,
            }
          );

          if (gzipResult.success) {
            const sizeMatch = gzipResult.output.match(/(\d+)/);
            if (sizeMatch) {
              entry.gzipSize = parseInt(sizeMatch[1], 10);
            }
          }
        }

        // Brotli compression
        if (doBrotli) {
          const brotliResult = await dockerPost<{
            success: boolean;
            output: string;
          }>(
            `/api/shell/${projectId}`,
            {
              command: `brotli -kf9 "${file.path}" 2>/dev/null && stat -f%z "${file.path}.br" 2>/dev/null || stat -c%s "${file.path}.br" 2>/dev/null || echo ""`,
              timeout: 30000,
            }
          );

          if (brotliResult.success && brotliResult.output.trim()) {
            const sizeMatch = brotliResult.output.match(/(\d+)/);
            if (sizeMatch) {
              entry.brotliSize = parseInt(sizeMatch[1], 10);
            }
          }
        }

        if (entry.gzipSize || entry.brotliSize) {
          compressed.push(entry);
        }
      } catch (error) {
        errors.push(`Failed to compress ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      compressed,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      compressed,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================
// Helper Functions
// ============================================

function getExtension(path: string): string {
  const match = path.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

function getAssetType(ext: string): 'js' | 'css' | 'image' | 'font' | 'other' {
  if (['.js', '.mjs', '.cjs'].includes(ext)) return 'js';
  if (ext === '.css') return 'css';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) return 'font';
  return 'other';
}

function isEntryPoint(path: string): boolean {
  const name = path.split('/').pop() || '';
  return (
    name.startsWith('index.') ||
    name.startsWith('main.') ||
    name.includes('.entry.')
  );
}

function isChunkFile(path: string): boolean {
  const name = path.split('/').pop() || '';
  return (
    name.includes('.chunk.') ||
    name.includes('-chunk.') ||
    /\.[a-f0-9]{6,}\.(js|css)$/.test(name)
  );
}

function createEmptyManifest(): AssetManifest {
  return {
    version: '1.0.0',
    buildTime: new Date().toISOString(),
    entries: {},
    assets: {},
    css: [],
    js: [],
    preload: [],
    totalSize: 0,
  };
}

function createEmptyStats(): AssetStats {
  return {
    totalAssets: 0,
    totalSize: 0,
    byType: {},
    largest: [],
  };
}
