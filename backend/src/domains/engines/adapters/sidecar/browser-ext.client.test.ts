/**
 * Tests for `BrowserExtClient` — the deep-browsing HTTP client. Covers: honest
 * degrade with no live sidecar URL (`unavailable`, no fetch attempted), boundary
 * validation (`bad_input`), the camelCase→snake_case body translation the Python
 * sidecar expects, and the HTTP status → invoke-code mapping (503→unavailable,
 * 4xx→bad_input, 5xx→browser_error, transport throw→transport).
 */
import { describe, it, expect } from 'vitest';
import { BrowserExtClient } from './browser-ext.client.js';

/** A fetch stub that records calls and answers with a fixed status/body. */
function fetchStub(status: number, body: unknown) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl = async (url: string, init: { method: string; body: string }) => {
    calls.push({ url, method: init.method, body: init.body });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

function client(url: string | null, status = 200, body: unknown = { ok: true }) {
  const { calls, fetchImpl } = fetchStub(status, body);
  return { calls, adapter: new BrowserExtClient({ resolveUrl: () => url, fetch: fetchImpl }) };
}

describe('BrowserExtClient — degrade', () => {
  it('extract_structured is unavailable with no live sidecar (no fetch attempted)', async () => {
    const { calls, adapter } = client(null);
    const res = await adapter.extractStructured({ url: 'https://x', fields: { t: 'h1' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('run_task is unavailable with no live sidecar', async () => {
    const { adapter } = client(null);
    const res = await adapter.runTask({ task: 'do a thing' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unavailable');
  });
});

describe('BrowserExtClient — boundary validation', () => {
  it('rejects extract_structured without fields', async () => {
    const { calls, adapter } = client('http://127.0.0.1:8897');
    const res = await adapter.extractStructured({ url: 'https://x', fields: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
    expect(calls).toHaveLength(0);
  });

  it('rejects fill_form with an empty fields array', async () => {
    const { adapter } = client('http://127.0.0.1:8897');
    const res = await adapter.fillForm({ url: 'https://x', fields: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });

  it('rejects a fill_form field missing a selector', async () => {
    const { adapter } = client('http://127.0.0.1:8897');
    const res = await adapter.fillForm({ url: 'https://x', fields: [{ selector: '', value: 'v' }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });
});

describe('BrowserExtClient — body translation + routing', () => {
  it('run_task POSTs to /run_task with snake_case max_steps', async () => {
    const { calls, adapter } = client('http://127.0.0.1:8897', 200, { done: true });
    const res = await adapter.runTask({ task: 'summarize', maxSteps: 12 });
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe('http://127.0.0.1:8897/run_task');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ task: 'summarize', max_steps: 12 });
  });

  it('screenshot_annotate POSTs full_page + max_elements snake_case', async () => {
    const { calls, adapter } = client('http://127.0.0.1:8897', 200, { annotations: [] });
    await adapter.screenshotAnnotate({ url: 'https://x', fullPage: true, maxElements: 20 });
    expect(calls[0]?.url).toBe('http://127.0.0.1:8897/screenshot_annotate');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ url: 'https://x', full_page: true, max_elements: 20 });
  });

  it('extract_structured POSTs the fields map verbatim', async () => {
    const { calls, adapter } = client('http://127.0.0.1:8897', 200, { data: { t: 'Hi' } });
    const res = await adapter.extractStructured({ url: 'https://x', fields: { t: 'h1', links: { selector: 'a', all: true } } });
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe('http://127.0.0.1:8897/extract_structured');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      url: 'https://x',
      fields: { t: 'h1', links: { selector: 'a', all: true } },
    });
  });
});

describe('BrowserExtClient — HTTP status mapping', () => {
  it('maps 503 (browser/LLM absent) to unavailable with the sidecar reason', async () => {
    const { adapter } = client('http://127.0.0.1:8897', 503, { error: 'no LLM key configured' });
    const res = await adapter.runTask({ task: 'x' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('unavailable');
      expect(res.reason).toContain('no LLM key');
    }
  });

  it('maps 4xx to bad_input', async () => {
    const { adapter } = client('http://127.0.0.1:8897', 400, { error: 'expected url' });
    const res = await adapter.screenshotAnnotate({ url: 'https://x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });

  it('maps 5xx to browser_error', async () => {
    const { adapter } = client('http://127.0.0.1:8897', 500, { error: 'boom' });
    const res = await adapter.fillForm({ url: 'https://x', fields: [{ selector: '#q', value: 'v' }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('browser_error');
  });

  it('maps a transport throw to transport', async () => {
    const throwing = new BrowserExtClient({
      resolveUrl: () => 'http://127.0.0.1:8897',
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const res = await throwing.extractStructured({ url: 'https://x', fields: { t: 'h1' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('transport');
  });
});
