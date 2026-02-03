/**
 * File Operations Service
 * Handles file CRUD operations with Docker backend
 * Auto-snapshots before destructive operations
 */

import { dockerPost, dockerDelete, dockerPut } from './docker-api';

export interface FileOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Create a new file
 */
export async function createFile(
  projectId: string,
  path: string,
  content: string = ''
): Promise<FileOperationResult> {
  try {
    await dockerPost<void>(`/api/file/${projectId}`, { path, content });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create a new folder
 */
export async function createFolder(
  projectId: string,
  path: string
): Promise<FileOperationResult> {
  try {
    await dockerPost<void>(`/api/folder/${projectId}`, { path });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a file or folder
 */
export async function deleteFile(
  projectId: string,
  path: string
): Promise<FileOperationResult> {
  try {
    await dockerDelete<void>(`/api/file/${projectId}`, { path });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Rename/move a file or folder
 */
export async function renameFile(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<FileOperationResult> {
  try {
    await dockerPut<void>(`/api/file/${projectId}/rename`, { oldPath, newPath });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Extended result for move operations that includes the new path
 */
export interface MoveFileResult extends FileOperationResult {
  newPath?: string;
}

/**
 * Move a file or folder to a new location
 * This is essentially a rename operation with a different destination folder
 */
export async function moveFile(
  projectId: string,
  sourcePath: string,
  destinationFolder: string
): Promise<MoveFileResult> {
  // Extract the file/folder name from the source path
  const name = sourcePath.split('/').pop() || '';
  // Construct the new path
  const newPath = destinationFolder === '/' ? `/${name}` : `${destinationFolder}/${name}`;

  try {
    await dockerPut<void>(`/api/file/${projectId}/rename`, { oldPath: sourcePath, newPath });
    return { success: true, newPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Copy file path to clipboard
 */
export async function copyFilePath(path: string): Promise<void> {
  await navigator.clipboard.writeText(path);
}
