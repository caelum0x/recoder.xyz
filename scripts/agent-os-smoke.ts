const baseUrl = process.env.RECODER_AGENT_OS_URL ?? 'http://localhost:3002';

async function get(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: process.env.RECODER_API_TOKEN
      ? { authorization: `Bearer ${process.env.RECODER_API_TOKEN}` }
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json();
}

const health = await get('/api/agent-os/health');
const agents = await get('/api/agent-os/agents');
const spaces = await get('/api/agent-os/spaces');
const mcp = await get('/api/mcp');

console.log(JSON.stringify({
  ok: true,
  health: health.data?.status,
  agents: Array.isArray(agents.data) ? agents.data.length : 0,
  spaces: Array.isArray(spaces.data) ? spaces.data.length : 0,
  mcp,
}, null, 2));
