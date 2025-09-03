import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Code processing utilities - interface for chat components
interface CodeFencePart {
  type: 'text' | 'first-code-fence' | 'first-code-fence-generating';
  content: string;
  language?: string;
  filename?: {
    name: string;
    extension: string;
  };
}

export function splitByFirstCodeFence(content: string): CodeFencePart[] {
  const parts: CodeFencePart[] = [];
  
  // Match code blocks with optional language and filename
  const codeBlockRegex = /```(\w*)?(?:\s*(?:\/\/|#)\s*filename:\s*([^\n]+))?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  let isFirstCodeBlock = true;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block if any
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (textContent.trim()) {
        parts.push({
          type: 'text',
          content: textContent
        });
      }
    }
    
    const [, language = '', filenameComment = '', code = ''] = match;
    
    // Parse filename from comment or generate from language
    let filename = { name: 'code', extension: language || 'txt' };
    if (filenameComment.trim()) {
      const fullFilename = filenameComment.trim();
      const lastDotIndex = fullFilename.lastIndexOf('.');
      if (lastDotIndex > 0) {
        filename = {
          name: fullFilename.substring(0, lastDotIndex),
          extension: fullFilename.substring(lastDotIndex + 1)
        };
      } else {
        filename = { name: fullFilename, extension: language || 'txt' };
      }
    } else if (language) {
      // Generate filename based on language
      const extensions: { [key: string]: string } = {
        'javascript': 'js',
        'typescript': 'ts',
        'jsx': 'jsx',
        'tsx': 'tsx',
        'python': 'py',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'sql': 'sql',
        'bash': 'sh',
        'shell': 'sh'
      };
      filename = {
        name: 'main',
        extension: extensions[language.toLowerCase()] || language
      };
    }
    
    // Determine if this is being generated (incomplete code block)
    const isGenerating = content.length === match.index + match[0].length && 
                        content.endsWith('```') === false;
    
    parts.push({
      type: isFirstCodeBlock ? (isGenerating ? 'first-code-fence-generating' : 'first-code-fence') : 'first-code-fence',
      content: code,
      language: language || 'text',
      filename
    });
    
    isFirstCodeBlock = false;
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last code block
  if (lastIndex < content.length) {
    const remainingContent = content.slice(lastIndex);
    if (remainingContent.trim()) {
      parts.push({
        type: 'text',
        content: remainingContent
      });
    }
  }
  
  // If no code blocks found, return the entire content as text
  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content
    });
  }
  
  return parts;
}

interface CodeBlock {
  code: string;
  language: string;
  filename?: {
    name: string;
    extension: string;
  };
}

export function extractFirstCodeBlock(content: string): CodeBlock {
  const match = content.match(/```(\w*)?(?:\s*(?:\/\/|#)\s*filename:\s*([^\n]+))?\n?([\s\S]*?)```/);
  
  if (!match) {
    return { code: '', language: '' };
  }
  
  const [, language = '', filenameComment = '', code = ''] = match;
  
  // Parse filename from comment or generate from language
  let filename: { name: string; extension: string } | undefined;
  if (filenameComment.trim()) {
    const fullFilename = filenameComment.trim();
    const lastDotIndex = fullFilename.lastIndexOf('.');
    if (lastDotIndex > 0) {
      filename = {
        name: fullFilename.substring(0, lastDotIndex),
        extension: fullFilename.substring(lastDotIndex + 1)
      };
    } else {
      filename = { name: fullFilename, extension: language || 'txt' };
    }
  } else if (language) {
    // Generate filename based on language
    const extensions: { [key: string]: string } = {
      'javascript': 'js',
      'typescript': 'ts',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'python': 'py',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'sql': 'sql',
      'bash': 'sh',
      'shell': 'sh'
    };
    filename = {
      name: 'main',
      extension: extensions[language.toLowerCase()] || language
    };
  }
  
  return {
    language: language || 'text',
    code: code,
    filename
  };
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format duration in milliseconds to human readable
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Generate random ID
export function generateId(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
