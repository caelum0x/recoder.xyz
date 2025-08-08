/**
 * Recoder.xyz Local AI Bridge - Background Script
 * Handles communication between the web app and local AI services
 */

// Local AI endpoints
const OLLAMA_BASE_URL = 'http://localhost:11434';
const LM_STUDIO_BASE_URL = 'http://localhost:1234';

// Store connection status
let connectionStatus = {
  ollama: false,
  lmStudio: false,
  lastCheck: 0
};

/**
 * Test connection to local AI services
 */
async function testLocalConnections() {
  const now = Date.now();
  
  // Only check every 30 seconds to avoid spam
  if (now - connectionStatus.lastCheck < 30000) {
    return connectionStatus;
  }

  try {
    // Test Ollama
    try {
      const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      connectionStatus.ollama = ollamaResponse.ok;
    } catch (error) {
      connectionStatus.ollama = false;
    }

    // Test LM Studio
    try {
      const lmStudioResponse = await fetch(`${LM_STUDIO_BASE_URL}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      connectionStatus.lmStudio = lmStudioResponse.ok;
    } catch (error) {
      connectionStatus.lmStudio = false;
    }

    connectionStatus.lastCheck = now;
  } catch (error) {
    console.error('Error testing local AI connections:', error);
  }

  return connectionStatus;
}

/**
 * Proxy requests to local AI
 */
async function proxyLocalAIRequest(request) {
  const { provider, endpoint, method = 'POST', headers = {}, body } = request;
  
  let baseUrl;
  switch (provider) {
    case 'ollama':
      baseUrl = OLLAMA_BASE_URL;
      break;
    case 'lm-studio':
      baseUrl = LM_STUDIO_BASE_URL;
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`Error proxying to ${provider}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TEST_LOCAL_AI':
      testLocalConnections().then(sendResponse);
      return true; // Will respond asynchronously

    case 'PROXY_LOCAL_AI':
      proxyLocalAIRequest(message.request).then(sendResponse);
      return true; // Will respond asynchronously

    case 'GET_STATUS':
      sendResponse(connectionStatus);
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

/**
 * Update badge based on connection status
 */
async function updateBadge() {
  const status = await testLocalConnections();
  const hasConnection = status.ollama || status.lmStudio;
  
  chrome.action.setBadgeText({
    text: hasConnection ? '✓' : '✗'
  });
  
  chrome.action.setBadgeBackgroundColor({
    color: hasConnection ? '#10b981' : '#ef4444'
  });
}

// Check connections on startup
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);

// Update badge periodically
setInterval(updateBadge, 60000); // Every minute

// Initial badge update
updateBadge();