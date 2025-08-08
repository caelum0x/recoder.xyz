/**
 * Recoder.xyz Local AI Bridge
 * Provides seamless local AI access for web applications
 */

(function() {
  'use strict';

  let extensionReady = false;
  let requestCounter = 0;
  const pendingRequests = new Map();

  // Listen for extension ready signal
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'RECODER_EXTENSION_READY') {
      extensionReady = true;
      console.log('🔌 Recoder Local AI Bridge ready');
      
      // Trigger custom event for the web app
      window.dispatchEvent(new CustomEvent('recoderLocalAIReady'));
    }
    
    // Handle responses from extension
    if (event.data && event.data.type === 'RECODER_BRIDGE_RESPONSE') {
      const { requestId, response } = event.data;
      const pendingRequest = pendingRequests.get(requestId);
      
      if (pendingRequest) {
        pendingRequests.delete(requestId);
        
        if (response && response.success) {
          pendingRequest.resolve(response.data);
        } else {
          pendingRequest.reject(new Error(response?.error || 'Unknown error'));
        }
      }
    }
  });

  /**
   * Send message to extension with promise-based response
   */
  function sendMessageToExtension(type, payload) {
    return new Promise((resolve, reject) => {
      if (!extensionReady) {
        reject(new Error('Extension not ready'));
        return;
      }

      const requestId = `req_${++requestCounter}_${Date.now()}`;
      
      // Store the promise callbacks
      pendingRequests.set(requestId, { resolve, reject });
      
      // Send message
      window.postMessage({
        type: `RECODER_BRIDGE_${type}`,
        requestId,
        payload
      }, '*');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Local AI Bridge API
   */
  window.RecoderLocalAI = {
    /**
     * Check if extension is ready
     */
    isReady() {
      return extensionReady;
    },

    /**
     * Test local AI connections
     */
    async testConnections() {
      return await sendMessageToExtension('TEST_LOCAL_AI');
    },

    /**
     * Get current status
     */
    async getStatus() {
      return await sendMessageToExtension('GET_STATUS');
    },

    /**
     * Send request to Ollama
     */
    async ollama(endpoint, options = {}) {
      const { method = 'POST', headers = {}, body } = options;
      
      return await sendMessageToExtension('PROXY_LOCAL_AI', {
        provider: 'ollama',
        endpoint,
        method,
        headers,
        body
      });
    },

    /**
     * Send request to LM Studio
     */
    async lmStudio(endpoint, options = {}) {
      const { method = 'POST', headers = {}, body } = options;
      
      return await sendMessageToExtension('PROXY_LOCAL_AI', {
        provider: 'lm-studio',
        endpoint,
        method,
        headers,
        body
      });
    },

    /**
     * Generate text with Ollama
     */
    async generateWithOllama(model, prompt, options = {}) {
      try {
        const response = await this.ollama('/api/generate', {
          method: 'POST',
          body: {
            model,
            prompt,
            stream: false,
            ...options
          }
        });
        
        return response.response;
      } catch (error) {
        throw new Error(`Ollama generation failed: ${error.message}`);
      }
    },

    /**
     * Generate text with LM Studio
     */
    async generateWithLMStudio(prompt, options = {}) {
      try {
        const response = await this.lmStudio('/v1/completions', {
          method: 'POST',
          body: {
            prompt,
            max_tokens: 2000,
            temperature: 0.7,
            ...options
          }
        });
        
        return response.choices[0]?.text || '';
      } catch (error) {
        throw new Error(`LM Studio generation failed: ${error.message}`);
      }
    },

    /**
     * Chat completion with local AI
     */
    async chatCompletion(messages, options = {}) {
      const status = await this.getStatus();
      
      if (status.ollama) {
        // Use Ollama chat format
        const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        return await this.generateWithOllama('qwen2.5-coder:7b', prompt, options);
      } else if (status.lmStudio) {
        // Use LM Studio chat format
        try {
          const response = await this.lmStudio('/v1/chat/completions', {
            method: 'POST',
            body: {
              messages,
              max_tokens: 2000,
              temperature: 0.7,
              ...options
            }
          });
          
          return response.choices[0]?.message?.content || '';
        } catch (error) {
          throw new Error(`Chat completion failed: ${error.message}`);
        }
      } else {
        throw new Error('No local AI available');
      }
    },

    /**
     * List available models
     */
    async listModels() {
      const status = await this.getStatus();
      const models = [];
      
      if (status.ollama) {
        try {
          const response = await this.ollama('/api/tags');
          models.push(...response.models.map(model => ({
            provider: 'ollama',
            name: model.name,
            size: model.size
          })));
        } catch (error) {
          console.warn('Failed to get Ollama models:', error);
        }
      }
      
      if (status.lmStudio) {
        try {
          const response = await this.lmStudio('/v1/models');
          models.push(...response.data.map(model => ({
            provider: 'lm-studio',
            name: model.id,
            size: null
          })));
        } catch (error) {
          console.warn('Failed to get LM Studio models:', error);
        }
      }
      
      return models;
    }
  };

  // For debugging
  window.RecoderLocalAI.debug = {
    extensionReady,
    pendingRequests: pendingRequests.size,
    sendMessage: sendMessageToExtension
  };

  console.log('🔌 Recoder Local AI Bridge loaded');
})();