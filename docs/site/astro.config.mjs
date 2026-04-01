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
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'A2A Protocol',
          items: [
            { label: 'Overview', slug: 'a2a/overview' },
            { label: 'Task Schema', slug: 'a2a/task-schema' },
            { label: 'WebSocket Protocol', slug: 'a2a/websocket' },
            { label: 'MCP Tools', slug: 'a2a/mcp-tools' },
          ],
        },
        {
          label: 'MCP Tools',
          items: [
            { label: 'Tool Reference', slug: 'mcp-tools/reference' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'REST API', slug: 'api-reference/rest' },
          ],
        },
        {
          label: 'BYOK Setup',
          items: [
            { label: 'Bring Your Own Key', slug: 'byok/setup' },
          ],
        },
        {
          label: 'Self-Hosting',
          items: [
            { label: 'Deployment Guide', slug: 'self-hosting/deploy' },
          ],
        },
      ],
    }),
  ],
});
