/**
 * VS Code Language Model Selector Utilities
 * Helper functions for working with VS Code's Language Model API
 */

export interface VsCodeLanguageModel {
  id: string;
  vendor: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens?: number;
}

export interface ModelSelection {
  model: VsCodeLanguageModel;
  selector: string;
}

/**
 * Stringify VS Code Language Model selector for API usage
 */
export function stringifyVsCodeLmModelSelector(
  vendor: string,
  family: string,
  version?: string
): string {
  if (version) {
    return `${vendor}/${family}/${version}`;
  }
  return `${vendor}/${family}`;
}

/**
 * Parse VS Code Language Model selector string
 */
export function parseVsCodeLmModelSelector(selector: string): {
  vendor: string;
  family: string;
  version?: string;
} | null {
  const parts = selector.split('/');
  
  if (parts.length < 2) {
    return null;
  }
  
  return {
    vendor: parts[0],
    family: parts[1],
    version: parts[2] || undefined,
  };
}

/**
 * Get available VS Code Language Models
 * This is a placeholder - actual implementation would use VS Code API
 */
export function getAvailableVsCodeModels(): VsCodeLanguageModel[] {
  return [
    {
      id: 'gpt-4',
      vendor: 'openai',
      family: 'gpt-4',
      version: 'latest',
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
    },
    {
      id: 'gpt-3.5-turbo',
      vendor: 'openai', 
      family: 'gpt-3.5-turbo',
      version: 'latest',
      maxInputTokens: 16384,
      maxOutputTokens: 4096,
    },
  ];
}

/**
 * Validate VS Code Language Model selector
 */
export function isValidVsCodeLmSelector(selector: string): boolean {
  const parsed = parseVsCodeLmModelSelector(selector);
  return parsed !== null && parsed.vendor.length > 0 && parsed.family.length > 0;
}

/**
 * Get best matching VS Code Language Model
 */
export function getBestVsCodeLmMatch(
  preferredVendor?: string,
  preferredFamily?: string
): VsCodeLanguageModel | null {
  const available = getAvailableVsCodeModels();
  
  if (!available.length) {
    return null;
  }
  
  // Try to find exact match
  if (preferredVendor && preferredFamily) {
    const exact = available.find(
      m => m.vendor === preferredVendor && m.family === preferredFamily
    );
    if (exact) return exact;
  }
  
  // Try to find vendor match
  if (preferredVendor) {
    const vendorMatch = available.find(m => m.vendor === preferredVendor);
    if (vendorMatch) return vendorMatch;
  }
  
  // Return first available
  return available[0];
}