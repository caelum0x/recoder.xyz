/**
 * File Operations Service
 * Handles file CRUD operations with Docker backend
 * Auto-snapshots before destructive operations
 */

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

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
    const response = await fetch(`${DOCKER_URL}/api/file/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

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
    const response = await fetch(`${DOCKER_URL}/api/folder/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

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
    const response = await fetch(`${DOCKER_URL}/api/file/${projectId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

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
    const response = await fetch(`${DOCKER_URL}/api/file/${projectId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

    return { success: true };
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
