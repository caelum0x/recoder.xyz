import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface ForecastDataPoint {
  period: string;
  value: number;
  is_projected: boolean;
}

export interface UsageForecast {
  id: string;
  user_id: string;
  metric_type: string;
  forecast_period: string;
  historical_data: ForecastDataPoint[];
  forecast_data: ForecastDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  confidence_score: number;
  alert_threshold: number | null;
  projected_value: number | null;
  generated_at: string;
}

export interface GenerateForecastPayload {
  metric_type: string;
  forecast_period?: string;
  alert_threshold?: number;
}

export interface GenerateForecastResponse {
  forecast: UsageForecast;
  message: string;
}

export interface RecordSnapshotPayload {
  metric_type: string;
  value: number;
  period_start: string;
  period_end: string;
  metadata?: Record<string, any>;
}

export interface UsageSnapshot {
  id: string;
  user_id: string;
  metric_type: string;
  value: number;
  period_start: string;
  period_end: string;
  metadata: Record<string, any>;
  recorded_at: string;
}

export interface TrendSummary {
  metric_type: string;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  current_value: number;
  projected_value: number | null;
  change_percent: number | null;
}

export interface UsageTrendsResponse {
  trends: TrendSummary[];
  highest_growth_metric: string | null;
  projected_overages: Array<{
    metric_type: string;
    threshold: number;
    projected_value: number;
    overage_amount: number;
    overage_percent: number;
  }>;
}

export interface ForecastFilters {
  metric_type?: string;
  forecast_period?: string;
  limit?: number;
  offset?: number;
}

export interface SnapshotFilters {
  metric_type?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function generateForecast(
  payload: GenerateForecastPayload,
): Promise<GenerateForecastResponse> {
  try {
    const response = await backendApi.post<GenerateForecastResponse>(
      '/usage/forecast/generate',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'generate forecast', resource: 'usage-forecasting' });
    throw error;
  }
}

export async function listForecasts(
  filters?: ForecastFilters,
): Promise<UsageForecast[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.metric_type) params.set('metric_type', filters.metric_type);
    if (filters?.forecast_period) params.set('forecast_period', filters.forecast_period);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();

    const response = await backendApi.get<UsageForecast[]>(
      `/usage/forecasts${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list forecasts', resource: 'usage-forecasting' });
    throw error;
  }
}

export async function getForecastDetail(
  metricType: string,
  forecastPeriod: string = 'monthly',
): Promise<UsageForecast> {
  try {
    const response = await backendApi.get<UsageForecast>(
      `/usage/forecasts/${metricType}?forecast_period=${forecastPeriod}`,
      { showErrors: false, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get forecast detail', resource: 'usage-forecasting' });
    throw error;
  }
}

export async function recordSnapshot(
  payload: RecordSnapshotPayload,
): Promise<UsageSnapshot> {
  try {
    const response = await backendApi.post<UsageSnapshot>(
      '/usage/snapshots',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'record snapshot', resource: 'usage-forecasting' });
    throw error;
  }
}

export async function listSnapshots(
  filters?: SnapshotFilters,
): Promise<UsageSnapshot[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.metric_type) params.set('metric_type', filters.metric_type);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();

    const response = await backendApi.get<UsageSnapshot[]>(
      `/usage/snapshots${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list snapshots', resource: 'usage-forecasting' });
    throw error;
  }
}

export async function getUsageTrends(): Promise<UsageTrendsResponse> {
  try {
    const response = await backendApi.get<UsageTrendsResponse>(
      '/usage/trends',
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get usage trends', resource: 'usage-forecasting' });
    throw error;
  }
}
