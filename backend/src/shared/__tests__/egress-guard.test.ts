import { describe, it, expect } from 'vitest';
import {
  assertEgressAllowed,
  assertEgressAllowedResolved,
  classifyIp,
  EgressBlockedError,
  type HostResolver,
} from '../egress-guard.js';

describe('classifyIp', () => {
  it('classifies IPv4 ranges', () => {
    expect(classifyIp('8.8.8.8')).toBe('public');
    expect(classifyIp('127.0.0.1')).toBe('loopback');
    expect(classifyIp('10.0.0.5')).toBe('private');
    expect(classifyIp('172.16.0.1')).toBe('private');
    expect(classifyIp('172.31.255.255')).toBe('private');
    expect(classifyIp('172.32.0.1')).toBe('public'); // just outside 172.16/12
    expect(classifyIp('192.168.1.1')).toBe('private');
    expect(classifyIp('100.64.0.1')).toBe('private'); // CGNAT
    expect(classifyIp('169.254.1.1')).toBe('link-local');
    expect(classifyIp('169.254.169.254')).toBe('metadata');
    expect(classifyIp('0.0.0.0')).toBe('unspecified');
  });

  it('classifies IPv6 ranges incl. v4-mapped', () => {
    expect(classifyIp('2606:4700:4700::1111')).toBe('public');
    expect(classifyIp('::1')).toBe('loopback');
    expect(classifyIp('fe80::1')).toBe('link-local');
    expect(classifyIp('fd12:3456::1')).toBe('private');
    expect(classifyIp('::ffff:127.0.0.1')).toBe('loopback');
    expect(classifyIp('::ffff:10.0.0.1')).toBe('private');
  });

  it('returns invalid for non-IP input', () => {
    expect(classifyIp('not-an-ip')).toBe('invalid');
    expect(classifyIp('999.1.1.1')).toBe('invalid');
  });
});

describe('assertEgressAllowed (sync)', () => {
  it('allows a public http(s) URL and returns the parsed URL', () => {
    expect(assertEgressAllowed('https://api.example.com/x').hostname).toBe('api.example.com');
    expect(assertEgressAllowed('http://8.8.8.8/probe').hostname).toBe('8.8.8.8');
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of ['file:///etc/passwd', 'gopher://x', 'ftp://h/f', 'data:text/plain,hi']) {
      expect(() => assertEgressAllowed(u)).toThrow(EgressBlockedError);
    }
  });

  it('rejects literal loopback / private / link-local / metadata IPs', () => {
    for (const u of [
      'http://127.0.0.1:3100/',
      'http://[::1]/',
      'http://10.1.2.3/',
      'http://192.168.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::ffff:127.0.0.1]/',
    ]) {
      expect(() => assertEgressAllowed(u), u).toThrow(EgressBlockedError);
    }
  });

  it('rejects localhost-family + metadata hostnames', () => {
    for (const u of ['http://localhost/', 'http://foo.localhost/', 'http://metadata.google.internal/']) {
      expect(() => assertEgressAllowed(u), u).toThrow(/blocked host class/);
    }
  });

  it('rejects an unparseable url', () => {
    expect(() => assertEgressAllowed('http://')).toThrow(EgressBlockedError);
  });

  it('does NOT block a public hostname synchronously (resolution unknown)', () => {
    expect(assertEgressAllowed('https://internal-looking.example.com/').hostname).toBe('internal-looking.example.com');
  });
});

describe('assertEgressAllowedResolved (async, DNS re-check)', () => {
  const resolver = (map: Record<string, string[]>): HostResolver => async (h) => map[h] ?? [];

  it('allows a hostname that resolves to a public address', async () => {
    const r = resolver({ 'api.example.com': ['93.184.216.34'] });
    await expect(assertEgressAllowedResolved('https://api.example.com/', r)).resolves.toMatchObject({
      hostname: 'api.example.com',
    });
  });

  it('BLOCKS a public hostname that resolves into metadata/private space (DNS rebinding)', async () => {
    const r = resolver({ 'evil.example.com': ['169.254.169.254'], 'sneaky.example.com': ['10.0.0.9'] });
    await expect(assertEgressAllowedResolved('https://evil.example.com/', r)).rejects.toThrow(/blocked address/);
    await expect(assertEgressAllowedResolved('https://sneaky.example.com/', r)).rejects.toThrow(EgressBlockedError);
  });

  it('blocks when ANY resolved address is non-public', async () => {
    const r = resolver({ 'mixed.example.com': ['8.8.8.8', '127.0.0.1'] });
    await expect(assertEgressAllowedResolved('https://mixed.example.com/', r)).rejects.toThrow(/blocked address/);
  });

  it('blocks a host that does not resolve, and a resolver fault', async () => {
    await expect(assertEgressAllowedResolved('https://nxdomain.example/', resolver({}))).rejects.toThrow(/did not resolve/);
    const throwing: HostResolver = async () => {
      throw new Error('dns down');
    };
    await expect(assertEgressAllowedResolved('https://x.example/', throwing)).rejects.toThrow(/dns resolution failed/);
  });

  it('still enforces the sync checks (scheme + literal IP) before resolving', async () => {
    const r = resolver({});
    await expect(assertEgressAllowedResolved('file:///etc/passwd', r)).rejects.toThrow(EgressBlockedError);
    await expect(assertEgressAllowedResolved('http://127.0.0.1/', r)).rejects.toThrow(/blocked ip class/);
  });
});
