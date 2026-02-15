type UnknownRecord = Record<string, unknown>;

function ensureRecord(payload: unknown): UnknownRecord | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as UnknownRecord;
}

function ensureOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function ensureOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export type AccountDeletionStatusPayload = {
  has_pending_deletion: boolean;
  deletion_scheduled_for: string | null;
  requested_at: string | null;
  can_cancel: boolean;
};

export type RequestDeletionPayload = {
  success: boolean;
  message: string;
  deletion_scheduled_for: string;
  can_cancel: boolean;
};

export type CancelDeletionPayload = {
  success: boolean;
  message: string;
};

export type SystemStatusPayload = {
  maintenanceNotice: {
    enabled: boolean;
    startTime?: string;
    endTime?: string;
  };
  technicalIssue: {
    enabled: boolean;
    message?: string;
    statusUrl?: string;
    affectedServices?: string[];
    description?: string;
    estimatedResolution?: string;
    severity?: 'degraded' | 'outage' | 'maintenance';
  };
  updatedAt?: string;
};

export function parseApiErrorMessage(payload: unknown): string | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }
  const message = ensureOptionalString(record.message);
  if (message) {
    return message;
  }
  const detail = ensureOptionalString(record.detail);
  if (detail) {
    return detail;
  }
  return null;
}

export function parseAccountDeletionStatus(
  payload: unknown
): AccountDeletionStatusPayload | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }

  if (
    typeof record.has_pending_deletion !== 'boolean' ||
    typeof record.can_cancel !== 'boolean'
  ) {
    return null;
  }

  const deletionScheduledFor =
    record.deletion_scheduled_for === null
      ? null
      : ensureOptionalString(record.deletion_scheduled_for);
  const requestedAt =
    record.requested_at === null ? null : ensureOptionalString(record.requested_at);

  if (deletionScheduledFor === undefined || requestedAt === undefined) {
    return null;
  }

  return {
    has_pending_deletion: record.has_pending_deletion,
    deletion_scheduled_for: deletionScheduledFor,
    requested_at: requestedAt,
    can_cancel: record.can_cancel,
  };
}

export function parseRequestDeletionResponse(
  payload: unknown
): RequestDeletionPayload | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }
  if (
    typeof record.success !== 'boolean' ||
    typeof record.message !== 'string' ||
    typeof record.deletion_scheduled_for !== 'string' ||
    typeof record.can_cancel !== 'boolean'
  ) {
    return null;
  }
  return {
    success: record.success,
    message: record.message,
    deletion_scheduled_for: record.deletion_scheduled_for,
    can_cancel: record.can_cancel,
  };
}

export function parseCancelDeletionResponse(
  payload: unknown
): CancelDeletionPayload | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }
  if (typeof record.success !== 'boolean' || typeof record.message !== 'string') {
    return null;
  }
  return {
    success: record.success,
    message: record.message,
  };
}

export function parseSystemStatusPayload(payload: unknown): SystemStatusPayload | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }

  const maintenanceNotice = ensureRecord(record.maintenanceNotice);
  const technicalIssue = ensureRecord(record.technicalIssue);
  if (!maintenanceNotice || !technicalIssue) {
    return null;
  }

  if (
    typeof maintenanceNotice.enabled !== 'boolean' ||
    typeof technicalIssue.enabled !== 'boolean'
  ) {
    return null;
  }

  const affectedServicesRaw = technicalIssue.affectedServices;
  const affectedServices = Array.isArray(affectedServicesRaw)
    ? affectedServicesRaw.filter((v): v is string => typeof v === 'string')
    : undefined;

  const severityRaw = ensureOptionalString(technicalIssue.severity);
  const severity =
    severityRaw === 'degraded' || severityRaw === 'outage' || severityRaw === 'maintenance'
      ? severityRaw
      : undefined;

  return {
    maintenanceNotice: {
      enabled: maintenanceNotice.enabled,
      startTime: ensureOptionalString(maintenanceNotice.startTime),
      endTime: ensureOptionalString(maintenanceNotice.endTime),
    },
    technicalIssue: {
      enabled: technicalIssue.enabled,
      message: ensureOptionalString(technicalIssue.message),
      statusUrl: ensureOptionalString(technicalIssue.statusUrl),
      affectedServices,
      description: ensureOptionalString(technicalIssue.description),
      estimatedResolution: ensureOptionalString(technicalIssue.estimatedResolution),
      severity,
    },
    updatedAt: ensureOptionalString(record.updatedAt),
  };
}

export function parseOnboardingCompletedFlag(payload: unknown): boolean | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }
  const metadata = ensureRecord(record.metadata);
  if (!metadata) {
    return false;
  }
  const completed = ensureOptionalBoolean(metadata.onboarding_completed);
  return completed === true;
}

export type CustomMcpToolPayload = {
  name: string;
  description: string;
  parameters?: unknown;
};

export type CustomMcpResponsePayload = {
  success: boolean;
  tools: CustomMcpToolPayload[];
  serverName?: string;
  processedConfig?: unknown;
  message?: string;
};

export type ToolsMetadataPayload = {
  success: boolean;
  tools: Record<string, {
    name: string;
    display_name: string;
    description: string;
    tool_class: string;
    icon?: string;
    color?: string;
    enabled: boolean;
    is_core?: boolean;
    weight?: number;
    visible?: boolean;
    methods: Array<{
      name: string;
      display_name: string;
      description: string;
      enabled: boolean;
      is_core?: boolean;
      visible?: boolean;
    }>;
  }>;
};

export type AgentRunStatusPayload = {
  status: string;
};

export function parseCustomMcpResponse(payload: unknown): CustomMcpResponsePayload | null {
  const record = ensureRecord(payload);
  if (!record || typeof record.success !== 'boolean') {
    return null;
  }

  const toolsRaw = Array.isArray(record.tools) ? record.tools : [];
  const tools: CustomMcpToolPayload[] = [];
  for (const item of toolsRaw) {
    const tool = ensureRecord(item);
    if (!tool || typeof tool.name !== 'string' || typeof tool.description !== 'string') {
      continue;
    }
    tools.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  return {
    success: record.success,
    tools,
    serverName: ensureOptionalString(record.serverName),
    processedConfig: record.processedConfig,
    message: ensureOptionalString(record.message),
  };
}

export function parseToolsMetadataResponse(payload: unknown): ToolsMetadataPayload | null {
  const record = ensureRecord(payload);
  if (!record || typeof record.success !== 'boolean' || !Array.isArray(record.tools)) {
    return null;
  }

  const toolsObject: ToolsMetadataPayload['tools'] = {};
  for (const toolRaw of record.tools) {
    const tool = ensureRecord(toolRaw);
    if (
      !tool ||
      typeof tool.name !== 'string' ||
      typeof tool.display_name !== 'string' ||
      typeof tool.description !== 'string' ||
      typeof tool.tool_class !== 'string' ||
      typeof tool.enabled !== 'boolean'
    ) {
      continue;
    }

    const methodsRaw = Array.isArray(tool.methods) ? tool.methods : [];
    const methods = methodsRaw
      .map((methodRaw) => {
        const method = ensureRecord(methodRaw);
        if (
          !method ||
          typeof method.name !== 'string' ||
          typeof method.display_name !== 'string' ||
          typeof method.description !== 'string' ||
          typeof method.enabled !== 'boolean'
        ) {
          return null;
        }
        return {
          name: method.name,
          display_name: method.display_name,
          description: method.description,
          enabled: method.enabled,
          is_core: ensureOptionalBoolean(method.is_core),
          visible: ensureOptionalBoolean(method.visible),
        };
      })
      .filter((method): method is NonNullable<typeof method> => method !== null);

    toolsObject[tool.name] = {
      name: tool.name,
      display_name: tool.display_name,
      description: tool.description,
      tool_class: tool.tool_class,
      icon: ensureOptionalString(tool.icon),
      color: ensureOptionalString(tool.color),
      enabled: tool.enabled,
      is_core: ensureOptionalBoolean(tool.is_core),
      weight: typeof tool.weight === 'number' ? tool.weight : undefined,
      visible: ensureOptionalBoolean(tool.visible),
      methods,
    };
  }

  return {
    success: record.success,
    tools: toolsObject,
  };
}

export function parseAgentRunStatusResponse(payload: unknown): AgentRunStatusPayload | null {
  const record = ensureRecord(payload);
  if (!record || typeof record.status !== 'string') {
    return null;
  }
  return { status: record.status };
}
