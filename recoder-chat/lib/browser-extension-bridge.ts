/**
 * Browser Extension Bridge for Recoder Chat
 * Seamlessly connects to the Recoder Local AI Bridge extension
 */

interface ExtensionAPI {
  isReady(): boolean;
  testConnections(): Promise<{ ollama: boolean; lmStudio: boolean }>;
  getStatus(): Promise<{ ollama: boolean; lmStudio: boolean }>;
  chatCompletion(messages: Array<{ role: string; content: string }>, options?: any): Promise<string>;
  generateWithOllama(model: string, prompt: string, options?: any): Promise<string>;
  generateWithLMStudio(prompt: string, options?: any): Promise<string>;
  listModels(): Promise<Array<{ provider: string; name: string; size?: number }>>;
}

declare global {
  interface Window {
    RecoderLocalAI?: ExtensionAPI;
  }
}

export class BrowserExtensionBridge {
  private isExtensionReady = false;
  private extensionAPI?: ExtensionAPI;
  private statusCache: { ollama: boolean; lmStudio: boolean } | null = null;
  private lastStatusCheck = 0;

  constructor() {
    this.initializeExtensionBridge();
  }

  /**
   * Initialize connection to browser extension
   */
  private initializeExtensionBridge() {
    // Check if extension API is already available
    if (window.RecoderLocalAI) {
      this.extensionAPI = window.RecoderLocalAI;
      this.isExtensionReady = this.extensionAPI.isReady();
      console.log('🔌 Browser extension detected:', this.isExtensionReady ? 'Ready' : 'Initializing');
    }

    // Listen for extension ready event
    window.addEventListener('recoderLocalAIReady', () => {
      this.extensionAPI = window.RecoderLocalAI;
      this.isExtensionReady = true;
      console.log('🔌 Browser extension ready for local AI access');
    });

    // Periodically check for extension
    const checkInterval = setInterval(() => {
      if (window.RecoderLocalAI && !this.isExtensionReady) {
        this.extensionAPI = window.RecoderLocalAI;
        this.isExtensionReady = this.extensionAPI.isReady();
        
        if (this.isExtensionReady) {
          clearInterval(checkInterval);
          console.log('🔌 Browser extension connected');
        }
      }
    }, 1000);

    // Stop checking after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!this.isExtensionReady) {
        console.log('⚠️ Browser extension not found. Local AI requires manual setup.');
      }
    }, 30000);
  }

  /**
   * Check if browser extension is available and ready
   */
  isReady(): boolean {
    return this.isExtensionReady && !!this.extensionAPI;
  }

  /**
   * Get local AI status (with caching)
   */
  async getStatus(): Promise<{ ollama: boolean; lmStudio: boolean; hasAny: boolean; via: 'extension' | 'unavailable' }> {
    if (!this.isReady()) {
      return { ollama: false, lmStudio: false, hasAny: false, via: 'unavailable' };
    }

    const now = Date.now();
    
    // Use cache if recent (within 30 seconds)
    if (this.statusCache && (now - this.lastStatusCheck < 30000)) {
      return {
        ...this.statusCache,
        hasAny: this.statusCache.ollama || this.statusCache.lmStudio,
        via: 'extension'
      };
    }

    try {
      const status = await this.extensionAPI!.getStatus();
      this.statusCache = status;
      this.lastStatusCheck = now;
      
      return {
        ...status,
        hasAny: status.ollama || status.lmStudio,
        via: 'extension'
      };
    } catch (error) {
      console.error('Failed to get extension status:', error);
      return { ollama: false, lmStudio: false, hasAny: false, via: 'unavailable' };
    }
  }

  /**
   * Test local AI connections
   */
  async testConnections(): Promise<{ success: boolean; ollama: boolean; lmStudio: boolean; error?: string }> {
    if (!this.isReady()) {
      return {
        success: false,
        ollama: false,
        lmStudio: false,
        error: 'Browser extension not available'
      };
    }

    try {
      const result = await this.extensionAPI!.testConnections();
      
      // Update cache
      this.statusCache = result;
      this.lastStatusCheck = Date.now();
      
      return {
        success: true,
        ollama: result.ollama,
        lmStudio: result.lmStudio
      };
    } catch (error) {
      return {
        success: false,
        ollama: false,
        lmStudio: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  /**
   * Generate AI response using local models
   */
  async generateResponse(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<{ response: string; provider: string; model: string }> {
    if (!this.isReady()) {
      throw new Error('Browser extension not available for local AI');
    }

    const status = await this.getStatus();
    
    if (!status.hasAny) {
      throw new Error('No local AI models available');
    }

    try {
      const response = await this.extensionAPI!.chatCompletion(messages, {
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        ...options
      });

      // Determine which provider was used
      let provider = 'unknown';
      let model = 'unknown';
      
      if (status.ollama) {
        provider = 'Ollama';
        model = options.model || 'qwen2.5-coder:7b';
      } else if (status.lmStudio) {
        provider = 'LM Studio';
        model = options.model || 'local-model';
      }

      return {
        response,
        provider,
        model
      };
    } catch (error) {
      throw new Error(`Local AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List available local models
   */
  async listModels(): Promise<Array<{ provider: string; name: string; size?: number }>> {
    if (!this.isReady()) {
      return [];
    }

    try {
      return await this.extensionAPI!.listModels();
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * Get setup instructions for users without extension
   */
  getSetupInstructions(): string {
    if (this.isReady()) {
      return 'Browser extension is active. Your local AI models are ready to use.';
    }

    return `
🔌 **Browser Extension Setup (Easiest)**

1. Install the Recoder Local AI Bridge extension
2. Make sure Ollama or LM Studio is running
3. Refresh this page

📋 **Manual Setup (Alternative)**

1. Install local HTTPS proxy:
   npm install -g local-ssl-proxy

2. Start HTTPS proxy for Ollama:
   local-ssl-proxy --source 11435 --target 11434

3. Set environment variable:
   NEXT_PUBLIC_OLLAMA_BASE_URL=https://localhost:11435

4. Restart your browser and refresh this page

🚀 **Easiest Option: Desktop App**

Download our desktop app for seamless local AI access without any setup.
    `.trim();
  }

  /**
   * Check if extension installation is recommended
   */
  shouldRecommendExtension(): boolean {
    return !this.isReady() && typeof window !== 'undefined' && window.location.protocol === 'https:';
  }

  /**
   * Get extension download/install information
   */
  getExtensionInfo() {
    return {
      available: false, // Will be true when published
      downloadUrl: '#', // Chrome Web Store URL when available
      githubUrl: 'https://github.com/recoder-xyz/browser-extension',
      installInstructions: `
The Recoder Local AI Bridge extension is coming soon!

**For now, you can:**
1. Build from source: Clone our GitHub repository
2. Load unpacked extension in Chrome Developer mode
3. Or use manual HTTPS proxy setup (see instructions above)
      `.trim()
    };
  }
}

// Create singleton instance
export const browserExtensionBridge = new BrowserExtensionBridge();

// Export for use in components
export default browserExtensionBridge;