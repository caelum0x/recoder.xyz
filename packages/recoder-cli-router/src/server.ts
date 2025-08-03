import Server from "@musistudio/llms";
import { routerEndpoint, getAvailableModels, getRouterStatus } from "./api/router-endpoint";

export const createServer = (config: any): Server => {
  const server = new Server(config);
  
  // Register smart router endpoints
  server.post('/api/router/select', routerEndpoint);
  server.get('/api/router/models', getAvailableModels);
  server.get('/api/router/status', getRouterStatus);
  
  return server;
};
