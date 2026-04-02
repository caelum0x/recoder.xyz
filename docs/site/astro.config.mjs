import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Recoder Docs',
      social: {
        github: 'https://github.com/recoder-xyz/recoder',
      },
      sidebar: [
        { label: 'Getting Started', autogenerate: { directory: 'getting-started' } },
        { label: 'A2A Protocol', autogenerate: { directory: 'a2a' } },
        { label: 'MCP Tools', autogenerate: { directory: 'mcp-tools' } },
        { label: 'API Reference', autogenerate: { directory: 'api-reference' } },
        { label: 'BYOK Setup', autogenerate: { directory: 'byok' } },
        { label: 'Self-Hosting', autogenerate: { directory: 'self-hosting' } },
      ],
    }),
  ],
});
