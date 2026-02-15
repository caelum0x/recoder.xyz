export type PublicPromptTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface PublicPromptTaskSnapshot {
  id: string;
  projectId: string;
  status: PublicPromptTaskStatus;
  model?: string;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicTaskStreamData {
  task: PublicPromptTaskSnapshot;
}

export type PublicTaskStreamEvent =
  | { type: 'connected'; taskId: string; status: PublicPromptTaskStatus }
  | { type: 'data'; data: PublicTaskStreamData }
  | { type: 'heartbeat'; at: number }
  | { type: 'end'; status: PublicPromptTaskStatus }
  | { type: 'error'; message: string };

export interface PublicTaskStreamFrame {
  id?: string;
  event?: string;
  retry?: number;
  data: PublicTaskStreamEvent;
}

export function parsePublicTaskStreamEvent(raw: string): PublicTaskStreamEvent {
  const parsed = JSON.parse(raw) as PublicTaskStreamEvent;
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Invalid task stream event payload');
  }
  return parsed;
}

export function parsePublicTaskStreamFrame(frameRaw: string): PublicTaskStreamFrame {
  const lines = frameRaw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('id:')) {
      id = line.slice(3).trimStart();
      continue;
    }
    if (line.startsWith('event:')) {
      event = line.slice(6).trimStart();
      continue;
    }
    if (line.startsWith('retry:')) {
      const parsedRetry = Number.parseInt(line.slice(6).trimStart(), 10);
      if (Number.isFinite(parsedRetry) && parsedRetry >= 0) {
        retry = parsedRetry;
      }
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    throw new Error('SSE frame missing data line');
  }

  return {
    id,
    event,
    retry,
    data: parsePublicTaskStreamEvent(dataLines.join('\n')),
  };
}

export function serializePublicTaskStreamEvent(
  event: PublicTaskStreamEvent,
  options?: { id?: string; event?: string; retry?: number },
): string {
  const parts: string[] = [];
  if (options?.id) {
    parts.push(`id: ${options.id}`);
  }
  parts.push(`event: ${options?.event || event.type}`);
  if (typeof options?.retry === 'number' && Number.isFinite(options.retry) && options.retry >= 0) {
    parts.push(`retry: ${Math.floor(options.retry)}`);
  }
  parts.push(`data: ${JSON.stringify(event)}`);
  return `${parts.join('\n')}\n\n`;
}
