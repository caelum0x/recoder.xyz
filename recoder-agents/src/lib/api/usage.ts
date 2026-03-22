import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// Usage log types

export interface UsageLogEntry {
  message_id: string;
  thread_id: string;
  created_at: string;
  content: {
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
    };
    model: string;
  };
  total_tokens: number;
  estimated_cost: number | string;
  project_id: string;
  credit_used?: number;
  payment_method?: 'credits' | 'subscription';
  was_over_limit?: boolean;
}

export interface UsageLogsResponse {
  logs: UsageLogEntry[];
  has_more: boolean;
  total_count?: number;
}

export interface UsageHistoryResponse {
  usage_history: Array<{
    date: string;
    total: number;
  }>;
  total_usage: number;
  period_days: number;
  period_start: string;
}

export interface TransactionsSummaryResponse {
  total_spent: number;
  total_added: number;
  by_type: Record<string, { total: number; count: number }>;
  period_days: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function getUsageLogs(
  limit: number = 50,
  offset: number = 0,
): Promise<UsageLogsResponse> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    const response = await backendApi.get<{
      usage_records: Array<{
        id: string;
        amount: number;
        description: string;
        created_at: string;
        message_id?: string;
        thread_id?: string;
        model?: string;
        tokens?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
      pagination: { total: number; has_more: boolean };
    }>(`/billing/credit-usage?${params.toString()}`, { showErrors: true });

    if (response.error) throw new Error(response.error.message);

    const data = response.data!;
    const logs: UsageLogEntry[] = data.usage_records.map((record) => ({
      message_id: record.message_id || record.id,
      thread_id: record.thread_id || '',
      created_at: record.created_at,
      content: {
        usage: {
          prompt_tokens: record.tokens?.prompt_tokens || 0,
          completion_tokens: record.tokens?.completion_tokens || 0,
        },
        model: record.model || '',
      },
      total_tokens:
        (record.tokens?.prompt_tokens || 0) +
        (record.tokens?.completion_tokens || 0),
      estimated_cost: record.amount,
      project_id: '',
      credit_used: record.amount,
      payment_method: 'credits' as const,
    }));

    return {
      logs,
      has_more: data.pagination.has_more,
      total_count: data.pagination.total,
    };
  } catch (error) {
    handleApiError(error, { operation: 'get usage logs', resource: 'usage' });
    throw error;
  }
}

async function getUsageHistory(
  days: number = 30,
): Promise<UsageHistoryResponse> {
  try {
    const response = await backendApi.get<UsageHistoryResponse>(
      `/billing/usage-history?days=${days}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, {
      operation: 'get usage history',
      resource: 'usage',
    });
    throw error;
  }
}

async function getTransactionsSummary(
  days: number = 30,
): Promise<TransactionsSummaryResponse> {
  try {
    const response = await backendApi.get<TransactionsSummaryResponse>(
      `/billing/transactions/summary?days=${days}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, {
      operation: 'get transactions summary',
      resource: 'usage',
    });
    throw error;
  }
}

export const usageApi = {
  getUsageLogs,
  getUsageHistory,
  getTransactionsSummary,
};
