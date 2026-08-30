import { describe, expect, it } from 'vitest';
import { APP_ENDPOINTS } from '../../services/platform-aggregator';
import { getAllProductionOrigins, getService, RECODER_SERVICES } from '../platforms';

describe('active platform registry', () => {
  it('does not expose the retired Recoder Web browser IDE', () => {
    expect(getService('web')).toBeUndefined();
    expect(RECODER_SERVICES.map((service) => service.id)).not.toContain('web');
    expect(getAllProductionOrigins()).not.toContain('https://web.recoder.xyz');
    expect(APP_ENDPOINTS.map((endpoint) => endpoint.app)).not.toContain('web');
  });
});
