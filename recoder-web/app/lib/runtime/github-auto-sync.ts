function getChatIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
  return match ? match[1] : null;
}

// Cache connection status to avoid repeated failed requests
let connectionStatusCache: { chatId: string; connected: boolean; autoSync: boolean; branch?: string; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds

// Debounce pending files
let pendingFiles: Map<string, { path: string; content: string }> = new Map();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000; // Wait 2 seconds after last file change

async function getConnectionStatus(chatId: string): Promise<{ connected: boolean; autoSync: boolean; branch?: string }> {
  // Return cached status if fresh
  if (connectionStatusCache && 
      connectionStatusCache.chatId === chatId && 
      Date.now() - connectionStatusCache.timestamp < CACHE_TTL) {
    return connectionStatusCache;
  }

  try {
    const response = await fetch(`/api/chat/${chatId}/github?action=status`);
    if (!response.ok) {
      connectionStatusCache = { chatId, connected: false, autoSync: false, timestamp: Date.now() };
      return connectionStatusCache;
    }
    const status = await response.json() as {
      connected?: boolean;
      autoSync?: boolean;
      branch?: string;
    };
    connectionStatusCache = {
      chatId,
      connected: status.connected || false,
      autoSync: status.autoSync || false,
      branch: status.branch,
      timestamp: Date.now()
    };
    return connectionStatusCache;
  } catch {
    // Network error - cache as not connected to prevent spam
    connectionStatusCache = { chatId, connected: false, autoSync: false, timestamp: Date.now() };
    return connectionStatusCache;
  }
}

async function flushPendingFiles(chatId: string) {
  if (pendingFiles.size === 0) return;

  const files = Array.from(pendingFiles.values());
  pendingFiles.clear();

  const status = await getConnectionStatus(chatId);
  if (!status.connected || !status.autoSync) {
    return;
  }

  try {
    const message = `Update ${files.length} file${files.length > 1 ? 's' : ''} via Recoder AI`;

    const response = await fetch(`/api/chat/${chatId}/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'push',
        files,
        message,
        branch: status.branch
      })
    });

    if (response.ok) {
      // console.log(`✅ Auto-synced ${files.length} files to GitHub`);
    }
  } catch (error) {
    console.error('Failed to auto-sync to GitHub:', error);
  }
}

export async function autoSyncToGitHub(chatId: string | null, files: Array<{ path: string; content: string }>) {
  const id = chatId || getChatIdFromUrl();
  if (!id) return;

  // Add files to pending map (dedupes by path)
  for (const file of files) {
    pendingFiles.set(file.path, file);
  }

  // Clear existing timer and set new one
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushPendingFiles(id);
  }, DEBOUNCE_MS);
}

// Clear cache when connection changes
export function clearGitHubSyncCache() {
  connectionStatusCache = null;
}
