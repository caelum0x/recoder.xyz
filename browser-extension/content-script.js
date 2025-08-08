/**
 * Recoder.xyz Local AI Bridge - Content Script
 * Injects local AI bridge into recoder.xyz web pages
 */

// Inject the bridge script into the page
function injectBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('bridge.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Inject as early as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectBridge);
} else {
  injectBridge();
}

// Listen for messages from the bridge
window.addEventListener('message', function(event) {
  // Only accept messages from the same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  // Only handle our bridge messages
  if (!event.data || !event.data.type || !event.data.type.startsWith('RECODER_BRIDGE_')) {
    return;
  }

  // Forward to background script
  chrome.runtime.sendMessage({
    type: event.data.type.replace('RECODER_BRIDGE_', ''),
    request: event.data.payload
  }, function(response) {
    // Send response back to page
    window.postMessage({
      type: 'RECODER_BRIDGE_RESPONSE',
      requestId: event.data.requestId,
      response: response
    }, '*');
  });
});

// Notify the page that the extension is active
window.postMessage({
  type: 'RECODER_EXTENSION_READY'
}, '*');

console.log('🔌 Recoder.xyz Local AI Bridge extension active');