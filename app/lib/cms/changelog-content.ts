export interface ChangelogChange {
  type: string;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary?: string;
  changes: ChangelogChange[];
}

export const fallbackChangelogEntries: ChangelogEntry[] = [
  {
    version: '0.14.5',
    date: 'August 2026',
    title: 'Recoder Desktop — parallel agents, one trusted merge',
    summary:
      'The desktop console for running your own coding agents in parallel. Signed + notarized macOS (Apple Silicon) build.',
    changes: [
      { type: 'feature', text: 'Run Claude Code, Codex, Cursor & opencode in isolated git-worktree workspaces' },
      { type: 'feature', text: 'Side-by-side diff review across divergent agent runs, merge or open a PR from the console' },
      { type: 'feature', text: 'Per-workspace cost strip, live PR-status chip, checkpoints that survive restarts' },
      { type: 'feature', text: 'GitHub auto-detect: your account and repos pre-filled in the launcher' },
      { type: 'feature', text: 'BYOK — your agents, your keys; Recoder never proxies models or resells tokens' },
      { type: 'security', text: 'Governed merges: approvals, deny-biased policy, audit trail' },
    ],
  },
  {
    version: '1.0.0-beta',
    date: 'December 2025',
    title: 'Public Beta Launch',
    summary: 'Recoder.xyz public beta — the original hosted editor and CLI (since retired in the desktop pivot).',
    changes: [
      { type: 'feature', text: 'Hosted browser editor with AI integration (retired — replaced by the desktop app)' },
      { type: 'feature', text: 'CLI tool for terminal-based development' },
      { type: 'feature', text: '40+ AI model support (GPT, Claude, Gemini, Llama)' },
      { type: 'feature', text: 'Google and GitHub OAuth authentication' },
      { type: 'feature', text: 'Bring Your Own API Key model - 100% free' },
      { type: 'feature', text: 'Project management dashboard' },
      { type: 'feature', text: 'MCP (Model Context Protocol) support' },
      { type: 'security', text: 'End-to-end encryption for API keys' },
    ],
  },
  {
    version: '0.9.0-alpha',
    date: 'November 2025',
    title: 'Alpha Testing',
    summary: 'First internal alpha of the original hosted editor and CLI (since retired).',
    changes: [
      { type: 'feature', text: 'Initial hosted browser editor (retired)' },
      { type: 'feature', text: 'Basic CLI functionality' },
      { type: 'feature', text: 'User authentication system' },
      { type: 'fix', text: 'Various stability improvements' },
    ],
  },
];
