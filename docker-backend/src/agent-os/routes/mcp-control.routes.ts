import { Router } from 'express';
import {
  billingMcpServer,
  browserMcpServer,
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  deploymentMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  githubMcpServer,
  logsMcpServer,
  memoryMcpServer,
  ossMcpServer,
  previewMcpServer,
  repoMcpServer,
} from '@recoder/agent-mcp';

const defaultServers = [
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  githubMcpServer,
  repoMcpServer,
  browserMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  previewMcpServer,
  logsMcpServer,
  ossMcpServer,
  deploymentMcpServer,
  billingMcpServer,
];

export function createAgentMcpRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'recoder-mcp-host',
        servers: defaultServers.length,
        tools: defaultServers.flatMap((server) => server.toolNames).length,
      },
    });
  });

  router.get('/servers', (_req, res) => {
    res.json({ success: true, data: defaultServers });
  });

  router.get('/tools', (_req, res) => {
    res.json({
      success: true,
      data: defaultServers.flatMap((server) => (
        server.toolNames.map((toolName) => ({
          serverId: server.serverId,
          kind: server.kind,
          toolName,
          enabled: server.enabled,
        }))
      )),
    });
  });

  router.get('/resources', (_req, res) => {
    res.json({
      success: true,
      data: [
        { uri: 'recoder://spaces', description: 'Recoder Agent OS spaces' },
        { uri: 'recoder://tasks', description: 'Canonical task specs and runs' },
        { uri: 'recoder://artifacts', description: 'Run artifacts and verification evidence' },
        { uri: 'recoder://memory', description: 'Reviewed memory items and candidates' },
      ],
    });
  });

  router.get('/prompts', (_req, res) => {
    res.json({
      success: true,
      data: [
        { name: 'recoder.task-spec', description: 'Create a Recoder TaskSpec from human intent' },
        { name: 'recoder.delivery-summary', description: 'Summarize artifacts, verification, approvals, and memory candidates' },
      ],
    });
  });

  router.get('/sessions', (_req, res) => {
    res.json({ success: true, data: [] });
  });

  return router;
}
