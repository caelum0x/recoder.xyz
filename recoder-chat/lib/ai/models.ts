import { getLocalChatModel, getLocalTitleModel, getLocalReasoningModel, getLocalArtifactModel } from './local-first-providers';

export const DEFAULT_CHAT_MODEL: string = 'local-chat-model';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'local-chat-model',
    name: 'Local AI Chat',
    description: 'Local AI model (Ollama/LM Studio) - FREE',
  },
  {
    id: 'local-reasoning-model',
    name: 'Local Reasoning',
    description: 'Local AI for reasoning tasks - FREE',
  },
];

// Model functions
export async function chatModel() {
  return await getLocalChatModel();
}

export async function titleModel() {
  return await getLocalTitleModel();
}

export async function reasoningModel() {
  return await getLocalReasoningModel();
}

export async function artifactModel() {
  return await getLocalArtifactModel();
}
