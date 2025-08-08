/**
 * Mobile AI Providers - Local-First Architecture
 * 🆓 FREE: Ollama, LM Studio (local models with direct localhost access)
 * Mobile advantage: Direct localhost connection without HTTPS proxy
 */

import { localAI } from '../services/LocalAIIntegration';

// Mobile-first provider using LocalAIIntegration
export const mobileProvider = {
  chat: async (messages: any[], options: any = {}) => {
    return await localAI.chat(messages, options);
  },
  
  stream: async function* (messages: any[], options: any = {}) {
    yield* localAI.streamChat(messages, options);
  },

  getModels: async () => {
    return await localAI.getAvailableModels();
  },

  testConnection: async () => {
    return await localAI.testConnection();
  }
};

// Export utility functions for the UI
export function getProviderStatus() {
  return localAI.testConnection();
}

export function getSetupInstructions() {
  return `
📱 Mobile Setup Instructions:

1. Install Ollama or LM Studio on your computer
2. Start the AI service (default ports: Ollama 11434, LM Studio 1234)  
3. Make sure your mobile device is on the same network
4. The mobile app will automatically detect and connect

Mobile Advantage:
✅ Direct localhost connection (no HTTPS proxy needed)
✅ Better performance than web browsers
✅ Works on cellular networks through cloud sync
  `;
}

export default mobileProvider;