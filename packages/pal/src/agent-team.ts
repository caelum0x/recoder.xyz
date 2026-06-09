export type RuntimeChoice =
  | 'claude_code'
  | 'codex'
  | 'recoder_code'
  | 'opencode'
  | 'qwen_code'
  | 'gemini_cli'
  | 'browser_agent';

export type AgentTeamPlan = {
  primaryRuntime: RuntimeChoice;
  reviewerRuntime?: RuntimeChoice;
  verifierRuntime?: RuntimeChoice;
};
