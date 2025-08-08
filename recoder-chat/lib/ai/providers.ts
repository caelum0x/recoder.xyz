/**
 * AI Providers - Now with Local-First Priority!
 * 🆓 FREE: Ollama, LM Studio (local models)
 * 💰 PREMIUM: Claude, Groq, OpenAI, xAI (cloud APIs)
 */

import { localAI } from './local-first-providers';
import { chatModel, titleModel, reasoningModel, artifactModel } from './models';

// Export the local-first provider
export const myProvider = {
  chat: chatModel,
  title: titleModel,
  reasoning: reasoningModel,
  artifact: artifactModel,
};

// Export utility functions for the UI
export function getProviderStatus() {
  return localAI.testConnections();
}

export function getSetupInstructions() {
  return {
    ollama: {
      name: 'Ollama',
      url: 'https://ollama.ai',
      install: 'Download and install Ollama',
      setup: ['Run: ollama pull qwen2.5-coder:7b', 'Start: ollama serve'],
    },
    lmStudio: {
      name: 'LM Studio',
      url: 'https://lmstudio.ai',
      install: 'Download and install LM Studio',
      setup: ['Load a model', 'Start the local server'],
    },
  };
}
