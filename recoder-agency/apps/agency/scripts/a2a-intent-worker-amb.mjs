export function createAmbEmitter(options) {
  const {
    baseUrl,
    serviceId,
    disabled = false,
    fetchImpl = fetch,
  } = options;

  const normalizedBase = String(baseUrl || '').replace(/\/$/, '');
  const contextByWorkflow = new Map();

  async function ambFetch(path, init) {
    const response = await fetchImpl(`${normalizedBase}${path}`, init);
    if (!response.ok) {
      throw new Error(`AMB request failed: ${response.status} ${path}`);
    }
    return response.json();
  }

  async function ensureContext(workflowId, intent) {
    const existing = contextByWorkflow.get(workflowId);
    if (existing) return existing;

    const channelName = `workflow-${workflowId}`.slice(0, 64);
    const channelRes = await ambFetch('/api/a2a/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: channelName,
        scope: 'channel',
        memberAgentIds: [serviceId, 'a2a-worker'],
        metadata: { source: 'a2a-intent-worker', intent },
      }),
    });

    const channelId = String(channelRes?.data?.id || '');
    if (!channelId) throw new Error('AMB channel creation returned no id');

    const threadRes = await ambFetch(`/api/a2a/channels/${channelId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Worker ${intent || 'intent'}`,
        createdBy: 'a2a-worker',
      }),
    });
    const threadId = String(threadRes?.data?.id || '');
    if (!threadId) throw new Error('AMB thread creation returned no id');

    const context = { channelId, threadId };
    contextByWorkflow.set(workflowId, context);
    return context;
  }

  async function emit(workflowId, intent, text, senderAgentId = 'a2a-worker') {
    if (disabled) return false;
    if (!normalizedBase) return false;
    const context = await ensureContext(workflowId, intent);
    await ambFetch(
      `/api/a2a/channels/${context.channelId}/threads/${context.threadId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAgentId, text }),
      },
    );
    return true;
  }

  return { emit };
}
