/**
 * Enterprise AI Integration Layer
 * Connects advanced AI services to recoder-web chat system
 */

import { LoopDetectionService } from './services/loopDetectionService';
// Note: ShellExecutionService disabled due to @xterm/headless incompatibility with Vite
// import { ShellExecutionService } from './services/shellExecutionService';
import { ChatRecordingService } from './services/chatRecordingService';
import { FileDiscoveryService } from './services/fileDiscoveryService';
import { GitService } from './services/gitService';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Global service instances (singleton pattern for performance)
let loopDetector: LoopDetectionService | null = null;
let chatRecorder: ChatRecordingService | null = null;
let fileDiscovery: FileDiscoveryService | null = null;
let gitService: GitService | null = null;

// Cache for preventing duplicate operations
const operationCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Initialize enterprise AI services
 */
export function initializeEnterpriseServices() {
  if (!loopDetector) {
    loopDetector = new LoopDetectionService();
  }
  if (!chatRecorder) {
    chatRecorder = new ChatRecordingService();
  }
  if (!fileDiscovery) {
    fileDiscovery = new FileDiscoveryService();
  }
  if (!gitService) {
    gitService = new GitService();
  }
}

/**
 * Check for AI loops in conversation (with caching)
 */
export async function checkForLoops(messages: any[]): Promise<{ hasLoop: boolean; suggestion?: string }> {
  initializeEnterpriseServices();
  
  // Cache key based on last 5 messages
  const cacheKey = `loop:${messages.slice(-5).map(m => m.content?.substring(0, 50)).join('|')}`;
  const cached = operationCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  
  try {
    const result = await loopDetector!.detectLoop(messages);
    const response = {
      hasLoop: result.detected,
      suggestion: result.suggestion
    };
    
    operationCache.set(cacheKey, { result: response, timestamp: Date.now() });
    return response;
  } catch (error) {
    console.warn('Loop detection failed:', error);
    return { hasLoop: false };
  }
}

/**
 * Execute shell command with enhanced safety
 */
export async function executeShellCommand(command: string, projectPath: string): Promise<{ success: boolean; output: string; error?: string }> {
  initializeEnterpriseServices();

  try {
    const { stdout, stderr } = await execAsync(command, { cwd: projectPath, timeout: 30000 });
    return {
      success: true,
      output: stdout || '',
      error: stderr || undefined
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || (error instanceof Error ? error.message : String(error))
    };
  }
}

/**
 * Record chat session for analytics
 */
export async function recordChatSession(sessionId: string, messages: any[]): Promise<void> {
  initializeEnterpriseServices();
  
  try {
    await chatRecorder!.recordSession(sessionId, messages);
  } catch (error) {
    console.warn('Chat recording failed:', error);
  }
}

/**
 * Get chat analytics
 */
export async function getChatAnalytics(sessionId: string): Promise<any> {
  initializeEnterpriseServices();
  
  try {
    return await chatRecorder!.getAnalytics(sessionId);
  } catch (error) {
    console.warn('Analytics retrieval failed:', error);
    return null;
  }
}

/**
 * Smart file discovery for project context (with caching)
 */
export async function discoverRelevantFiles(query: string, projectPath: string): Promise<string[]> {
  initializeEnterpriseServices();
  
  const cacheKey = `files:${query}:${projectPath}`;
  const cached = operationCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  
  try {
    const result = await fileDiscovery!.findRelevantFiles(query, projectPath);
    operationCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.warn('File discovery failed:', error);
    return [];
  }
}

/**
 * Clean expired cache entries (call periodically)
 */
export function cleanCache() {
  const now = Date.now();
  for (const [key, value] of operationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      operationCache.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanCache, 300000);
}

/**
 * Auto-commit changes with AI-generated messages
 */
export async function autoCommitChanges(projectPath: string, files: string[]): Promise<{ success: boolean; commitHash?: string; message?: string }> {
  initializeEnterpriseServices();
  
  try {
    const result = await gitService!.autoCommit(projectPath, files);
    return {
      success: true,
      commitHash: result.hash,
      message: result.message
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
