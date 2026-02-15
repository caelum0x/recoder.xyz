import { describe, expect, it } from 'vitest';
import { isDomainAllowed, parseDomainList, validateWebUrl, validateWebUrlWithDns } from './web-safety';

describe('web-safety', () => {
  it('parses domain lists from csv', () => {
    expect(parseDomainList('example.com, docs.example.com')).toEqual(['example.com', 'docs.example.com']);
  });

  it('blocks localhost/private URL access', () => {
    const localhost = validateWebUrl('http://localhost:3000');
    expect(localhost.valid).toBe(false);

    const privateIp = validateWebUrl('https://192.168.1.1');
    expect(privateIp.valid).toBe(false);
  });

  it('enforces allowed and blocked domains', () => {
    expect(isDomainAllowed('docs.example.com', { allowedDomains: ['example.com'] })).toBe(true);
    expect(isDomainAllowed('admin.example.com', { blockedDomains: ['example.com'] })).toBe(false);
    expect(isDomainAllowed('other.com', { allowedDomains: ['example.com'] })).toBe(false);
  });

  it('blocks private hosts in dns-aware validation', async () => {
    const privateIp = await validateWebUrlWithDns('https://127.0.0.1');
    expect(privateIp.valid).toBe(false);
  });
});
