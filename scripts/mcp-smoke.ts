const baseUrl = process.env.RECODER_AGENT_OS_URL ?? 'http://localhost:3002';
const token = process.env.RECODER_API_TOKEN;

async function get(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json();
}

const [servers, tools, resources, prompts] = await Promise.all([
  get('/api/mcp/servers'),
  get('/api/mcp/tools'),
  get('/api/mcp/resources'),
  get('/api/mcp/prompts'),
]);

console.log(JSON.stringify({
  ok: true,
  servers: servers.data?.length ?? 0,
  tools: tools.data?.length ?? 0,
  resources: resources.data?.length ?? 0,
  prompts: prompts.data?.length ?? 0,
}, null, 2));
