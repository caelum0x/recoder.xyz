import {
  createBrowserAgentAdapter,
  createClaudeCodeAdapter,
  createCodexAdapter,
  createGeminiCliAdapter,
  createOpenCodeAdapter,
  createQwenCodeAdapter,
  createRecoderCodeAdapter,
} from '@recoder/agent-runtimes';

const adapters = [
  createClaudeCodeAdapter(),
  createCodexAdapter(),
  createRecoderCodeAdapter(),
  createOpenCodeAdapter(),
  createQwenCodeAdapter(),
  createGeminiCliAdapter(),
  createBrowserAgentAdapter(),
];

const report = await Promise.all(adapters.map(async (adapter) => ({
  id: adapter.id,
  kind: adapter.kind,
  health: await adapter.health(),
  capabilities: await adapter.capabilities(),
})));

console.log(JSON.stringify({ ok: true, adapters: report }, null, 2));
