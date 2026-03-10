import { handleApiError } from '../error-handler';
import { backendApi } from '../api-client';
import { parseSandboxFilesResponse } from './contracts';

export interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mod_time: string;
  permissions?: string;
}

function normalizePathWithUnicode(path: string): string {
  try {
    return path.replace(/\\u([0-9a-fA-F]{4})/g, (_, hexCode) => {
      return String.fromCharCode(parseInt(hexCode, 16));
    });
  } catch {
    return path;
  }
}

export const createSandboxFile = async (
  sandboxId: string,
  filePath: string,
  content: string,
): Promise<void> => {
  if (!sandboxId || sandboxId.trim() === '') {
    throw new Error('Sandbox ID is required');
  }
  
  try {
    const formData = new FormData();
    formData.append('path', filePath);

    const blob = new Blob([content], { type: 'application/octet-stream' });
    formData.append('file', blob, filePath.split('/').pop() || 'file');

    const response = await backendApi.upload(
      `/sandboxes/${sandboxId}/files`,
      formData,
      { showErrors: true }
    );

    if (response.error) {
      throw new Error(
        `Error creating sandbox file: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'create file', resource: `file ${filePath}` });
    throw error;
  }
};

export const createSandboxFileJson = async (
  sandboxId: string,
  filePath: string,
  content: string,
): Promise<void> => {
  if (!sandboxId || sandboxId.trim() === '') {
    throw new Error('Sandbox ID is required');
  }
  
  try {
    const response = await backendApi.post(
      `/sandboxes/${sandboxId}/files/json`,
      {
        path: filePath,
        content: content,
      },
      { showErrors: true }
    );

    if (response.error) {
      throw new Error(
        `Error creating sandbox file: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'create file', resource: `file ${filePath}` });
    throw error;
  }
};

export const listSandboxFiles = async (
  sandboxId: string,
  path: string,
): Promise<FileInfo[]> => {
  if (!sandboxId || sandboxId.trim() === '') {
    return [];
  }
  
  try {
    const normalizedPath = normalizePathWithUnicode(path);
    const response = await backendApi.get<unknown>(
      `/sandboxes/${sandboxId}/files?path=${encodeURIComponent(normalizedPath)}`,
      { showErrors: true }
    );

    if (response.error) {
      throw new Error(
        `Error listing sandbox files: ${response.error.message} (${response.error.status})`,
      );
    }

    return parseSandboxFilesResponse(response.data).files as FileInfo[];
  } catch (error) {
    throw error;
  }
};

export const getSandboxFileContent = async (
  sandboxId: string,
  path: string,
): Promise<string | Blob> => {
  if (!sandboxId || sandboxId.trim() === '') {
    throw new Error('Sandbox ID is required');
  }
  
  try {
    const normalizedPath = normalizePathWithUnicode(path);
    const response = await backendApi.get<string | Blob>(
      `/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(normalizedPath)}`,
      { showErrors: true }
    );

    if (response.error) {
      throw new Error(
        `Error getting sandbox file content: ${response.error.message} (${response.error.status})`,
      );
    }

    // backendApi handles content-type detection and returns appropriate type
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'load file content', resource: `file ${path}` });
    throw error;
  }
};

export interface TerminalExecuteResponse {
  output: string;
  exit_code: number;
  success: boolean;
}

export const executeTerminalCommand = async (
  sandboxId: string,
  command: string,
): Promise<TerminalExecuteResponse> => {
  if (!sandboxId || sandboxId.trim() === '') {
    throw new Error('Sandbox ID is required');
  }

  try {
    const response = await backendApi.post<TerminalExecuteResponse>(
      `/sandboxes/${sandboxId}/terminal/execute`,
      { command },
      { showErrors: true }
    );

    if (response.error) {
      throw new Error(
        `Error executing terminal command: ${response.error.message} (${'status' in response.error ? response.error.status : 'unknown'})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'execute terminal command', resource: `sandbox ${sandboxId}` });
    throw error;
  }
};
