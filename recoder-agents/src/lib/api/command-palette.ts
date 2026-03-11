import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandHistoryEntry {
  id: string;
  user_id: string;
  command: string;
  command_type: CommandType;
  metadata: Record<string, unknown>;
  executed_at: string;
}

export interface FrequentCommand {
  command: string;
  command_type: CommandType;
  use_count: number;
  last_used: string;
}

export interface CommandPin {
  id: string;
  user_id: string;
  command: string;
  command_type: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export type CommandType = 'navigation' | 'action' | 'agent' | 'thread' | 'search' | 'setting';

export interface RecordCommandPayload {
  command: string;
  command_type: CommandType;
  metadata?: Record<string, unknown>;
}

export interface PinCommandPayload {
  command: string;
  command_type: string;
  label: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function recordCommand(payload: RecordCommandPayload): Promise<CommandHistoryEntry> {
  const response = await backendApi.post<CommandHistoryEntry>('/commands/history', payload, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getCommandHistory(limit?: number, commandType?: CommandType): Promise<CommandHistoryEntry[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (commandType) params.set('command_type', commandType);
  const qs = params.toString();

  const response = await backendApi.get<CommandHistoryEntry[]>(
    `/commands/history${qs ? `?${qs}` : ''}`,
    { showErrors: false },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getFrequentCommands(limit?: number): Promise<FrequentCommand[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();

  const response = await backendApi.get<FrequentCommand[]>(
    `/commands/frequent${qs ? `?${qs}` : ''}`,
    { showErrors: false },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function pinCommand(payload: PinCommandPayload): Promise<CommandPin> {
  const response = await backendApi.post<CommandPin>('/commands/pins', payload, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getCommandPins(): Promise<CommandPin[]> {
  const response = await backendApi.get<CommandPin[]>('/commands/pins', { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function unpinCommand(pinId: string): Promise<void> {
  const response = await backendApi.delete(`/commands/pins/${pinId}`, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
}
