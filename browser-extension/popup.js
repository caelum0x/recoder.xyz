/**
 * Recoder.xyz Local AI Bridge - Popup Script
 */

let currentStatus = null;

// DOM elements
const loading = document.getElementById('loading');
const content = document.getElementById('content');
const statusIcon = document.getElementById('status-icon');
const ollamaDot = document.getElementById('ollama-dot');
const lmStudioDot = document.getElementById('lmstudio-dot');
const testBtn = document.getElementById('test-btn');
const refreshBtn = document.getElementById('refresh-btn');
const setupGuide = document.getElementById('setup-guide');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');

// Initialize popup
document.addEventListener('DOMContentLoaded', function() {
  loadStatus();
  
  testBtn.addEventListener('click', testConnections);
  refreshBtn.addEventListener('click', loadStatus);
});

/**
 * Load current status
 */
async function loadStatus() {
  try {
    showLoading(true);
    hideMessages();
    
    const status = await sendMessage({ type: 'GET_STATUS' });
    updateUI(status);
    currentStatus = status;
    
  } catch (error) {
    showError('Failed to load status: ' + error.message);
  } finally {
    showLoading(false);
  }
}

/**
 * Test connections
 */
async function testConnections() {
  try {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    hideMessages();
    
    const status = await sendMessage({ type: 'TEST_LOCAL_AI' });
    updateUI(status);
    currentStatus = status;
    
    if (status.ollama || status.lmStudio) {
      const providers = [];
      if (status.ollama) providers.push('Ollama');
      if (status.lmStudio) providers.push('LM Studio');
      
      showSuccess(`✅ Connected to ${providers.join(' and ')}`);
    } else {
      showError('❌ No local AI found. Check your setup.');
    }
    
  } catch (error) {
    showError('Test failed: ' + error.message);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

/**
 * Update UI based on status
 */
function updateUI(status) {
  const hasConnection = status.ollama || status.lmStudio;
  
  // Update status icon
  statusIcon.className = `status-icon ${hasConnection ? 'connected' : 'disconnected'}`;
  
  // Update provider dots
  ollamaDot.className = `provider-dot ${status.ollama ? 'available' : 'unavailable'}`;
  lmStudioDot.className = `provider-dot ${status.lmStudio ? 'available' : 'unavailable'}`;
  
  // Show/hide setup guide
  setupGuide.style.display = hasConnection ? 'none' : 'block';
}

/**
 * Show loading state
 */
function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
  content.style.display = show ? 'none' : 'block';
}

/**
 * Show success message
 */
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';
}

/**
 * Hide all messages
 */
function hideMessages() {
  successMessage.style.display = 'none';
  errorMessage.style.display = 'none';
}

/**
 * Send message to background script
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, function(response) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success !== false) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}