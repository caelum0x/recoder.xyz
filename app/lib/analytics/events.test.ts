import { describe, it, expect } from 'vitest';
import { AnalyticsEvents } from './events';

/**
 * These event names are the funnel contract: dashboards, log queries, and the
 * admin KPI route all key off these exact strings. Renaming one silently
 * breaks reporting, so pin the values here.
 */
describe('AnalyticsEvents lead-capture taxonomy', () => {
  it('exposes the dedicated lead-capture events with stable names', () => {
    expect(AnalyticsEvents.LEAD_CAPTURE_SUBMITTED).toBe('lead_capture_submitted');
    expect(AnalyticsEvents.LEAD_CAPTURE_SUCCEEDED).toBe('lead_capture_succeeded');
    expect(AnalyticsEvents.LEAD_CAPTURE_FAILED).toBe('lead_capture_failed');
    expect(AnalyticsEvents.LEAD_CONVERTED_TO_SIGNUP).toBe('lead_converted_to_signup');
  });

  it('keeps every event name unique', () => {
    const values = Object.values(AnalyticsEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});
