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
    version: '1.0.0-beta',
    date: 'December 2025',
    title: 'Public Beta Launch',
    summary: 'Recoder.xyz public beta with the Spaces, CLI, and multi-model foundation.',
    changes: [
      { type: 'feature', text: 'Spaces with full AI integration' },
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
    summary: 'First internal alpha for the public-site Spaces and CLI experience.',
    changes: [
      { type: 'feature', text: 'Initial Spaces implementation' },
      { type: 'feature', text: 'Basic CLI functionality' },
      { type: 'feature', text: 'User authentication system' },
      { type: 'fix', text: 'Various stability improvements' },
    ],
  },
];
