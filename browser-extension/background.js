/**
 * Recoder.xyz AI Code Assistant - Background Script
 * Handles communication between the web app, local AI services, and GitHub API
 */

// Local AI endpoints
const OLLAMA_BASE_URL = 'http://localhost:11434';
const LM_STUDIO_BASE_URL = 'http://localhost:1234';

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const RECODER_API_BASE = 'https://recoder.xyz/api';

// Store connection status
let connectionStatus = {
  ollama: false,
  lmStudio: false,
  lastCheck: 0
};

// GitHub API token storage
let githubToken = null;
let currentUser = null;

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
 * GitHub API Functions
 */

/**
 * Initialize GitHub token from storage
 */
async function initializeGitHubToken() {
  try {
    const stored = await chrome.storage.sync.get(['githubToken', 'githubUser']);
    githubToken = stored.githubToken;
    currentUser = stored.githubUser;
  } catch (error) {
    console.warn('Failed to initialize GitHub token from storage:', error);
  }
}

/**
 * Make GitHub API request
 */
async function makeGitHubRequest(endpoint, options = {}) {
  if (!githubToken) {
    throw new Error('GitHub token not configured');
  }

  const url = `${GITHUB_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Recoder-Extension/2.0',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Make Recoder API request for AI features
 */
async function makeRecoderAIRequest(endpoint, data) {
  try {
    const response = await fetch(`${RECODER_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Recoder API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Fallback to local AI if available
    return await fallbackToLocalAI(data);
  }
}

/**
 * Fallback to local AI when cloud API is unavailable
 */
async function fallbackToLocalAI(data) {
  const status = await testLocalConnections();
  
  if (status.ollama) {
    return await processWithOllama(data);
  } else if (status.lmStudio) {
    return await processWithLMStudio(data);
  } else {
    throw new Error('No AI providers available');
  }
}

/**
 * Process AI request with Ollama
 */
async function processWithOllama(data) {
  const prompt = formatPromptForAI(data);
  
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5-coder:7b',
      prompt: prompt,
      stream: false,
      options: { temperature: 0.1 }
    })
  });

  const result = await response.json();
  return { success: true, data: result.response };
}

/**
 * Process AI request with LM Studio
 */
async function processWithLMStudio(data) {
  const prompt = formatPromptForAI(data);
  
  const response = await fetch(`${LM_STUDIO_BASE_URL}/v1/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt,
      max_tokens: 2000,
      temperature: 0.1
    })
  });

  const result = await response.json();
  return { success: true, data: result.choices[0]?.text || '' };
}

/**
 * Format prompt for AI processing
 */
function formatPromptForAI(data) {
  switch (data.type) {
    case 'analyze':
      return `Analyze this code and provide insights:\n\n${data.code}`;
    case 'optimize':
      return `Optimize this ${data.language} code:\n\n${data.code}`;
    case 'review':
      return `Review this ${data.language} code for bugs and improvements:\n\n${data.code}`;
    case 'explain':
      return `Explain what this ${data.language} code does:\n\n${data.code}`;
    case 'generate':
      return `Generate ${data.language} code for: ${data.prompt}`;
    case 'docs':
      return `Generate documentation for this ${data.language} code:\n\n${data.code}`;
    case 'tests':
      return `Generate ${data.framework} tests for this ${data.language} code:\n\n${data.code}`;
    case 'security':
      return `Scan this ${data.language} code for security vulnerabilities:\n\n${data.code}`;
    case 'fix':
      return `Fix this bug in ${data.language} code:\n\nError: ${data.error}\n\nCode:\n${data.code}`;
    default:
      return data.prompt || data.code || '';
  }
}

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // Local AI messages
    case 'TEST_LOCAL_AI':
      testLocalConnections().then(sendResponse);
      return true;

    case 'PROXY_LOCAL_AI':
      proxyLocalAIRequest(message.request).then(sendResponse);
      return true;

    case 'GET_STATUS':
      sendResponse(connectionStatus);
      break;

    case 'GET_RECODER_STATUS':
      getRecoderStatus().then(sendResponse);
      return true;

    // GitHub API messages
    case 'GITHUB_SET_TOKEN':
      setGitHubToken(message.token).then(sendResponse);
      return true;

    case 'GITHUB_GET_USER':
      getCurrentGitHubUser().then(sendResponse);
      return true;

    case 'GITHUB_GET_REPO':
      getGitHubRepository(message.owner, message.repo).then(sendResponse);
      return true;

    case 'GITHUB_CREATE_REPO':
      createGitHubRepository(message.repoData).then(sendResponse);
      return true;

    case 'GITHUB_GET_FILE':
      getGitHubFile(message.owner, message.repo, message.path, message.ref).then(sendResponse);
      return true;

    case 'GITHUB_UPDATE_FILE':
      updateGitHubFile(message.owner, message.repo, message.path, message.content, message.message, message.sha).then(sendResponse);
      return true;

    // AI processing messages
    case 'AI_ANALYZE_REPO':
      analyzeRepositoryWithAI(message.owner, message.repo, message.options).then(sendResponse);
      return true;

    case 'AI_GENERATE_CODE':
      generateCodeWithAI(message.prompt, message.context).then(sendResponse);
      return true;

    case 'AI_REVIEW_CODE':
      reviewCodeWithAI(message.code, message.language, message.options).then(sendResponse);
      return true;

    case 'AI_OPTIMIZE_CODE':
      optimizeCodeWithAI(message.code, message.language, message.options).then(sendResponse);
      return true;

    case 'AI_GENERATE_DOCS':
      generateDocsWithAI(message.code, message.language, message.options).then(sendResponse);
      return true;

    case 'AI_FIX_BUGS':
      fixBugsWithAI(message.code, message.error, message.language, message.options).then(sendResponse);
      return true;

    case 'AI_EXPLAIN_CODE':
      explainCodeWithAI(message.code, message.language, message.options).then(sendResponse);
      return true;

    case 'AI_GENERATE_TESTS':
      generateTestsWithAI(message.code, message.language, message.framework, message.options).then(sendResponse);
      return true;

    case 'AI_SECURITY_SCAN':
      scanSecurityWithAI(message.code, message.language, message.options).then(sendResponse);
      return true;

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

/**
 * GitHub API Implementation Functions
 */

async function getRecoderStatus() {
  const localStatus = await testLocalConnections();
  return {
    localAI: localStatus.ollama || localStatus.lmStudio,
    cloudAI: true, // Assume cloud AI is always available for now
    githubToken: !!githubToken
  };
}

async function setGitHubToken(token) {
  githubToken = token;
  await chrome.storage.sync.set({ githubToken: token });
  
  // Get user info with new token
  try {
    currentUser = await makeGitHubRequest('/user');
    await chrome.storage.sync.set({ githubUser: currentUser });
    return { success: true, user: currentUser };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCurrentGitHubUser() {
  try {
    if (!currentUser && githubToken) {
      currentUser = await makeGitHubRequest('/user');
    }
    return { success: true, user: currentUser };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getGitHubRepository(owner, repo) {
  try {
    const repository = await makeGitHubRequest(`/repos/${owner}/${repo}`);
    return { success: true, data: repository };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createGitHubRepository(repoData) {
  try {
    const repository = await makeGitHubRequest('/user/repos', {
      method: 'POST',
      body: JSON.stringify(repoData)
    });
    return { success: true, data: repository };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getGitHubFile(owner, repo, path, ref = 'main') {
  try {
    const file = await makeGitHubRequest(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);
    return { success: true, data: file };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateGitHubFile(owner, repo, path, content, message, sha = null) {
  try {
    const data = {
      message,
      content: btoa(content), // Base64 encode
    };
    if (sha) {
      data.sha = sha;
    }

    const result = await makeGitHubRequest(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * AI Processing Implementation Functions
 */

async function analyzeRepositoryWithAI(owner, repo, options) {
  try {
    const data = { type: 'analyze', owner, repo, ...options };
    const result = await makeRecoderAIRequest('/ai/analyze-repo', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function generateCodeWithAI(prompt, context) {
  try {
    const data = { type: 'generate', prompt, context };
    const result = await makeRecoderAIRequest('/ai/generate', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function reviewCodeWithAI(code, language, options) {
  try {
    const data = { type: 'review', code, language, ...options };
    const result = await makeRecoderAIRequest('/ai/review', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function optimizeCodeWithAI(code, language, options) {
  try {
    const data = { type: 'optimize', code, language, ...options };
    const result = await makeRecoderAIRequest('/ai/optimize', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function generateDocsWithAI(code, language, options) {
  try {
    const data = { type: 'docs', code, language, ...options };
    const result = await makeRecoderAIRequest('/ai/docs', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function fixBugsWithAI(code, error, language, options) {
  try {
    const data = { type: 'fix', code, error, language, ...options };
    const result = await makeRecoderAIRequest('/ai/fix', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function explainCodeWithAI(code, language, options) {
  try {
    const data = { type: 'explain', code, language, ...options };
    const result = await makeRecoderAIRequest('/ai/explain', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function generateTestsWithAI(code, language, framework, options) {
  try {
    const data = { type: 'tests', code, language, framework, ...options };
    const result = await makeRecoderAIRequest('/ai/tests', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function scanSecurityWithAI(code, language, options) {
  try {
    const data = { type: 'security', code, language, ...options };
    const result = await makeRecoderAIRequest('/ai/security', data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Context Menu Setup
 */
function setupContextMenus() {
  chrome.contextMenus.create({
    id: 'recoder-analyze-code',
    title: '🤖 Analyze with Recoder AI',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'recoder-explain-code',
    title: '📖 Explain Code',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'recoder-optimize-code',
    title: '⚡ Optimize Code',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'recoder-generate-tests',
    title: '🧪 Generate Tests',
    contexts: ['selection']
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;
  if (!selectedText) return;

  switch (info.menuItemId) {
    case 'recoder-analyze-code':
      handleContextMenuAnalysis(selectedText, tab);
      break;
    case 'recoder-explain-code':
      handleContextMenuExplanation(selectedText, tab);
      break;
    case 'recoder-optimize-code':
      handleContextMenuOptimization(selectedText, tab);
      break;
    case 'recoder-generate-tests':
      handleContextMenuTests(selectedText, tab);
      break;
  }
});

async function handleContextMenuAnalysis(code, tab) {
  try {
    const result = await reviewCodeWithAI(code, 'javascript');
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_AI_RESULT',
      title: 'Code Analysis',
      content: result.data
    });
  } catch (error) {
    console.error('Context menu analysis error:', error);
  }
}

async function handleContextMenuExplanation(code, tab) {
  try {
    const result = await explainCodeWithAI(code, 'javascript');
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_AI_RESULT',
      title: 'Code Explanation',
      content: result.data
    });
  } catch (error) {
    console.error('Context menu explanation error:', error);
  }
}

async function handleContextMenuOptimization(code, tab) {
  try {
    const result = await optimizeCodeWithAI(code, 'javascript');
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_AI_RESULT',
      title: 'Code Optimization',
      content: result.data
    });
  } catch (error) {
    console.error('Context menu optimization error:', error);
  }
}

async function handleContextMenuTests(code, tab) {
  try {
    const result = await generateTestsWithAI(code, 'javascript', 'jest');
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_AI_RESULT',
      title: 'Generated Tests',
      content: result.data
    });
  } catch (error) {
    console.error('Context menu test generation error:', error);
  }
}

// Initialize extension
chrome.runtime.onStartup.addListener(async () => {
  await initializeGitHubToken();
  setupContextMenus();
  updateBadge();
});

chrome.runtime.onInstalled.addListener(async () => {
  await initializeGitHubToken();
  setupContextMenus();
  updateBadge();
});

// Update badge periodically
setInterval(updateBadge, 60000); // Every minute

// Initial badge update
updateBadge();