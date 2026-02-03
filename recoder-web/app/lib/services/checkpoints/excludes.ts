/**
 * Exclude Patterns for Shadow Git Checkpoints
 *
 * These patterns define files and directories that should be excluded from
 * checkpoint snapshots. This helps reduce storage size and avoid tracking
 * generated or temporary files.
 */

import fs from 'fs/promises';
import { join } from 'path';

/**
 * Check if a file exists at the given path
 */
async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build artifact patterns - directories generated during build processes
 */
const getBuildArtifactPatterns = (): string[] => [
  '.gradle/',
  '.idea/',
  '.parcel-cache/',
  '.pytest_cache/',
  '.next/',
  '.nuxt/',
  '.sass-cache/',
  '.terraform/',
  '.terragrunt-cache/',
  '.vs/',
  '.vscode/',
  'Pods/',
  '__pycache__/',
  'bin/',
  'build/',
  'bundle/',
  'coverage/',
  'deps/',
  'dist/',
  'env/',
  'node_modules/',
  'obj/',
  'out/',
  'pkg/',
  'pycache/',
  'target/dependency/',
  'temp/',
  'vendor/',
  'venv/',
];

/**
 * Media file patterns - images, videos, and audio files
 */
const getMediaFilePatterns = (): string[] => [
  '*.jpg',
  '*.jpeg',
  '*.png',
  '*.gif',
  '*.bmp',
  '*.ico',
  '*.webp',
  '*.tiff',
  '*.tif',
  '*.raw',
  '*.heic',
  '*.avif',
  '*.eps',
  '*.psd',
  '*.3gp',
  '*.aac',
  '*.aiff',
  '*.asf',
  '*.avi',
  '*.divx',
  '*.flac',
  '*.m4a',
  '*.m4v',
  '*.mkv',
  '*.mov',
  '*.mp3',
  '*.mp4',
  '*.mpeg',
  '*.mpg',
  '*.ogg',
  '*.opus',
  '*.rm',
  '*.rmvb',
  '*.vob',
  '*.wav',
  '*.webm',
  '*.wma',
  '*.wmv',
];

/**
 * Cache file patterns - temporary and cache files
 */
const getCacheFilePatterns = (): string[] => [
  '*.DS_Store',
  '*.bak',
  '*.cache',
  '*.crdownload',
  '*.dmp',
  '*.dump',
  '*.eslintcache',
  '*.lock',
  '*.log',
  '*.old',
  '*.part',
  '*.partial',
  '*.pyc',
  '*.pyo',
  '*.stackdump',
  '*.swo',
  '*.swp',
  '*.temp',
  '*.tmp',
  '*.Thumbs.db',
];

/**
 * Config file patterns - environment and configuration files
 */
const getConfigFilePatterns = (): string[] => [
  '*.env*',
  '*.local',
  '*.development',
  '*.production',
];

/**
 * Large data file patterns - archives and binary files
 */
const getLargeDataFilePatterns = (): string[] => [
  '*.zip',
  '*.tar',
  '*.gz',
  '*.rar',
  '*.7z',
  '*.iso',
  '*.bin',
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.dat',
  '*.dmg',
  '*.msi',
];

/**
 * Database file patterns
 */
const getDatabaseFilePatterns = (): string[] => [
  '*.arrow',
  '*.accdb',
  '*.aof',
  '*.avro',
  '*.bak',
  '*.bson',
  '*.csv',
  '*.db',
  '*.dbf',
  '*.dmp',
  '*.frm',
  '*.ibd',
  '*.mdb',
  '*.myd',
  '*.myi',
  '*.orc',
  '*.parquet',
  '*.pdb',
  '*.rdb',
  '*.sql',
  '*.sqlite',
];

/**
 * Geospatial file patterns
 */
const getGeospatialPatterns = (): string[] => [
  '*.shp',
  '*.shx',
  '*.dbf',
  '*.prj',
  '*.sbn',
  '*.sbx',
  '*.shp.xml',
  '*.cpg',
  '*.gdb',
  '*.mdb',
  '*.gpkg',
  '*.kml',
  '*.kmz',
  '*.gml',
  '*.geojson',
  '*.dem',
  '*.asc',
  '*.img',
  '*.ecw',
  '*.las',
  '*.laz',
  '*.mxd',
  '*.qgs',
  '*.grd',
  '*.csv',
  '*.dwg',
  '*.dxf',
];

/**
 * Log file patterns
 */
const getLogFilePatterns = (): string[] => [
  '*.error',
  '*.log',
  '*.logs',
  '*.npm-debug.log*',
  '*.out',
  '*.stdout',
  'yarn-debug.log*',
  'yarn-error.log*',
];

/**
 * Get LFS patterns from .gitattributes if present
 */
const getLfsPatterns = async (workspacePath: string): Promise<string[]> => {
  try {
    const attributesPath = join(workspacePath, '.gitattributes');

    if (await fileExistsAtPath(attributesPath)) {
      const content = await fs.readFile(attributesPath, 'utf8');
      return content
        .split('\n')
        .filter((line) => line.includes('filter=lfs'))
        .map((line) => line.split(' ')[0].trim());
    }
  } catch (error) {
    // Silently ignore errors reading .gitattributes
  }

  return [];
};

/**
 * Get all exclude patterns for the shadow git repository
 *
 * @param workspacePath - Path to the workspace being tracked
 * @returns Array of exclude patterns to write to .git/info/exclude
 */
export const getExcludePatterns = async (workspacePath: string): Promise<string[]> => [
  // Always exclude the .git directory
  '.git/',
  // Build artifacts
  ...getBuildArtifactPatterns(),
  // Media files
  ...getMediaFilePatterns(),
  // Cache files
  ...getCacheFilePatterns(),
  // Config files (may contain secrets)
  ...getConfigFilePatterns(),
  // Large data files
  ...getLargeDataFilePatterns(),
  // Database files
  ...getDatabaseFilePatterns(),
  // Geospatial files
  ...getGeospatialPatterns(),
  // Log files
  ...getLogFilePatterns(),
  // LFS patterns from workspace
  ...(await getLfsPatterns(workspacePath)),
];

/**
 * Check if a file path matches any exclude pattern
 *
 * @param filePath - File path to check
 * @param patterns - Array of exclude patterns
 * @returns True if the file should be excluded
 */
export function shouldExclude(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    // Directory pattern
    if (pattern.endsWith('/')) {
      const dirName = pattern.slice(0, -1);
      if (
        normalizedPath.includes(`/${dirName}/`) ||
        normalizedPath.startsWith(`${dirName}/`) ||
        normalizedPath === dirName
      ) {
        return true;
      }
    }
    // Glob pattern with *
    else if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') +
          '$'
      );
      const fileName = normalizedPath.split('/').pop() || '';
      if (regex.test(fileName) || regex.test(normalizedPath)) {
        return true;
      }
    }
    // Exact match
    else if (normalizedPath === pattern || normalizedPath.endsWith(`/${pattern}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter a list of file paths to exclude unwanted files
 *
 * @param filePaths - Array of file paths
 * @param patterns - Array of exclude patterns
 * @returns Filtered array of file paths
 */
export function filterExcludedFiles(filePaths: string[], patterns: string[]): string[] {
  return filePaths.filter((filePath) => !shouldExclude(filePath, patterns));
}

/**
 * Get common patterns that should always be excluded
 */
export function getAlwaysExcludedPatterns(): string[] {
  return [
    '.git/',
    'node_modules/',
    '__pycache__/',
    '.DS_Store',
    '*.pyc',
    '*.pyo',
    '*.log',
    '*.tmp',
    '*.temp',
    '*.swp',
    '*.swo',
  ];
}

/**
 * Merge user-defined exclude patterns with defaults
 *
 * @param userPatterns - User-defined patterns
 * @param workspacePath - Workspace path for LFS detection
 * @returns Combined array of exclude patterns
 */
export async function mergeExcludePatterns(
  userPatterns: string[],
  workspacePath: string
): Promise<string[]> {
  const defaultPatterns = await getExcludePatterns(workspacePath);
  const combined = new Set([...defaultPatterns, ...userPatterns]);
  return Array.from(combined);
}
