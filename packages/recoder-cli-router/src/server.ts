import Server from "@musistudio/llms";
import { routerEndpoint, getAvailableModels, getRouterStatus } from "./api/router-endpoint";

export const createServer = (config: any): Server => {
  const server = new Server(config);
  
  // Just return the server for now to test basic functionality
  // The routing will be handled by the @musistudio/llms package
  console.log('✅ CLI Router server created successfully');
  
  return server;
};
