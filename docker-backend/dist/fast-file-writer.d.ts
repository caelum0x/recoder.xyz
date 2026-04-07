/**
 * Fast File Writer
 *
 * Uses Docker's putArchive API (tar-based upload) instead of exec commands.
 * This is 10x faster than exec-based file writes because:
 * 1. No process spawning overhead inside the container
 * 2. Direct stream-based transfer
 * 3. No shell parsing or base64 encoding/decoding
 *
 * Performance comparison:
 * - exec-based: ~20-25 seconds per file (as seen in logs)
 * - tar-based: ~50-200ms per file
 */
/**
 * Write a single file to a container using fast tar-based upload
 *
 * @param containerId Docker container ID
 * @param filePath Path inside container (relative to target directory)
 * @param content File content
 * @param targetDir Target directory in container (default: /workspace)
 * @returns Promise resolving when write is complete
 */
export declare function fastWriteFile(containerId: string, filePath: string, content: string, targetDir?: string): Promise<void>;
/**
 * Write multiple files to a container using fast tar-based batch upload
 * This is the optimal way to write many files - single network round trip.
 *
 * @param containerId Docker container ID
 * @param files Array of { path, content } objects
 * @param targetDir Target directory in container (default: /workspace)
 * @returns Promise resolving when all files are written
 */
export declare function fastWriteFiles(containerId: string, files: Array<{
    path: string;
    content: string;
}>, targetDir?: string): Promise<void>;
/**
 * Ensure a directory exists in the container
 */
export declare function ensureDirectory(containerId: string, dirPath: string, targetDir?: string): Promise<void>;
declare const _default: {
    fastWriteFile: typeof fastWriteFile;
    fastWriteFiles: typeof fastWriteFiles;
    ensureDirectory: typeof ensureDirectory;
};
export default _default;
