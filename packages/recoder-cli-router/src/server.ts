import Server from "@musistudio/llms";
import {
  routerEndpoint,
  getAvailableModels,
  getRouterStatus,
  sandboxRunEndpoint,
  a2aListAgentsEndpoint,
  a2aListTasksEndpoint,
  a2aSendTaskEndpoint,
  a2aCreateThreadEndpoint,
} from "./api/router-endpoint";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Register sandbox and A2A endpoints on the Fastify app
  const app = (server as any).app;
  if (app && typeof app.post === 'function') {
    // Sandbox execution
    app.post('/api/sandbox/run', sandboxRunEndpoint);

    // A2A agent endpoints
    app.get('/api/a2a/agents', a2aListAgentsEndpoint);
    app.get('/api/a2a/tasks', a2aListTasksEndpoint);
    app.post('/api/a2a/tasks', a2aSendTaskEndpoint);
    app.post('/api/a2a/threads', a2aCreateThreadEndpoint);

    // Existing router endpoints
    app.post('/api/router/select', routerEndpoint);
    app.get('/api/router/models', getAvailableModels);
    app.get('/api/router/status', getRouterStatus);

    console.log('✅ CLI Router server created with sandbox + A2A endpoints');
  } else {
    console.log('✅ CLI Router server created successfully');
  }

  return server;
};
