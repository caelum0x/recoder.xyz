export interface WorkspaceTrigger {
  id: string;
  workspaceId: string;
  name?: string;
  type: 'manual' | 'schedule' | 'webhook' | 'github' | 'api';
  enabled: boolean;
  config?: Record<string, unknown>;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

const triggerStore = new Map<string, WorkspaceTrigger>();

export function generateTriggerId(): string {
  return `trg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getTrigger(triggerId: string): WorkspaceTrigger | undefined {
  return triggerStore.get(triggerId);
}

export function listTriggersForWorkspace(workspaceId: string): WorkspaceTrigger[] {
  return Array.from(triggerStore.values()).filter((trigger) => trigger.workspaceId === workspaceId);
}

export function addTrigger(trigger: WorkspaceTrigger): void {
  triggerStore.set(trigger.id, trigger);
}

export function updateTrigger(trigger: WorkspaceTrigger): void {
  triggerStore.set(trigger.id, trigger);
}

export function removeTrigger(triggerId: string): boolean {
  return triggerStore.delete(triggerId);
}

export function copyTriggersToWorkspace(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  userId: string,
): { copied: number; skipped: number; idMap: Record<string, string> } {
  const sourceTriggers = listTriggersForWorkspace(sourceWorkspaceId);
  let copied = 0;
  let skipped = 0;
  const idMap: Record<string, string> = {};

  for (const trigger of sourceTriggers) {
    if (!trigger.enabled && trigger.type !== 'manual') {
      skipped += 1;
      continue;
    }

    const now = new Date().toISOString();
    const newTriggerId = generateTriggerId();
    const metadata = { ...(trigger.metadata || {}) };
    delete (metadata as Record<string, unknown>).copiedFromTriggerId;

    addTrigger({
      ...trigger,
      id: newTriggerId,
      workspaceId: targetWorkspaceId,
      enabled: false,
      lastTriggeredAt: undefined,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...metadata,
        userId,
        copiedFromTriggerId: trigger.id,
        copiedAt: now,
      },
    });

    idMap[trigger.id] = newTriggerId;
    copied += 1;
  }

  return { copied, skipped, idMap };
}
